# Timetable

A live class timetable. One public Google Sheet is the only source of truth. The app reads it and never writes back.

Students pick a cohort once. The week is a grid. A single day is a compact list. Themes recolour each subject, and class colours can be turned off. The header can add that week to Google Calendar, Apple Calendar, Outlook, or Proton, or download the file.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open http://localhost:5173. The API listens on http://localhost:8787.

```bash
npm run build
npm start
```

`npm start` serves the built site and the API together.

Copy `.env.example` to `.env` when you want to change the sheet or the timing. The sheet id in that example is the default, so the app runs without a key.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SPREADSHEET_ID` | the id in `.env.example` | Public spreadsheet id, not the full URL |
| `SYNC_INTERVAL_SECONDS` | `45` | How often the server re-reads the sheet |
| `HIGHLIGHT_HOURS` | `72` | How long an inferred edit stays marked |
| `TIMEZONE` | `Asia/Kolkata` | “Today” and the clock |
| `DATE_ORDER` | `DMY` | How numeric dates in the sheet are read |
| `DATABASE_PATH` | `./data/timetable.sqlite` | Snapshot and change history |

The sheet must stay shared as “anyone with the link can view”. The server downloads the public Excel export. The browser never receives a Google key.

## Next week’s sheet

1. Paste the new spreadsheet id into `.env` as `SPREADSHEET_ID`.
2. Delete `server/data/timetable.sqlite`.
3. Restart `npm run dev`. The env file is read at startup.

On Vercel, set the project env `SPREADSHEET_ID` and redeploy. There is no database file to delete. A cold start is a fresh baseline, so change history does not survive it.

## What the sheet looks like

Each weekday is its own tab. The grid has a time column and one column per cohort. Lunch is a break. A merged `OFF` across a day is a full day off. An empty subject is a free period, not a cancellation. `OFF` stays visible with an OFF badge until the sheet changes.

The first successful sync is a baseline and records no changes. Later syncs record a change only when the content differs. If a refresh fails, the last good timetable stays on screen.

## Deploy

Vercel builds the client and the API from this repo. The API function reads the public sheet. SQLite on Vercel lives in `/tmp` and resets when the function cold-starts, so the 45 second loop and the change history exist only for that instance.

Production deploys come from the `main` branch on GitHub.
