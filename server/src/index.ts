import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { loadEnvFiles } from "./env.ts";
import { createApp } from "./app.ts";
import { fetchSpreadsheet } from "./services/googleSheetsService.ts";
import { startScheduler } from "./services/syncScheduler.ts";

loadEnvFiles();
const config = getConfig();
const databasePath = path.isAbsolute(config.databasePath)
  ? config.databasePath
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", config.databasePath);
const db = openDatabase(databasePath);
const load = () => fetchSpreadsheet(config);
const app = createApp(db, config, load);
startScheduler({ db, config, load });

app.listen(config.port, () => {
  console.log(`Timetable portal API listening on http://localhost:${config.port}`);
});
