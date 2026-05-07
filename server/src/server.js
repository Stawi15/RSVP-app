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

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
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

function rowsToPeople(values) {
  if (!values || values.length < 2) return [];

  const headers = values[0].map((h) => String(h).trim());
  const rows = values.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });

  return rows
    .map((row) => {
      const firstName = pickField(row, ['first name', 'firstname', 'first']);
      const lastName = pickField(row, ['last name', 'lastname', 'surname', 'last']);
      const fullName = pickField(row, ['name', 'full name', 'fullname', 'attendee name', 'first and last name']);

      return {
        name: fullName || [firstName, lastName].filter(Boolean).join(' '),
        // Your current sheet does not include a title/job-title column.
        // If you add one later, the app will pick it up automatically.
        title: pickField(row, ['title', 'job title', 'role', 'position']),
        company: pickField(row, ['company', 'organization', 'organisation', 'employer', 'business']),
        email: pickField(row, ['email', 'email address']),
        attendanceConfirmation: pickField(row, ['attendance confirmation', 'attendance', 'confirmation', 'rsvp status'])
      };
    })
    .filter((person) => person.name || person.title || person.company);
}

async function getSheetValues() {
  if (!SHEET_ID) {
    console.error('[ERROR] SHEET_ID is not set.');
    return null;
  }

  try {
    let authOptions;
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      // Support credentials passed as an environment variable (for hosted environments)
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      authOptions = { credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] };
    } else {
      // Fall back to a local key file for local development
      authOptions = {
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      };
    }
    const auth = new google.auth.GoogleAuth(authOptions);

    const sheets = google.sheets({ version: 'v4', auth });
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

app.listen(PORT, () => {
  console.log(`RSVP badge printer API running on http://localhost:${PORT}`);
});
