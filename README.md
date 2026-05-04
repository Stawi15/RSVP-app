# RSVP Badge Printer

A ready-to-run VS Code application that reads RSVP records from Google Sheets and prints attendee badges with:

- Name
- Title
- Company

It also runs with sample data immediately, so you can test it before connecting your Google Sheet.

## Requirements

- Node.js 18 or newer
- VS Code
- A Google Sheet with the first row as headers, for example:

| Name | Title | Company |
| --- | --- | --- |
| Jane Doe | CEO | Example Ltd |

The app also understands common header names like `Full Name`, `Job Title`, `Role`, `Organization`, and `Employer`.

## Run it immediately with sample data

Open this folder in VS Code, then run:

```bash
npm run install:all
npm run dev
```

Open:

```text
http://localhost:5173
```

Click **Print Badges**.

## Connect your Google Sheet

### 1. Create a service account

1. Go to Google Cloud Console.
2. Create or select a project.
3. Enable **Google Sheets API**.
4. Create a **Service Account**.
5. Create a JSON key for that service account.
6. Save the JSON file as:

```text
server/service-account.json
```

### 2. Share your Google Sheet with the service account

Open your downloaded JSON key and copy the `client_email` value. It looks like:

```text
something@your-project.iam.gserviceaccount.com
```

Share your Google Sheet with that email address as a viewer.

### 3. Configure environment variables

Copy `.env.example` into `server/.env`:

```bash
cp .env.example server/.env
```

Edit `server/.env`:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
GOOGLE_SHEET_ID=PASTE_YOUR_SHEET_ID_HERE
GOOGLE_SHEET_RANGE=Sheet1!A:Z
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

Your sheet ID is the long part of your Google Sheet URL between `/d/` and `/edit`.

Example:

```text
https://docs.google.com/spreadsheets/d/THIS_IS_THE_SHEET_ID/edit#gid=0
```

### 4. Run again

```bash
npm run dev
```

The app should now show **Data source: Google Sheets**.

## Customize the badge text

To change the event name shown at the top of every badge, edit this line in:

```text
client/src/App.jsx
```

```jsx
<div className="event-name">Your Event</div>
```

## Customize print layout

Print styles are in:

```text
client/src/styles.css
```

Look for:

```css
@media print
```

The default layout prints two badges per row on A4 paper.

## Troubleshooting

If the app cannot read your sheet:

- Make sure Google Sheets API is enabled.
- Make sure `server/service-account.json` exists.
- Make sure your Google Sheet is shared with the service account `client_email`.
- Make sure `GOOGLE_SHEET_ID` is correct.
- Make sure `GOOGLE_SHEET_RANGE` uses the correct tab name, such as `RSVPs!A:Z`.
