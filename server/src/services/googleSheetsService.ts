import { createHash } from "node:crypto";
import { spreadsheetExportUrl, type AppConfig } from "../config.ts";

export async function fetchSpreadsheet(config: Pick<AppConfig, "spreadsheetId">) {
  if (!config.spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not configured.");
  }
  const response = await fetch(spreadsheetExportUrl(config.spreadsheetId), {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "itm-timetable-portal" },
  });
  if (!response.ok) {
    throw new Error(`Google Sheets export failed (${response.status}). The sheet may be private or temporarily unavailable.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("The spreadsheet export was not an Excel file. Share the sheet as “Anyone with the link can view”.");
  }
  const hash = createHash("sha256").update(buffer).digest("hex");
  return { buffer, hash };
}
