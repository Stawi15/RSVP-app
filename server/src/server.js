import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';

import sampleRows from './sampleRows.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:Z';
const SHEET_NAME = SHEET_RANGE.includes('!') ? SHEET_RANGE.split('!')[0] : 'Sheet1';

function normalizeOrigin(origin = '') {
  return String(origin).trim().replace(/\/$/, '');
}

const configuredOrigins = (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const allowVercelPreviews = String(process.env.ALLOW_VERCEL_PREVIEWS || '').toLowerCase() === 'true';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser clients (curl, Postman, server-to-server).
      if (!origin) return callback(null, true);

      const normalizedOrigin = normalizeOrigin(origin);
      const isConfiguredOrigin = configuredOrigins.includes(normalizedOrigin);
      let isVercelPreview = false;
      if (allowVercelPreviews) {
        try {
          isVercelPreview = /\.vercel\.app$/i.test(new URL(normalizedOrigin).hostname);
        } catch (_error) {
          isVercelPreview = false;
        }
      }

      if (isConfiguredOrigin || isVercelPreview) {
        return callback(null, true);
      }

      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    }
  })
);
app.use(express.json());

function normalizeHeader(header = '') {
  return String(header).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickField(row, aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(alias));
    if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex((header) =>
    aliases.some((alias) => normalizeHeader(header) === normalizeHeader(alias))
  );
}

function toColumnLetter(index) {
  let value = index + 1;
  let letter = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    value = Math.floor((value - 1) / 26);
  }
  return letter;
}

function rowsToPeople(values) {
  if (!values || values.length < 2) return [];

  const headers = values[0].map((h) => String(h).trim());
  const registeredColumnIndex = findHeaderIndex(headers, ['registered', 'registered at', 'check in', 'checked in']);
  const rows = values.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });

  return rows
    .map((row, index) => {
      const firstName = pickField(row, ['first name', 'firstname', 'first']);
      const lastName = pickField(row, ['last name', 'lastname', 'surname', 'last']);
      const fullName = pickField(row, ['name', 'full name', 'fullname', 'attendee name', 'first and last name']);
      const registeredRaw = registeredColumnIndex >= 0 ? String(row[headers[registeredColumnIndex]] || '').trim() : '';

      return {
        rowNumber: index + 2,
        name: fullName || [firstName, lastName].filter(Boolean).join(' '),
        // Your current sheet does not include a title/job-title column.
        // If you add one later, the app will pick it up automatically.
        title: pickField(row, ['title', 'job title', 'role', 'position']),
        company: pickField(row, ['company', 'organization', 'organisation', 'employer', 'business']),
        email: pickField(row, ['email', 'email address']),
        attendanceConfirmation: pickField(row, ['attendance confirmation', 'attendance', 'confirmation', 'rsvp status']),
        registered: Boolean(registeredRaw) && registeredRaw.toLowerCase() !== 'false',
        registeredAt: registeredRaw
      };
    })
    .filter((person) => person.name || person.title || person.company);
}

function getAuthOptions({ write = false } = {}) {
  const scopes = [write ? 'https://www.googleapis.com/auth/spreadsheets' : 'https://www.googleapis.com/auth/spreadsheets.readonly'];
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    return { credentials, scopes };
  }

  return {
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
    scopes
  };
}

async function getSheetsClient({ write = false } = {}) {
  const auth = new google.auth.GoogleAuth(getAuthOptions({ write }));
  return google.sheets({ version: 'v4', auth });
}

async function getSheetValues() {
  if (!SHEET_ID) {
    console.error('[ERROR] SHEET_ID is not set.');
    return null;
  }

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_RANGE
    });

    if (!response.data || !response.data.values) {
      console.error('[ERROR] No data returned from Google Sheets API.');
      return null;
    }

    console.log('[INFO] Sheet data loaded:', JSON.stringify(response.data.values.slice(0, 5), null, 2));
    return response.data.values;
  } catch (err) {
    console.error('[ERROR] Failed to fetch sheet values:', err);
    throw err;
  }
}

