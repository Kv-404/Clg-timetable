export interface AppConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  collegeName: string;
  schoolName: string;
  courseName: string;
  timezone: string;
  dateOrder: "DMY" | "MDY";
  port: number;
  syncIntervalSeconds: number;
  highlightHours: number;
  databasePath: string;
  clientOrigin: string | null;
}

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function getConfig(): AppConfig {
  const dateOrder = process.env.DATE_ORDER === "MDY" ? "MDY" : "DMY";
  return {
    // One configured id, used only by the sheets client. The sheet is public and read-only.
    spreadsheetId:
      process.env.SPREADSHEET_ID?.trim() ||
      "1EfkP6uXq7hjjehptSWfz3Q_duqAqfyOkNdpH23B2ctE",
    spreadsheetTitle:
      process.env.SPREADSHEET_TITLE?.trim() ||
      "BTech Cohort Planning weekly | 2025-29 - 12th Oct to 17th Oct 2026",
    collegeName: process.env.COLLEGE_NAME?.trim() || "ITM Skills University",
    schoolName: process.env.SCHOOL_NAME?.trim() || "School of FutureTech, Kharghar",
    courseName: process.env.COURSE_NAME?.trim() || "BTech",
    timezone: process.env.TIMEZONE?.trim() || "Asia/Kolkata",
    dateOrder,
    port: integer(process.env.PORT, 8787, 1, 65535),
    syncIntervalSeconds: integer(process.env.SYNC_INTERVAL_SECONDS, 45, 15, 3600),
    highlightHours: integer(process.env.HIGHLIGHT_HOURS, 72, 1, 24 * 30),
    databasePath: process.env.DATABASE_PATH?.trim() || "./data/timetable.sqlite",
    clientOrigin: process.env.CLIENT_ORIGIN?.trim() || null,
  };
}

export function spreadsheetUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export function spreadsheetExportUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
}
