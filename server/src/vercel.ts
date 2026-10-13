import { getConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { loadEnvFiles } from "./env.ts";
import { createApp } from "./app.ts";
import { fetchSpreadsheet } from "./services/googleSheetsService.ts";

// Vercel entry. The process is not always on, so each request syncs when the
// last successful read is older than the interval. /tmp is wiped on a cold start.
loadEnvFiles();
const config = getConfig();
const databasePath = process.env.VERCEL ? "/tmp/timetable.sqlite" : config.databasePath;
const db = openDatabase(databasePath);
const app = createApp(db, { ...config, databasePath }, () => fetchSpreadsheet(config), {
  syncOnRead: Boolean(process.env.VERCEL),
});

export default app;