async function resolveRegistrationTarget({ email, rowNumber, sheets, createColumnIfMissing = false }) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE
  });

  const values = response.data?.values || [];
  if (values.length < 2) {
    throw new Error('The sheet does not contain any attendee rows.');
  }

  const headers = values[0].map((header) => String(header || '').trim());
  const emailColumnIndex = findHeaderIndex(headers, ['email', 'email address']);
  let registeredColumnIndex = findHeaderIndex(headers, ['registered', 'registered at', 'check in', 'checked in']);

  let targetRowNumber = Number(rowNumber);
  if (!targetRowNumber && email) {
    if (emailColumnIndex < 0) {
      throw new Error('No email column was found in the sheet headers.');
    }
    const dataRows = values.slice(1);
    const rowOffset = dataRows.findIndex((row) => String(row[emailColumnIndex] || '').trim().toLowerCase() === String(email).trim().toLowerCase());
    if (rowOffset < 0) {
      throw new Error(`No attendee found for email: ${email}`);
    }
    targetRowNumber = rowOffset + 2;
  }

  if (!targetRowNumber || Number.isNaN(targetRowNumber) || targetRowNumber < 2) {
    throw new Error('A valid rowNumber or email is required.');
  }

  if (registeredColumnIndex < 0 && createColumnIfMissing) {
    registeredColumnIndex = headers.length;
    const headerCell = `${SHEET_NAME}!${toColumnLetter(registeredColumnIndex)}1`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: headerCell,
      valueInputOption: 'RAW',
      requestBody: { values: [['Registered At']] }
    });
  }

  return { targetRowNumber, registeredColumnIndex };
}

async function markRegistered({ email, rowNumber }) {
  const sheets = await getSheetsClient({ write: true });
  const { targetRowNumber, registeredColumnIndex } = await resolveRegistrationTarget({
    email,
    rowNumber,
    sheets,
    createColumnIfMissing: true
  });

  const registeredAt = new Date().toISOString();
  const targetCell = `${SHEET_NAME}!${toColumnLetter(registeredColumnIndex)}${targetRowNumber}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: targetCell,
    valueInputOption: 'RAW',
    requestBody: { values: [[registeredAt]] }
  });

  return { rowNumber: targetRowNumber, registeredAt, registered: true };
}

async function clearRegistered({ email, rowNumber }) {
  const sheets = await getSheetsClient({ write: true });
  const { targetRowNumber, registeredColumnIndex } = await resolveRegistrationTarget({
    email,
    rowNumber,
    sheets,
    createColumnIfMissing: false
  });

  if (registeredColumnIndex < 0) {
    return { rowNumber: targetRowNumber, registeredAt: '', registered: false };
  }

  const targetCell = `${SHEET_NAME}!${toColumnLetter(registeredColumnIndex)}${targetRowNumber}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: targetCell,
    valueInputOption: 'RAW',
    requestBody: { values: [['']] }
  });

  return { rowNumber: targetRowNumber, registeredAt: '', registered: false };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: SHEET_ID ? 'google-sheets' : 'sample-data' });
});

app.get('/api/rsvps', async (_req, res) => {
  try {
    const values = await getSheetValues();
    if (!values) {
      console.error('[ERROR] No values returned from getSheetValues. Sending sample data.');
      return res.json({
        source: 'sample-data',
        people: sampleRows
      });
    }

    const people = rowsToPeople(values);
    if (!people.length) {
      console.error('[ERROR] No people parsed from sheet values. Raw values:', JSON.stringify(values.slice(0, 5), null, 2));
    }

    res.json({
      source: 'google-sheets',
      people
    });
  } catch (error) {
    console.error('[ERROR] Exception in /api/rsvps:', error);
    res.status(500).json({
      error: 'Could not read the Google Sheet. Check your .env file, service account JSON, sheet sharing, and range.',
      detail: error.message
    });
  }
});

app.post('/api/register', async (req, res) => {
  const { email, rowNumber } = req.body || {};

  if (!email && !rowNumber) {
    return res.status(400).json({
      error: 'Provide at least one identifier: email or rowNumber.'
    });
  }

  try {
    if (!SHEET_ID) {
      return res.status(400).json({
        error: 'Registration updates require GOOGLE_SHEET_ID and Google Sheets credentials.'
      });
    }

    const result = await markRegistered({ email, rowNumber });
    return res.json(result);
  } catch (error) {
    console.error('[ERROR] Exception in /api/register:', error);
    return res.status(500).json({
      error: 'Could not mark attendee as registered.',
      detail: error.message
    });
  }
});

app.delete('/api/register', async (req, res) => {
  const { email, rowNumber } = req.body || {};

  if (!email && !rowNumber) {
    return res.status(400).json({
      error: 'Provide at least one identifier: email or rowNumber.'
    });
  }

  try {
    if (!SHEET_ID) {
      return res.status(400).json({
        error: 'Registration updates require GOOGLE_SHEET_ID and Google Sheets credentials.'
      });
    }

    const result = await clearRegistered({ email, rowNumber });
    return res.json(result);
  } catch (error) {
    console.error('[ERROR] Exception in DELETE /api/register:', error);
    return res.status(500).json({
      error: 'Could not clear registration for attendee.',
      detail: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`RSVP badge printer API running on http://localhost:${PORT}`);
});
