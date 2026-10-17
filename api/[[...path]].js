"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/src/vercel.ts
var vercel_exports = {};
__export(vercel_exports, {
  default: () => vercel_default
});
module.exports = __toCommonJS(vercel_exports);

// server/src/config.ts
function integer(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
function getConfig() {
  const dateOrder = process.env.DATE_ORDER === "MDY" ? "MDY" : "DMY";
  return {
    // One configured id, used only by the sheets client. The sheet is public and read-only.
    spreadsheetId: process.env.SPREADSHEET_ID?.trim() || "1VgW0dPthBMUux9LV-chWWt8_5MAT42u8fZuJpH4Zhg0",
    spreadsheetTitle: process.env.SPREADSHEET_TITLE?.trim() || "BTech Cohort Planning weekly | 2025-29 - 19th Oct to 24th Oct 2026",
    collegeName: process.env.COLLEGE_NAME?.trim() || "ITM Skills University",
    schoolName: process.env.SCHOOL_NAME?.trim() || "School of FutureTech, Kharghar",
    courseName: process.env.COURSE_NAME?.trim() || "BTech",
    timezone: process.env.TIMEZONE?.trim() || "Asia/Kolkata",
    dateOrder,
    port: integer(process.env.PORT, 8787, 1, 65535),
    syncIntervalSeconds: integer(process.env.SYNC_INTERVAL_SECONDS, 45, 15, 3600),
    highlightHours: integer(process.env.HIGHLIGHT_HOURS, 72, 1, 24 * 30),
    databasePath: process.env.DATABASE_PATH?.trim() || "./data/timetable.sqlite",
    clientOrigin: process.env.CLIENT_ORIGIN?.trim() || null
  };
}
function spreadsheetUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}
function spreadsheetExportUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
}

// server/src/db.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_sqlite = require("node:sqlite");
function openDatabase(file) {
  if (file !== ":memory:") {
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(import_node_path.default.resolve(file)), { recursive: true });
  }
  const db2 = new import_node_sqlite.DatabaseSync(file);
  db2.exec("PRAGMA journal_mode = WAL;");
  db2.exec(`
    CREATE TABLE IF NOT EXISTS lectures (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS change_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE,
      detected_at TEXT NOT NULL,
      type TEXT NOT NULL,
      lecture_id TEXT,
      division TEXT,
      course TEXT,
      semester TEXT,
      tab_name TEXT,
      date TEXT,
      weekday TEXT,
      summary TEXT NOT NULL,
      previous_json TEXT,
      next_json TEXT,
      fields_json TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_success_at TEXT,
      last_attempt_at TEXT,
      last_error TEXT,
      bootstrapped INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      tab_names_json TEXT NOT NULL DEFAULT '[]',
      parse_issues_json TEXT NOT NULL DEFAULT '[]',
      spreadsheet_title TEXT
    );
  `);
  const existing = db2.prepare("SELECT id FROM sync_state WHERE id = 1").get();
  if (!existing) {
    db2.prepare("INSERT INTO sync_state (id, bootstrapped) VALUES (1, 0)").run();
  }
  return db2;
}
function readSyncState(db2) {
  const row = db2.prepare(`
    SELECT last_success_at, last_attempt_at, last_error, bootstrapped, content_hash,
           tab_names_json, parse_issues_json, spreadsheet_title
    FROM sync_state WHERE id = 1
  `).get();
  return {
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
    bootstrapped: row.bootstrapped === 1,
    contentHash: row.content_hash,
    tabNames: JSON.parse(row.tab_names_json),
    parseIssues: JSON.parse(row.parse_issues_json),
    spreadsheetTitle: row.spreadsheet_title
  };
}
function writeSyncState(db2, state) {
  db2.prepare(`
    UPDATE sync_state SET
      last_success_at = ?,
      last_attempt_at = ?,
      last_error = ?,
      bootstrapped = ?,
      content_hash = ?,
      tab_names_json = ?,
      parse_issues_json = ?,
      spreadsheet_title = ?
    WHERE id = 1
  `).run(
    state.lastSuccessAt,
    state.lastAttemptAt,
    state.lastError,
    state.bootstrapped ? 1 : 0,
    state.contentHash,
    JSON.stringify(state.tabNames),
    JSON.stringify(state.parseIssues),
    state.spreadsheetTitle
  );
}
function readLectures(db2) {
  const rows = db2.prepare("SELECT json FROM lectures").all();
  return rows.map((row) => JSON.parse(row.json));
}
function replaceLectures(db2, lectures) {
  db2.exec("DELETE FROM lectures");
  const insert = db2.prepare("INSERT INTO lectures (id, json) VALUES (?, ?)");
  for (const lecture of lectures) insert.run(lecture.id, JSON.stringify(lecture));
}
function insertChanges(db2, drafts) {
  const insert = db2.prepare(`
    INSERT OR IGNORE INTO change_events (
      dedupe_key, detected_at, type, lecture_id, division, course, semester, tab_name,
      date, weekday, summary, previous_json, next_json, fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const draft2 of drafts) {
    insert.run(
      draft2.dedupeKey,
      draft2.detectedAt,
      draft2.type,
      draft2.lectureId,
      draft2.division,
      draft2.course,
      draft2.semester,
      draft2.tabName,
      draft2.date,
      draft2.weekday,
      draft2.summary,
      draft2.previous ? JSON.stringify(draft2.previous) : null,
      draft2.next ? JSON.stringify(draft2.next) : null,
      JSON.stringify(draft2.fields)
    );
  }
}
function readAllChanges(db2) {
  const rows = db2.prepare(`
    SELECT id, dedupe_key, detected_at, type, lecture_id, division, course, semester, tab_name,
           date, weekday, summary, previous_json, next_json, fields_json
    FROM change_events
    ORDER BY id ASC
  `).all();
  return rows.map((row) => ({
    id: row.id,
    dedupeKey: row.dedupe_key,
    detectedAt: row.detected_at,
    type: row.type,
    lectureId: row.lecture_id,
    division: row.division,
    course: row.course,
    semester: row.semester,
    tabName: row.tab_name,
    date: row.date,
    weekday: row.weekday,
    summary: row.summary,
    previous: row.previous_json ? JSON.parse(row.previous_json) : null,
    next: row.next_json ? JSON.parse(row.next_json) : null,
    fields: row.fields_json ? JSON.parse(row.fields_json) : []
  }));
}
function replaceChangeRows(db2, rows) {
  db2.exec("DELETE FROM change_events");
  const insert = db2.prepare(`
    INSERT INTO change_events (
      id, dedupe_key, detected_at, type, lecture_id, division, course, semester, tab_name,
      date, weekday, summary, previous_json, next_json, fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    insert.run(
      row.id,
      row.dedupeKey,
      row.detectedAt,
      row.type,
      row.lectureId,
      row.division,
      row.course,
      row.semester,
      row.tabName,
      row.date,
      row.weekday,
      row.summary,
      row.previous ? JSON.stringify(row.previous) : null,
      row.next ? JSON.stringify(row.next) : null,
      JSON.stringify(row.fields)
    );
  }
  const max = rows.reduce((highest, row) => Math.max(highest, row.id), 0);
  const updated = db2.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'change_events'").run(max);
  if (updated.changes === 0 && max > 0) {
    db2.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('change_events', ?)").run(max);
  }
}
function readChanges(db2, limit = 50) {
  const rows = db2.prepare(`
    SELECT id, detected_at, type, lecture_id, division, course, semester, tab_name,
           date, weekday, summary, previous_json, next_json, fields_json
    FROM change_events
    ORDER BY detected_at DESC, id DESC
    LIMIT ?
  `).all(limit);
  return rows.map((row) => ({
    id: row.id,
    detectedAt: row.detected_at,
    type: row.type,
    lectureId: row.lecture_id,
    division: row.division,
    course: row.course,
    semester: row.semester,
    tabName: row.tab_name,
    date: row.date,
    weekday: row.weekday,
    summary: row.summary,
    previous: row.previous_json ? JSON.parse(row.previous_json) : null,
    next: row.next_json ? JSON.parse(row.next_json) : null,
    fields: row.fields_json ? JSON.parse(row.fields_json) : []
  }));
}

// server/src/env.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");
var import_meta = {};
function applyEnvFile(file) {
  if (!import_node_fs2.default.existsSync(file)) return;
  const text = import_node_fs2.default.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === void 0) process.env[key] = value;
  }
}
function loadEnvFiles() {
  if (!import_meta.url) return;
  const here = import_node_path2.default.dirname((0, import_node_url.fileURLToPath)(import_meta.url));
  applyEnvFile(import_node_path2.default.resolve(here, "../../.env"));
  applyEnvFile(import_node_path2.default.resolve(here, "../../.env.local"));
  applyEnvFile(import_node_path2.default.resolve(here, "../.env"));
}

// server/src/app.ts
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_node_url2 = require("node:url");
var import_cors = __toESM(require("cors"), 1);
var import_express = __toESM(require("express"), 1);

// shared/cohort.ts
function cohortName(division) {
  return division.replace(/\s+20\d{2}\s*$/, "").trim() || division;
}

// shared/calendar.ts
function calendarFile(lectures, timeZone, calendarName = "Timetable") {
  const events = collapseFullOffDays(lectures).filter((lecture) => lecture.date && lecture.kind !== "break");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendarName)}`,
    `X-WR-TIMEZONE:${icsText(timeZone)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H"
  ];
  const stamp = formatUtc(/* @__PURE__ */ new Date());
  for (const lecture of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(lecture.id)}@timetable`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${googleStamp(lecture.date, lecture.startMinutes, timeZone)}`,
      `DTEND:${googleStamp(lecture.date, lecture.endMinutes, timeZone)}`,
      `SUMMARY:${icsText(eventTitle(lecture))}`,
      `DESCRIPTION:${icsText(eventDetails(lecture))}`,
      `STATUS:${lecture.displayStatus === "cancelled" ? "CANCELLED" : "CONFIRMED"}`
    );
    if (lecture.room) lines.push(`LOCATION:${icsText(lecture.room)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function eventTitle(lecture) {
  const name = cohortName(lecture.division);
  if (lecture.subject === "OFF" || lecture.kind === "off") return `OFF \u2014 ${name}`;
  if (lecture.displayStatus === "cancelled") return `Cancelled: ${lecture.subject}`;
  return lecture.subject;
}
function eventDetails(lecture) {
  return [cohortName(lecture.division), lecture.faculty ? `Faculty: ${lecture.faculty}` : "", lecture.reason ? `Reason: ${lecture.reason}` : "", lecture.changeSummary ?? ""].filter(Boolean).join("\n");
}
function collapseFullOffDays(lectures) {
  const collapsed = lectures.filter((lecture) => lecture.kind === "break");
  const groups = /* @__PURE__ */ new Map();
  for (const lecture of lectures) {
    if (lecture.kind === "break") continue;
    const key = `${lecture.date ?? lecture.weekday}|${lecture.division}`;
    const list = groups.get(key) ?? [];
    list.push(lecture);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    const slots = group.filter((lecture) => lecture.kind !== "break");
    const fullOff = slots.length > 0 && slots.every((lecture) => lecture.subject === "OFF" && lecture.displayStatus === "cancelled");
    if (!fullOff) {
      collapsed.push(...group);
      continue;
    }
    const ordered = [...group].sort((a, b) => a.startMinutes - b.startMinutes);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    collapsed.push({
      ...first,
      id: `${first.division}-${first.date ?? first.weekday}-off`,
      endMinutes: last.endMinutes,
      endLabel: last.endLabel,
      reason: "The official timetable marks this whole day OFF."
    });
  }
  return collapsed;
}
function googleStamp(dateIso, minutes, timeZone) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute);
  const utc = guess - offsetMinutes(new Date(guess), timeZone) * 6e4;
  const refined = guess - offsetMinutes(new Date(utc), timeZone) * 6e4;
  return formatUtc(new Date(refined));
}
function offsetMinutes(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(instant);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
  return Math.round((asUtc - instant.getTime()) / 6e4);
}
function formatUtc(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}
function icsText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

// server/src/services/changeHistoryService.ts
function recordChanges(db2, drafts) {
  insertChanges(db2, drafts);
}
function listChanges(db2, limit = 50) {
  return readChanges(db2, limit);
}

// server/src/services/presentLecture.ts
function highlightVisible(lecture, now, highlightHours) {
  const highlight = lecture.highlight;
  if (!highlight) return false;
  if (highlight.displayStatus === "cancelled") return true;
  const detected = Date.parse(highlight.detectedAt);
  if (!Number.isFinite(detected)) return false;
  return now.getTime() - detected <= highlightHours * 60 * 60 * 1e3;
}
function presentLecture(lecture, now, highlightHours) {
  const visible = highlightVisible(lecture, now, highlightHours);
  const highlight = visible ? lecture.highlight : null;
  let displayStatus = "scheduled";
  if (lecture.kind === "break") displayStatus = "scheduled";
  else if (lecture.sourceStatus === "cancelled" || lecture.kind === "off") displayStatus = "cancelled";
  else if (highlight?.displayStatus === "rescheduled" || lecture.explicitMark === "rescheduled") displayStatus = "rescheduled";
  else if (highlight?.displayStatus === "changed" || lecture.explicitMark === "changed") displayStatus = "changed";
  const showPrevious = displayStatus !== "scheduled";
  return {
    id: lecture.id,
    slotKey: lecture.slotKey,
    tabName: lecture.tabName,
    course: lecture.course,
    semester: lecture.semester,
    batch: lecture.batch,
    division: lecture.division,
    date: lecture.date,
    weekday: lecture.weekday,
    startMinutes: lecture.startMinutes,
    endMinutes: lecture.endMinutes,
    startLabel: lecture.startLabel,
    endLabel: lecture.endLabel,
    subject: lecture.subject,
    faculty: lecture.faculty,
    room: lecture.room,
    kind: lecture.kind,
    sourceStatus: lecture.sourceStatus,
    displayStatus,
    reason: lecture.reason,
    previous: showPrevious ? highlight?.previous ?? null : null,
    changeDetectedAt: showPrevious ? highlight?.detectedAt ?? null : null,
    changeSummary: showPrevious ? highlight?.summary ?? null : null,
    explicitMark: lecture.explicitMark,
    recurring: lecture.recurring
  };
}

// server/src/services/timetableSnapshotService.ts
function loadSnapshot(db2) {
  return readLectures(db2);
}
function saveSnapshot(db2, lectures) {
  replaceLectures(db2, lectures);
}
function toNormalized(lecture) {
  return {
    id: lecture.id,
    slotKey: lecture.slotKey,
    tabName: lecture.tabName,
    course: lecture.course,
    semester: lecture.semester,
    batch: lecture.batch,
    division: lecture.division,
    date: lecture.date,
    weekday: lecture.weekday,
    startMinutes: lecture.startMinutes,
    endMinutes: lecture.endMinutes,
    startLabel: lecture.startLabel,
    endLabel: lecture.endLabel,
    subject: lecture.subject,
    faculty: lecture.faculty,
    room: lecture.room,
    kind: lecture.kind,
    sourceStatus: lecture.sourceStatus,
    reason: lecture.reason,
    explicitMark: lecture.explicitMark,
    recurring: lecture.recurring
  };
}

// server/src/time.ts
var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function canon(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function sameText(a, b) {
  return canon(a).toLowerCase() === canon(b).toLowerCase();
}
function formatMinutes(minutes) {
  const h24 = (Math.floor(minutes / 60) % 24 + 24) % 24;
  const minute = (minutes % 60 + 60) % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function parseTimeToken(token) {
  const match = canon(token).match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toUpperCase();
  if (hour > 23 || minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "PM" && hour < 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
}
function parseTimeRange(label) {
  const text = canon(label);
  const match = text.match(/^(.+?)\s*(?:-|–|—|\bto\b)\s*(.+)$/i);
  if (!match) return null;
  const start = parseTimeToken(match[1] ?? "");
  const end = parseTimeToken(match[2] ?? "");
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}
function parseDateLabel(input, order = "DMY") {
  const text = canon(input);
  const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  const day = order === "DMY" ? first : second;
  const month = order === "DMY" ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const named = text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  const computed = WEEKDAYS[date.getUTCDay()] ?? "Monday";
  const weekday = named ? named[1].charAt(0).toUpperCase() + named[1].slice(1).toLowerCase() : computed;
  return { iso, weekday, computedWeekday: computed };
}
function weekdayFromName(name) {
  const text = canon(name).toLowerCase();
  const found = WEEKDAYS.find((day) => text === day.toLowerCase() || text.startsWith(`${day.toLowerCase()} `));
  return found ?? null;
}
function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return {
    iso,
    minutes,
    weekday: parts.weekday ?? "Monday"
  };
}

// server/src/services/restoreRemoved.ts
function slotMinutes(id) {
  const match = /\|(\d+)-(\d+)$/.exec(id);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}
function restoreRemovedLectures(lectures, changes) {
  const ids = new Set(lectures.map((lecture) => lecture.id));
  const days = new Set(
    lectures.filter((lecture) => lecture.kind !== "break" && lecture.date).map((lecture) => `${lecture.tabName}|${lecture.date}`)
  );
  const restoredIds = /* @__PURE__ */ new Set();
  const restored = [];
  const rewritten = [];
  for (const change of changes) {
    if (change.type !== "removed" || !change.lectureId || !change.tabName || !change.date) continue;
    if (ids.has(change.lectureId) || !days.has(`${change.tabName}|${change.date}`)) continue;
    const previous = change.previous;
    const subject = previous?.subject;
    const minutes = slotMinutes(change.lectureId);
    if (!subject || !minutes) continue;
    const sibling = lectures.find((lecture) => lecture.division === change.division) ?? lectures[0];
    const startLabel = previous.startLabel || formatMinutes(minutes.start);
    const endLabel = previous.endLabel || formatMinutes(minutes.end);
    restored.push({
      id: change.lectureId,
      slotKey: change.lectureId,
      tabName: change.tabName,
      course: change.course || sibling?.course || "",
      semester: change.semester || sibling?.semester || "",
      batch: sibling?.batch || "",
      division: change.division || "",
      date: change.date,
      weekday: change.weekday || "",
      startMinutes: minutes.start,
      endMinutes: minutes.end,
      startLabel,
      endLabel,
      subject,
      faculty: previous.faculty || "",
      room: previous.room || "",
      kind: "lecture",
      sourceStatus: "cancelled",
      reason: "Removed from the official timetable.",
      explicitMark: "cancelled",
      recurring: false,
      anchor: {
        subject,
        faculty: previous.faculty || "",
        room: previous.room || "",
        startMinutes: minutes.start,
        endMinutes: minutes.end,
        startLabel,
        endLabel,
        sourceStatus: "scheduled",
        reason: "",
        kind: "lecture",
        explicitMark: null
      },
      highlight: {
        displayStatus: "cancelled",
        type: "cancelled",
        summary: `${subject} lecture cancelled.`,
        detectedAt: change.detectedAt,
        previous,
        reason: null
      }
    });
    ids.add(change.lectureId);
    restoredIds.add(change.lectureId);
    rewritten.push({ id: change.id, summary: `${subject} lecture cancelled.` });
  }
  return { lectures: [...lectures, ...restored], restoredIds, rewritten };
}

// server/src/services/persistCancelled.ts
function persistCancelledRemovals(db2) {
  const restored = restoreRemovedLectures(loadSnapshot(db2), readChanges(db2, 500));
  if (restored.restoredIds.size === 0) return restored;
  const update = db2.prepare("UPDATE change_events SET type = 'cancelled', summary = ? WHERE id = ? AND type = 'removed'");
  db2.exec("BEGIN");
  try {
    saveSnapshot(db2, restored.lectures);
    for (const row of restored.rewritten) update.run(row.summary, row.id);
    db2.exec("COMMIT");
  } catch (error) {
    db2.exec("ROLLBACK");
    throw error;
  }
  return restored;
}

// server/src/services/changeDetectionService.ts
var import_node_crypto = require("node:crypto");
function coreOf(lecture) {
  return {
    subject: canon(lecture.subject),
    faculty: canon(lecture.faculty),
    room: canon(lecture.room),
    startMinutes: lecture.startMinutes,
    endMinutes: lecture.endMinutes,
    startLabel: lecture.startLabel,
    endLabel: lecture.endLabel,
    sourceStatus: lecture.sourceStatus,
    reason: canon(lecture.reason ?? ""),
    kind: lecture.kind,
    explicitMark: lecture.explicitMark
  };
}
function coresEqual(a, b) {
  return sameText(a.subject, b.subject) && sameText(a.faculty, b.faculty) && sameText(a.room, b.room) && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes && a.sourceStatus === b.sourceStatus && sameText(a.reason, b.reason) && a.kind === b.kind && a.explicitMark === b.explicitMark;
}
function previousOf(core, fields) {
  const previous = {};
  if (fields.includes("subject") || fields.includes("status")) previous.subject = core.subject;
  if (fields.includes("faculty")) previous.faculty = core.faculty;
  if (fields.includes("room")) previous.room = core.room;
  if (fields.includes("time") || fields.includes("status")) {
    previous.startLabel = core.startLabel;
    previous.endLabel = core.endLabel;
  }
  if (fields.includes("status")) previous.status = core.sourceStatus;
  return previous;
}
function nextOf(lecture, fields) {
  const next = {};
  if (fields.includes("subject") || fields.includes("status")) next.subject = lecture.subject;
  if (fields.includes("faculty")) next.faculty = lecture.faculty;
  if (fields.includes("room")) next.room = lecture.room;
  if (fields.includes("time") || fields.includes("status")) {
    next.startLabel = lecture.startLabel;
    next.endLabel = lecture.endLabel;
  }
  if (fields.includes("status")) next.status = lecture.sourceStatus;
  return next;
}
function dedupeKey(parts) {
  return (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(parts)).digest("hex");
}
function rangeLabel(lecture) {
  return `${lecture.startLabel}\u2013${lecture.endLabel}`;
}
function draft(input) {
  const { dedupeParts, ...rest } = input;
  return { ...rest, dedupeKey: dedupeKey(dedupeParts) };
}
function contextOf(lecture, tabName) {
  return {
    lectureId: lecture?.id ?? null,
    division: lecture?.division ?? null,
    course: lecture?.course ?? null,
    semester: lecture?.semester ?? null,
    tabName: lecture?.tabName ?? tabName ?? null,
    date: lecture?.date ?? null,
    weekday: lecture?.weekday ?? null
  };
}
function changedFields(prev, next) {
  const fields = [];
  if (!sameText(prev.subject, next.subject)) fields.push("subject");
  if (!sameText(prev.faculty, next.faculty)) fields.push("faculty");
  if (!sameText(prev.room, next.room)) fields.push("room");
  if (prev.startMinutes !== next.startMinutes || prev.endMinutes !== next.endMinutes) fields.push("time");
  if (prev.sourceStatus !== next.sourceStatus || prev.kind !== next.kind) fields.push("status");
  if (!sameText(prev.reason, next.reason ?? "")) fields.push("reason");
  if (prev.explicitMark !== next.explicitMark) fields.push("status");
  return [...new Set(fields)];
}
function describeFieldChange(prev, next, fields) {
  const subject = next.kind === "off" ? prev.subject : next.subject;
  if (fields.length === 1 && fields[0] === "room") {
    return `${next.subject} moved from ${prev.room || "an unassigned room"} to ${next.room || "an unassigned room"}.`;
  }
  if (fields.length === 1 && fields[0] === "faculty") {
    return `${next.subject} faculty changed from ${prev.faculty || "unassigned"} to ${next.faculty || "unassigned"}.`;
  }
  if (fields.length === 1 && fields[0] === "subject") {
    return `${prev.subject} was replaced by ${next.subject} at ${rangeLabel(next)}.`;
  }
  if (fields.length === 1 && fields[0] === "time") {
    return `${subject} moved from ${rangeLabel(prev)} to ${rangeLabel(next)}.`;
  }
  const bits = [];
  if (fields.includes("subject")) bits.push(`subject is now ${next.subject} (was ${prev.subject})`);
  if (fields.includes("time")) bits.push(`time is now ${rangeLabel(next)} (was ${rangeLabel(prev)})`);
  if (fields.includes("room")) bits.push(`room is now ${next.room || "unassigned"} (was ${prev.room || "unassigned"})`);
  if (fields.includes("faculty")) bits.push(`faculty is now ${next.faculty || "unassigned"} (was ${prev.faculty || "unassigned"})`);
  if (fields.includes("reason")) bits.push("the note was updated");
  return `${next.subject} was updated: ${bits.join("; ")}.`;
}
function canPair(removed, added) {
  if (removed.tabName !== added.tabName || removed.date !== added.date || removed.division !== added.division) return false;
  if (removed.kind === "break" || added.kind === "break") return false;
  if (removed.sourceStatus === "cancelled" || added.sourceStatus === "cancelled") return false;
  if (!sameText(removed.subject, added.subject)) return false;
  const facultyRemoved = canon(removed.faculty).toLowerCase();
  const facultyAdded = canon(added.faculty).toLowerCase();
  const roomRemoved = canon(removed.room).toLowerCase();
  const roomAdded = canon(added.room).toLowerCase();
  const facultyDiffers = Boolean(facultyRemoved && facultyAdded && facultyRemoved !== facultyAdded);
  const roomDiffers = Boolean(roomRemoved && roomAdded && roomRemoved !== roomAdded);
  if (facultyDiffers && roomDiffers) return false;
  return true;
}
function pairMoves(removed, added) {
  const pairs = [];
  const usedRemoved = /* @__PURE__ */ new Set();
  const usedAdded = /* @__PURE__ */ new Set();
  const groupKey = (lecture) => [lecture.tabName, lecture.date ?? "", lecture.division, canon(lecture.subject).toLowerCase()].join("|");
  const keys = /* @__PURE__ */ new Set([...removed.map(groupKey), ...added.map(groupKey)]);
  for (const key of keys) {
    const groupRemoved = removed.filter((lecture) => !usedRemoved.has(lecture.id) && groupKey(lecture) === key && added.some((candidate) => canPair(lecture, candidate)));
    const groupAdded = added.filter((lecture) => !usedAdded.has(lecture.slotKey) && groupKey(lecture) === key && removed.some((candidate) => canPair(candidate, lecture)));
    if (groupRemoved.length === 0 || groupAdded.length === 0) continue;
    const allCross = groupRemoved.every((left) => groupAdded.every((right) => canPair(left, right)));
    if (allCross) {
      const orderedRemoved = [...groupRemoved].sort((a, b) => a.startMinutes - b.startMinutes);
      const orderedAdded = [...groupAdded].sort((a, b) => a.startMinutes - b.startMinutes);
      const count = Math.min(orderedRemoved.length, orderedAdded.length);
      for (let index = 0; index < count; index += 1) {
        const left = orderedRemoved[index];
        const right = orderedAdded[index];
        usedRemoved.add(left.id);
        usedAdded.add(right.slotKey);
        pairs.push({ removed: left, added: right });
      }
      continue;
    }
    const pool = [...groupAdded];
    for (const left of [...groupRemoved].sort((a, b) => a.startMinutes - b.startMinutes)) {
      const matchIndex = pool.findIndex((right2) => canPair(left, right2));
      if (matchIndex === -1) continue;
      const right = pool.splice(matchIndex, 1)[0];
      usedRemoved.add(left.id);
      usedAdded.add(right.slotKey);
      pairs.push({ removed: left, added: right });
    }
  }
  return { pairs, usedRemoved, usedAdded };
}
function highlightFor(displayStatus, type, summary, detectedAt, previous, reason) {
  return { displayStatus, type, summary, detectedAt, previous, reason };
}
function initialSnapshot(lectures) {
  return lectures.map((lecture) => ({
    ...lecture,
    anchor: coreOf(lecture),
    highlight: null
  }));
}
function compareSnapshots(previous, next, options) {
  const detectedAt = options.now.toISOString();
  const events = [];
  const output = [];
  const previousBySlot = new Map(previous.map((lecture) => [lecture.slotKey, lecture]));
  const matched = /* @__PURE__ */ new Set();
  const unmatchedNext = [];
  for (const lecture of next) {
    const prior = previousBySlot.get(lecture.slotKey);
    if (!prior) {
      unmatchedNext.push(lecture);
      continue;
    }
    matched.add(prior.id);
    const priorCore = coreOf(prior);
    const nextCore = coreOf(lecture);
    if (coresEqual(priorCore, nextCore)) {
      output.push({
        ...lecture,
        id: prior.id,
        anchor: prior.anchor,
        highlight: prior.highlight
      });
      continue;
    }
    if (coresEqual(nextCore, prior.anchor)) {
      const restored = prior.sourceStatus === "cancelled" && lecture.sourceStatus === "scheduled";
      const summary2 = restored ? `${lecture.subject} is back on the timetable.` : `${lecture.subject} change was reverted.`;
      events.push(draft({
        ...contextOf({ ...lecture, id: prior.id }),
        detectedAt,
        type: restored ? "restored" : "reverted",
        summary: summary2,
        previous: previousOf(priorCore, ["subject", "faculty", "room", "time", "status"]),
        next: nextOf(lecture, ["subject", "faculty", "room", "time", "status"]),
        fields: changedFields(priorCore, lecture),
        dedupeParts: [prior.id, restored ? "restored" : "reverted", priorCore, nextCore]
      }));
      output.push({ ...lecture, id: prior.id, anchor: nextCore, highlight: null });
      continue;
    }
    if (prior.kind !== "break" && lecture.kind === "break") {
      const summary2 = `${prior.subject} at ${rangeLabel(prior)} is no longer listed. The slot is now a break, and it was not marked cancelled.`;
      events.push(draft({
        ...contextOf(prior),
        detectedAt,
        type: "removed",
        summary: summary2,
        previous: previousOf(priorCore, ["subject", "time", "room", "faculty"]),
        next: null,
        fields: ["status"],
        dedupeParts: [prior.id, "removed", priorCore]
      }));
      output.push({ ...lecture, id: lecture.slotKey, anchor: nextCore, highlight: null });
      continue;
    }
    if (prior.kind === "break" && lecture.kind !== "break") {
      const summary2 = `${lecture.subject} added at ${rangeLabel(lecture)}${lecture.room ? ` in ${lecture.room}` : ""}.`;
      events.push(draft({
        ...contextOf({ ...lecture, id: prior.id }),
        detectedAt,
        type: "added",
        summary: summary2,
        previous: null,
        next: nextOf(lecture, ["subject", "time", "room", "faculty"]),
        fields: ["subject"],
        dedupeParts: [prior.id, "added", nextCore]
      }));
      output.push({ ...lecture, id: prior.id, anchor: nextCore, highlight: null });
      continue;
    }
    const fields = changedFields(priorCore, lecture);
    const becameCancelled = lecture.sourceStatus === "cancelled" && prior.sourceStatus !== "cancelled";
    const leftCancelled = prior.sourceStatus === "cancelled" && lecture.sourceStatus !== "cancelled";
    let type = "details_changed";
    let displayStatus = "changed";
    let summary = describeFieldChange(priorCore, lecture, fields);
    if (becameCancelled) {
      type = "cancelled";
      displayStatus = "cancelled";
      summary = lecture.kind === "off" ? `${prior.kind === "off" ? rangeLabel(prior) : prior.subject} is marked OFF.` : `${prior.subject} lecture cancelled.`;
    } else if (leftCancelled && !sameText(prior.subject, lecture.subject) && !/^off$/i.test(prior.subject)) {
      type = "replaced";
      displayStatus = "changed";
      summary = `${lecture.subject} replaces the cancelled ${prior.subject} lecture.`;
    } else if (leftCancelled) {
      type = "restored";
      displayStatus = "changed";
      summary = /^off$/i.test(prior.subject) ? `${rangeLabel(lecture)} is no longer OFF. ${lecture.subject} is scheduled.` : `${lecture.subject} is back on the timetable.`;
    } else if (lecture.explicitMark === "rescheduled" || fields.includes("time")) {
      type = "rescheduled";
      displayStatus = "rescheduled";
      summary = `${lecture.subject} moved from ${rangeLabel(prior)} to ${rangeLabel(lecture)}.`;
    } else if (fields.length === 1 && fields[0] === "room") type = "room_change";
    else if (fields.length === 1 && fields[0] === "faculty") type = "faculty_change";
    else if (fields.length === 1 && fields[0] === "subject") type = "subject_change";
    const shownFields = becameCancelled ? ["subject", "time", "room", "faculty", "status"] : fields;
    events.push(draft({
      ...contextOf({ ...lecture, id: prior.id }),
      detectedAt,
      type,
      summary,
      previous: previousOf(priorCore, shownFields),
      next: nextOf(lecture, shownFields),
      fields,
      dedupeParts: [prior.id, type, priorCore, nextCore]
    }));
    output.push({
      ...lecture,
      id: prior.id,
      anchor: priorCore,
      highlight: highlightFor(displayStatus, type, summary, detectedAt, previousOf(priorCore, shownFields), lecture.reason)
    });
  }
  const unmatchedPrevious = previous.filter((lecture) => !matched.has(lecture.id));
  const { pairs, usedRemoved, usedAdded } = pairMoves(
    unmatchedPrevious.filter((lecture) => lecture.kind !== "break"),
    unmatchedNext.filter((lecture) => lecture.kind !== "break")
  );
  for (const pair of pairs) {
    const removedCore = coreOf(pair.removed);
    const addedCore = coreOf(pair.added);
    const fields = changedFields(removedCore, pair.added);
    if (!fields.includes("time")) fields.push("time");
    if (coresEqual(addedCore, pair.removed.anchor)) {
      const summary2 = `${pair.added.subject} change was reverted.`;
      events.push(draft({
        ...contextOf({ ...pair.added, id: pair.removed.id }),
        detectedAt,
        type: "reverted",
        summary: summary2,
        previous: previousOf(removedCore, ["time", "room", "faculty", "subject"]),
        next: nextOf(pair.added, ["time", "room", "faculty", "subject"]),
        fields,
        dedupeParts: [pair.removed.id, "reverted", removedCore, addedCore]
      }));
      output.push({ ...pair.added, id: pair.removed.id, anchor: addedCore, highlight: null });
      continue;
    }
    const summaryParts = [`${pair.added.subject} moved from ${rangeLabel(pair.removed)} to ${rangeLabel(pair.added)}.`];
    if (!sameText(pair.removed.room, pair.added.room)) {
      summaryParts.push(`Room is now ${pair.added.room || "unassigned"} (was ${pair.removed.room || "unassigned"}).`);
    }
    const summary = summaryParts.join(" ");
    events.push(draft({
      ...contextOf({ ...pair.added, id: pair.removed.id }),
      detectedAt,
      type: "rescheduled",
      summary,
      previous: previousOf(removedCore, fields),
      next: nextOf(pair.added, fields),
      fields,
      dedupeParts: [pair.removed.id, "rescheduled", removedCore, addedCore]
    }));
    output.push({
      ...pair.added,
      id: pair.removed.id,
      anchor: removedCore,
      highlight: highlightFor("rescheduled", "rescheduled", summary, detectedAt, previousOf(removedCore, fields), pair.added.reason)
    });
  }
  for (const lecture of unmatchedNext) {
    if (usedAdded.has(lecture.slotKey)) continue;
    if (lecture.kind === "break") {
      output.push({ ...lecture, anchor: coreOf(lecture), highlight: null });
      continue;
    }
    const summary = `${lecture.subject} added at ${rangeLabel(lecture)}${lecture.room ? ` in ${lecture.room}` : ""}.`;
    events.push(draft({
      ...contextOf(lecture),
      detectedAt,
      type: "added",
      summary,
      previous: null,
      next: nextOf(lecture, ["subject", "time", "room", "faculty"]),
      fields: ["subject"],
      dedupeParts: [lecture.slotKey, "added", coreOf(lecture)]
    }));
    output.push({ ...lecture, anchor: coreOf(lecture), highlight: null });
  }
  for (const lecture of unmatchedPrevious) {
    if (usedRemoved.has(lecture.id) || lecture.kind === "break") continue;
    const dayRemains = next.some((item) => item.tabName === lecture.tabName && item.date === lecture.date && item.kind !== "break");
    if (dayRemains && lecture.kind === "lecture") {
      const summary2 = `${lecture.subject} lecture cancelled.`;
      const fields = ["subject", "time", "room", "faculty", "status"];
      const already = lecture.sourceStatus === "cancelled";
      if (!already) {
        events.push(draft({
          ...contextOf(lecture),
          detectedAt,
          type: "cancelled",
          summary: summary2,
          previous: previousOf(coreOf(lecture), fields),
          next: null,
          fields: ["status"],
          dedupeParts: [lecture.id, "cancelled", coreOf(lecture)]
        }));
      }
      output.push({
        ...lecture,
        sourceStatus: "cancelled",
        explicitMark: "cancelled",
        reason: lecture.reason || "Removed from the official timetable.",
        anchor: lecture.anchor,
        highlight: already && lecture.highlight?.displayStatus === "cancelled" ? lecture.highlight : highlightFor("cancelled", "cancelled", summary2, detectedAt, previousOf(coreOf(lecture), fields), lecture.reason)
      });
      continue;
    }
    const summary = `${lecture.subject} at ${rangeLabel(lecture)} is no longer listed. It was not marked cancelled.`;
    events.push(draft({
      ...contextOf(lecture),
      detectedAt,
      type: "removed",
      summary,
      previous: previousOf(coreOf(lecture), ["subject", "time", "room", "faculty"]),
      next: null,
      fields: ["subject"],
      dedupeParts: [lecture.id, "removed", coreOf(lecture)]
    }));
  }
  if (options.bootstrapped) {
    const before = new Set(options.previousTabs);
    const after = new Set(options.nextTabs);
    for (const tab of options.nextTabs) {
      if (before.has(tab)) continue;
      const count = next.filter((lecture) => lecture.tabName === tab && lecture.kind === "lecture").length;
      events.push(draft({
        ...contextOf(null, tab),
        detectedAt,
        type: "tab_added",
        summary: count > 0 ? `Tab \u201C${tab}\u201D was added with ${count} lecture${count === 1 ? "" : "s"}.` : `Tab \u201C${tab}\u201D was added.`,
        previous: null,
        next: null,
        fields: ["tab"],
        dedupeParts: ["tab_added", tab, next.filter((lecture) => lecture.tabName === tab).map((lecture) => lecture.slotKey).sort()]
      }));
    }
    for (const tab of options.previousTabs) {
      if (after.has(tab)) continue;
      events.push(draft({
        ...contextOf(null, tab),
        detectedAt,
        type: "tab_removed",
        summary: `Tab \u201C${tab}\u201D is no longer in the spreadsheet. Its classes were removed from the portal and were not marked cancelled.`,
        previous: null,
        next: null,
        fields: ["tab"],
        dedupeParts: ["tab_removed", tab]
      }));
    }
  }
  return { lectures: output, events };
}

// server/src/services/timetableNormalizer.ts
var import_node_crypto2 = require("node:crypto");
function normalizeMark(word) {
  const value = word.toLowerCase();
  if (value === "canceled" || value === "cancelled" || value === "holiday") return "cancelled";
  if (value === "off") return "off";
  if (value === "rescheduled") return "rescheduled";
  return "changed";
}
function parseStatusToken(status) {
  const text = canon(status).toLowerCase();
  if (!text || text === "scheduled" || text === "confirmed") return null;
  if (/^(cancelled|canceled|holiday)$/.test(text)) return "cancelled";
  if (text === "off") return "off";
  if (text === "rescheduled") return "rescheduled";
  if (text === "changed") return "changed";
  return null;
}
function parseMarkedSubject(subject) {
  const paren = subject.match(/^(.*?)\s*[([]\s*(cancelled|canceled|rescheduled|changed|off|holiday)\b\s*[:\-–]?\s*([^)\]]*)[)\]]\s*$/i);
  if (paren) {
    return {
      subject: canon(paren[1]) || subject,
      mark: normalizeMark(paren[2] ?? ""),
      reason: canon(paren[3]) || null
    };
  }
  const trail = subject.match(/^(.*?)\s*[|–]\s*(cancelled|canceled|rescheduled|changed|off|holiday)\b\s*[:\-–]?\s*(.*)$/i);
  if (trail && canon(trail[1])) {
    return {
      subject: canon(trail[1]),
      mark: normalizeMark(trail[2] ?? ""),
      reason: canon(trail[3]) || null
    };
  }
  if (/^(cancelled|canceled|off|holiday|rescheduled|changed)$/i.test(subject)) {
    return { subject, mark: normalizeMark(subject), reason: null };
  }
  return { subject, mark: null, reason: null };
}
function slotKeyFor(slot) {
  const when = slot.startMinutes >= 0 ? `${slot.startMinutes}-${slot.endMinutes}` : `row-${slot.row}`;
  return [slot.tabName, slot.date ?? "weekly", slot.division, when].join("|");
}
function normalizeWorkbook(parsed, options) {
  const lectures = [];
  const issues = [...parsed.issues];
  for (const tab of parsed.tabs) {
    for (const slot of tab.slots) {
      const lecture = normalizeSlot(slot, options.courseFallback);
      if (lecture) lectures.push(lecture);
    }
  }
  return { lectures, issues, collegeName: parsed.collegeName, semester: parsed.semester, batch: parsed.batch };
}
function normalizeSlot(slot, courseFallback) {
  const marked = parseMarkedSubject(canon(slot.subject));
  const statusMark = parseStatusToken(slot.statusText);
  const mark = statusMark ?? marked.mark;
  const reason = canon(slot.reasonText) || marked.reason;
  let subject = marked.subject;
  let kind = "lecture";
  let sourceStatus = "scheduled";
  let explicitMark = null;
  let finalReason = reason || null;
  if (/^(lunch(\s*break)?|short\s*break|break|recess)$/i.test(subject) && !mark) {
    kind = "break";
    subject = /lunch/i.test(subject) ? "Lunch break" : "Break";
  } else if (mark === "off" || mark === "cancelled") {
    sourceStatus = "cancelled";
    explicitMark = "cancelled";
    if (mark === "off" || /^off$/i.test(subject)) {
      kind = "off";
      subject = "OFF";
      finalReason = finalReason || "Marked OFF on the official timetable.";
    } else if (/^(cancelled|canceled|holiday)$/i.test(subject)) {
      subject = /^holiday$/i.test(subject) ? "Holiday" : "Cancelled";
      finalReason = finalReason || (subject === "Holiday" ? "Marked as a holiday on the official timetable." : null);
    }
  } else if (mark === "rescheduled" || mark === "changed") {
    explicitMark = mark;
    if (!subject || /^(rescheduled|changed)$/i.test(subject)) subject = "Rescheduled class";
  }
  if (!subject) return null;
  if (kind === "lecture" && !canon(slot.subject) && !canon(slot.statusText)) return null;
  const startMinutes = slot.startMinutes ?? -1;
  const endMinutes = slot.endMinutes ?? -1;
  const weekday = slot.weekday ?? weekdayFromName(slot.tabName) ?? "";
  const key = slotKeyFor({
    tabName: slot.tabName,
    date: slot.date,
    division: slot.division,
    startMinutes,
    endMinutes,
    row: slot.row
  });
  return {
    id: key,
    slotKey: key,
    tabName: slot.tabName,
    course: canon(slot.course) || courseFallback,
    semester: canon(slot.semester),
    batch: canon(slot.batch),
    division: canon(slot.division) || slot.tabName,
    date: slot.date,
    weekday,
    startMinutes,
    endMinutes,
    startLabel: startMinutes >= 0 ? formatMinutes(startMinutes) : "Time not listed",
    endLabel: endMinutes >= 0 ? formatMinutes(endMinutes) : "Time not listed",
    subject,
    faculty: canon(slot.faculty),
    room: canon(slot.room),
    kind,
    sourceStatus,
    reason: finalReason,
    explicitMark,
    recurring: !slot.date
  };
}
function contentFingerprint(lectures, tabs, issues) {
  const lines = lectures.map(
    (lecture) => [
      lecture.slotKey,
      lecture.subject,
      lecture.faculty,
      lecture.room,
      lecture.kind,
      lecture.sourceStatus,
      lecture.reason ?? "",
      lecture.explicitMark ?? "",
      lecture.date ?? "",
      lecture.division,
      lecture.course,
      lecture.semester,
      lecture.batch,
      lecture.startMinutes,
      lecture.endMinutes,
      lecture.tabName,
      lecture.weekday
    ].join("")
  ).sort();
  const issueLines = issues.map((item) => `${item.severity}|${item.tabName}|${item.row ?? ""}|${item.message}`).sort();
  return (0, import_node_crypto2.createHash)("sha256").update(JSON.stringify({ tabs: [...tabs].sort(), lines, issueLines })).digest("hex");
}

// server/src/services/timetableParser.ts
var import_exceljs = __toESM(require("exceljs"), 1);
var HEADER_ALIASES = {
  subject: ["subject", "course name", "module", "paper", "lecture"],
  faculty: ["faculty", "faculty name", "teacher", "professor", "instructor"],
  room: ["room", "classroom", "classroom no", "class room", "venue", "lab", "laboratory"],
  status: ["status"],
  reason: ["reason", "remarks", "remark", "note", "notes"],
  division: ["division", "class", "cohort", "section"],
  date: ["date"],
  day: ["day", "weekday"],
  time: ["time", "timing", "slot", "time slot"],
  start: ["start", "start time", "from"],
  end: ["end", "end time", "to"],
  semester: ["semester", "sem"],
  course: ["course", "programme", "program"]
};
function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${value.getFullYear()}`;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return canon(String(value));
  }
  if (typeof value === "object") {
    const record = value;
    if (Array.isArray(record.richText)) {
      return canon(record.richText.map((part) => part.text ?? "").join(""));
    }
    if (typeof record.text === "string") return canon(record.text);
    if ("result" in record) return cellText(record.result);
  }
  return canon(String(value));
}
function columnIndex(cell) {
  const col = cell.col;
  if (typeof col === "number") return col;
  let index = 0;
  for (const char of String(col).toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index;
}
function loadMatrix(worksheet) {
  const rowCount = Math.min(worksheet.rowCount || worksheet.actualRowCount || 0, 400);
  const colCount = Math.min(Math.max(worksheet.columnCount || worksheet.actualColumnCount || 1, 1), 40);
  return {
    rowCount,
    colCount,
    own(row, col) {
      const cell = worksheet.getCell(row, col);
      const master = cell.master ?? cell;
      if (cell.isMerged && master.address !== cell.address) return "";
      return cellText(cell.value);
    },
    masterOf(row, col) {
      const cell = worksheet.getCell(row, col);
      const master = cell.master ?? cell;
      const text = cellText(master.value);
      if (!text) return null;
      return { row: Number(master.row), col: columnIndex(master), text };
    }
  };
}
function labelAt(matrix, row) {
  const own = matrix.own(row, 1);
  if (own) return own;
  const master = matrix.masterOf(row, 1);
  if (master && master.col === 1) return master.text;
  return "";
}
function classify(label) {
  const text = canon(label).toLowerCase();
  if (!text) return "empty";
  if (parseTimeRange(label)) return "time";
  if (text === "timing" || text === "time") return "header";
  if (text === "faculty" || text === "teacher" || text === "professor" || text === "faculty name") return "faculty";
  if (/^(classroom no\.?|classroom|class room|room no\.?|room|venue|lab|laboratory)$/.test(text)) return "room";
  if (text === "status") return "status";
  if (/^(reason|remarks|remark|note|notes)$/.test(text)) return "reason";
  if (/^(semester|sem)\b/.test(text) || /^batch\b/.test(text) || parseDateLabel(label)) return "meta";
  return "other";
}
function valueAt(matrix, row, col, allowTimeMerge) {
  const own = matrix.own(row, col);
  if (own) return own;
  const master = matrix.masterOf(row, col);
  if (!master?.text) return "";
  if (master.row === row) return master.text;
  if (!allowTimeMerge) return "";
  if (classify(labelAt(matrix, master.row)) === "time") return master.text;
  return "";
}
function issue(tabName, message, severity, row, snippet) {
  return { tabName, message, severity, row, snippet };
}
function readMeta(matrix, headerRow, dateOrder) {
  let collegeName = null;
  let semester = null;
  let batch = null;
  let date = null;
  let weekday = null;
  const notes = [];
  for (let row = 1; row < headerRow; row += 1) {
    const text = labelAt(matrix, row);
    if (!text) continue;
    const semesterMatch = text.match(/^(?:semester|sem)\s*[-–:]?\s*([0-9]+)/i);
    const batchMatch = text.match(/^batch\s*[-–:]?\s*(.+)/i);
    const parsedDate = parseDateLabel(text, dateOrder);
    if (semesterMatch) semester = semesterMatch[1] ?? semester;
    else if (batchMatch) batch = canon(batchMatch[1]);
    else if (parsedDate) {
      date = parsedDate.iso;
      weekday = parsedDate.computedWeekday;
      if (parsedDate.weekday !== parsedDate.computedWeekday) {
        notes.push(`Date ${text} says ${parsedDate.weekday}, which does not match ${parsedDate.computedWeekday}. The calendar date was used.`);
      }
    } else if (!collegeName && text.length > 3) collegeName = canon(text);
  }
  return { collegeName, semester, batch, date, weekday, notes };
}
function divisionsOn(matrix, headerRow) {
  const divisions = [];
  for (let col = 2; col <= matrix.colCount; col += 1) {
    let name = matrix.own(headerRow, col);
    const master = matrix.masterOf(headerRow, col);
    if (!name && master && master.row === headerRow) name = master.text;
    name = canon(name);
    if (!name || name.toLowerCase() === "timing") continue;
    if (master && master.col !== col && divisions.some((division) => division.col === master.col)) continue;
    divisions.push({ col, name });
  }
  return divisions;
}
function parseGrid(matrix, tabName, dateOrder) {
  let headerRow = 0;
  for (let row2 = 1; row2 <= Math.min(matrix.rowCount, 40); row2 += 1) {
    if (canon(labelAt(matrix, row2)).toLowerCase() === "timing") {
      headerRow = row2;
      break;
    }
  }
  if (!headerRow) return null;
  const issues = [];
  const meta = readMeta(matrix, headerRow, dateOrder);
  for (const note of meta.notes) issues.push(issue(tabName, note, "warning"));
  const tabWeekday = weekdayFromName(tabName);
  const weekday = meta.weekday ?? tabWeekday;
  if (meta.weekday && tabWeekday && meta.weekday !== tabWeekday) {
    issues.push(issue(tabName, `Tab name \u201C${tabName}\u201D does not match the date's weekday ${meta.weekday}.`, "warning"));
  }
  const divisions = divisionsOn(matrix, headerRow);
  if (divisions.length === 0) {
    issues.push(issue(tabName, "The Timing header has no cohort or division columns, so no lectures were read from this tab.", "error", headerRow));
    return { name: tabName, collegeName: meta.collegeName, semester: meta.semester, batch: meta.batch, date: meta.date, weekday, slots: [], issues };
  }
  const slots = [];
  let row = headerRow + 1;
  while (row <= matrix.rowCount) {
    const master = matrix.masterOf(row, 1);
    if (master && master.col === 1 && master.row === headerRow) {
      row += 1;
      continue;
    }
    const label = labelAt(matrix, row);
    const role = classify(label);
    if (role === "empty" || role === "header" || role === "meta") {
      row += 1;
      continue;
    }
    if (role !== "time") {
      if (role === "other") {
        issues.push(issue(tabName, "This row is not a time slot, faculty row, or classroom row, so it was left out of the timetable.", "warning", row, label.slice(0, 180)));
      }
      row += 1;
      continue;
    }
    const range = parseTimeRange(label);
    const blockRow = row;
    const extras = [];
    let cursor = row + 1;
    while (cursor <= matrix.rowCount) {
      const continued = matrix.masterOf(cursor, 1);
      if (continued && continued.col === 1 && continued.row === blockRow) {
        cursor += 1;
        continue;
      }
      const nextLabel = labelAt(matrix, cursor);
      const nextRole = classify(nextLabel);
      if (nextRole === "time" || nextRole === "header" || nextRole === "empty" || nextRole === "meta") break;
      if (nextRole === "faculty" || nextRole === "room" || nextRole === "status" || nextRole === "reason") {
        extras.push({ role: nextRole, row: cursor });
        cursor += 1;
        continue;
      }
      issues.push(issue(tabName, "This row sits inside a time block but does not match a known field, so its text was not attached to a lecture.", "warning", cursor, nextLabel.slice(0, 180)));
      cursor += 1;
    }
    if (!range) {
      issues.push(issue(tabName, `Could not parse the time \u201C${label}\u201D.`, "warning", blockRow, label));
    }
    const facultyRow = extras.find((extra) => extra.role === "faculty")?.row;
    const roomRow = extras.find((extra) => extra.role === "room")?.row;
    const statusRow = extras.find((extra) => extra.role === "status")?.row;
    const reasonRow = extras.find((extra) => extra.role === "reason")?.row;
    for (const division of divisions) {
      const subject = valueAt(matrix, blockRow, division.col, true);
      const faculty = facultyRow ? valueAt(matrix, facultyRow, division.col, false) : "";
      const room = roomRow ? valueAt(matrix, roomRow, division.col, false) : "";
      const statusText = statusRow ? valueAt(matrix, statusRow, division.col, false) : "";
      const reasonText = reasonRow ? valueAt(matrix, reasonRow, division.col, false) : "";
      if (!canon(subject) && !canon(statusText)) continue;
      slots.push({
        tabName,
        course: null,
        semester: meta.semester,
        batch: meta.batch,
        division: division.name,
        date: meta.date,
        weekday,
        startMinutes: range?.start ?? null,
        endMinutes: range?.end ?? null,
        subject,
        faculty,
        room,
        statusText,
        reasonText,
        row: blockRow
      });
    }
    row = cursor;
  }
  return { name: tabName, collegeName: meta.collegeName, semester: meta.semester, batch: meta.batch, date: meta.date, weekday, slots, issues };
}
function headerMap(matrix, row) {
  const map = /* @__PURE__ */ new Map();
  for (let col = 1; col <= matrix.colCount; col += 1) {
    const text = canon(matrix.own(row, col) || matrix.masterOf(row, col)?.text || "").toLowerCase();
    if (!text) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(text) && !map.has(field)) map.set(field, col);
    }
  }
  return map;
}
function looksLikeRowHeader(map) {
  const hasSubject = map.has("subject");
  const hasWhen = map.has("time") || map.has("start");
  const signals = ["subject", "faculty", "room", "time", "start", "status"].filter((field) => map.has(field)).length;
  return hasSubject && hasWhen && signals >= 2;
}
function parseRowTable(matrix, tabName, dateOrder) {
  let headerRow = 0;
  let columns = /* @__PURE__ */ new Map();
  for (let row = 1; row <= Math.min(matrix.rowCount, 40); row += 1) {
    const map = headerMap(matrix, row);
    if (looksLikeRowHeader(map)) {
      headerRow = row;
      columns = map;
      break;
    }
  }
  if (!headerRow) return null;
  const issues = [];
  const meta = readMeta(matrix, headerRow, dateOrder);
  const slots = [];
  const tabWeekday = weekdayFromName(tabName);
  for (let row = headerRow + 1; row <= matrix.rowCount; row += 1) {
    const read = (field) => {
      const col = columns.get(field);
      if (!col) return "";
      return valueAt(matrix, row, col, false);
    };
    const values = ["subject", "faculty", "room", "status", "time", "start", "date", "division"].map(read);
    if (values.every((value) => !canon(value))) continue;
    const subject = read("subject");
    const statusText = read("status");
    const timeText = read("time");
    const startText = read("start");
    const endText = read("end");
    const range = timeText ? parseTimeRange(timeText) : null;
    const start = range?.start ?? (startText ? parseTimeTokenSafe(startText) : null);
    const end = range?.end ?? (endText ? parseTimeTokenSafe(endText) : null);
    if ((timeText || startText) && (start === null || end === null)) {
      issues.push(issue(tabName, "This lecture row has a time that could not be parsed. It is still listed.", "warning", row, timeText || `${startText} ${endText}`));
    } else if (start === null || end === null) {
      issues.push(issue(tabName, "This lecture row has no usable time. It is still listed so the information is not dropped.", "warning", row, subject || statusText));
    }
    const dateText = read("date");
    const parsedDate = dateText ? parseDateLabel(dateText, dateOrder) : null;
    const dayText = read("day");
    const division = canon(read("division")) || tabName;
    slots.push({
      tabName,
      course: canon(read("course")) || null,
      semester: canon(read("semester")) || meta.semester,
      batch: meta.batch,
      division,
      date: parsedDate?.iso ?? meta.date,
      weekday: parsedDate?.computedWeekday ?? weekdayFromName(dayText) ?? meta.weekday ?? tabWeekday,
      startMinutes: start,
      endMinutes: end,
      subject,
      faculty: read("faculty"),
      room: read("room"),
      statusText,
      reasonText: read("reason"),
      row
    });
  }
  return {
    name: tabName,
    collegeName: meta.collegeName,
    semester: meta.semester,
    batch: meta.batch,
    date: meta.date,
    weekday: meta.weekday ?? tabWeekday,
    slots,
    issues
  };
}
function parseTimeTokenSafe(token) {
  if (!canon(token)) return null;
  if (!/(AM|PM)/i.test(token) && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(canon(token))) return null;
  return parseTimeToken(token);
}
async function workbookFrom(source) {
  if (!Buffer.isBuffer(source)) return source;
  const workbook = new import_exceljs.default.Workbook();
  await workbook.xlsx.load(source);
  return workbook;
}
async function parseTimetableSource(source, options = {}) {
  const dateOrder = options.dateOrder ?? "DMY";
  const workbook = await workbookFrom(source);
  const tabs = [];
  workbook.eachSheet((worksheet) => {
    const tabName = canon(worksheet.name) || "Untitled";
    const matrix = loadMatrix(worksheet);
    if (matrix.rowCount === 0) {
      tabs.push({
        name: tabName,
        collegeName: null,
        semester: null,
        batch: null,
        date: null,
        weekday: weekdayFromName(tabName),
        slots: [],
        issues: [issue(tabName, "This tab is empty.", "warning")]
      });
      return;
    }
    const grid = parseGrid(matrix, tabName, dateOrder);
    const parsed = grid ?? parseRowTable(matrix, tabName, dateOrder);
    if (!parsed) {
      tabs.push({
        name: tabName,
        collegeName: null,
        semester: null,
        batch: null,
        date: null,
        weekday: weekdayFromName(tabName),
        slots: [],
        issues: [issue(tabName, "This tab does not match a cohort grid or a lecture table. No rows were imported from it.", "error")]
      });
      return;
    }
    tabs.push(parsed);
  });
  const issues = tabs.flatMap((tab) => tab.issues);
  return {
    tabs,
    issues,
    collegeName: tabs.find((tab) => tab.collegeName)?.collegeName ?? null,
    semester: tabs.find((tab) => tab.semester)?.semester ?? null,
    batch: tabs.find((tab) => tab.batch)?.batch ?? null
  };
}

// server/src/services/durableState.ts
var import_blob = require("@vercel/blob");

// server/src/services/timetableArchive.ts
function archiveSignature(archive) {
  const lectures = archive.lectures.map((lecture) => `${lecture.id}	${lecture.sourceStatus}	${lecture.subject}	${lecture.faculty}	${lecture.room}	${lecture.startMinutes}`).sort().join("\n");
  const changes = archive.changes.map((change) => `${change.dedupeKey}	${change.type}	${change.summary}`).sort().join("\n");
  return `${archive.sync.contentHash ?? ""}
${lectures}
${changes}`;
}
function dayKey(lecture) {
  return `${lecture.tabName}|${lecture.date ?? ""}`;
}
function publishedDates(archive) {
  return new Set(archive.lectures.map((lecture) => lecture.date).filter((date) => Boolean(date)));
}
function mergeArchives(left, right) {
  const leftAt = left.sync.lastSuccessAt ?? "";
  const rightAt = right.sync.lastSuccessAt ?? "";
  const newer = rightAt >= leftAt ? right : left;
  const older = newer === right ? left : right;
  const newerDates = publishedDates(newer);
  const olderDates = publishedDates(older);
  const sameWeek = newerDates.size === 0 || olderDates.size === 0 || [...newerDates].some((date) => olderDates.has(date));
  if (!sameWeek) {
    return {
      ...newer,
      changes: newer.changes.filter((change) => !change.date || newerDates.has(change.date))
    };
  }
  const ids = new Set(newer.lectures.map((lecture) => lecture.id));
  const days = new Set(newer.lectures.filter((lecture) => lecture.kind !== "break" && lecture.date).map(dayKey));
  const kept = older.lectures.filter(
    (lecture) => lecture.kind === "lecture" && lecture.sourceStatus === "cancelled" && !ids.has(lecture.id) && days.has(dayKey(lecture))
  );
  const changes = /* @__PURE__ */ new Map();
  const keep = (change) => newerDates.size === 0 || !change.date || newerDates.has(change.date);
  for (const change of newer.changes) {
    if (keep(change)) changes.set(change.dedupeKey, change);
  }
  for (const change of older.changes) {
    if (!keep(change)) continue;
    const current = changes.get(change.dedupeKey);
    if (!current) {
      changes.set(change.dedupeKey, change);
      continue;
    }
    if (current.type === "removed" && change.type === "cancelled") {
      changes.set(change.dedupeKey, { ...change, id: current.id });
    }
  }
  return {
    version: 1,
    savedAt: newer.savedAt >= older.savedAt ? newer.savedAt : older.savedAt,
    lectures: [...newer.lectures, ...kept],
    changes: [...changes.values()],
    sync: newer.sync
  };
}

// server/src/services/durableState.ts
var pathname = "timetable-state.json";
var lastSignature = "";
function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || "";
}
function exportArchive(db2) {
  return {
    version: 1,
    savedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lectures: readLectures(db2),
    changes: readAllChanges(db2),
    sync: readSyncState(db2)
  };
}
function importArchive(db2, archive) {
  db2.exec("BEGIN");
  try {
    replaceLectures(db2, archive.lectures);
    replaceChangeRows(db2, archive.changes);
    writeSyncState(db2, { ...archive.sync, bootstrapped: true });
    db2.exec("COMMIT");
  } catch (error) {
    db2.exec("ROLLBACK");
    throw error;
  }
}
function isArchive(value) {
  if (!value || typeof value !== "object") return false;
  const archive = value;
  return archive.version === 1 && Array.isArray(archive.lectures) && Array.isArray(archive.changes) && Boolean(archive.sync);
}
async function readRemote() {
  const result = await (0, import_blob.get)(pathname, { access: "private", token: blobToken() });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const parsed = JSON.parse(await new Response(result.stream).text());
  return isArchive(parsed) ? parsed : null;
}
async function hydrateArchive(db2) {
  if (!blobToken() || readSyncState(db2).bootstrapped) return false;
  const archive = await readRemote();
  if (!archive?.sync.bootstrapped) return false;
  importArchive(db2, archive);
  lastSignature = archiveSignature(archive);
  console.log("[sync] loaded saved timetable history");
  return true;
}
async function publishArchive(db2) {
  if (!blobToken() || !readSyncState(db2).bootstrapped) return false;
  const local = exportArchive(db2);
  if (archiveSignature(local) === lastSignature) return false;
  const remote = await readRemote();
  const merged = remote ? mergeArchives(remote, local) : local;
  if (archiveSignature(merged) !== archiveSignature(local)) importArchive(db2, merged);
  const signature = archiveSignature(merged);
  if (remote && signature === archiveSignature(remote)) {
    lastSignature = signature;
    return false;
  }
  merged.savedAt = (/* @__PURE__ */ new Date()).toISOString();
  await (0, import_blob.put)(pathname, JSON.stringify(merged), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: blobToken()
  });
  lastSignature = signature;
  console.log("[sync] saved timetable history");
  return true;
}

// server/src/services/syncScheduler.ts
var inflight = /* @__PURE__ */ new WeakMap();
function dropChangesFromOtherWeeks(db2, lectures) {
  const dates = new Set(lectures.map((lecture) => lecture.date).filter((date) => Boolean(date)));
  if (dates.size === 0) return;
  const changes = readAllChanges(db2);
  const kept = changes.filter((change) => !change.date || dates.has(change.date));
  if (kept.length === changes.length) return;
  replaceChangeRows(db2, kept);
}
function replacesPublishedWeek(previous, next) {
  const previousDates = new Set(previous.map((lecture) => lecture.date).filter((date) => Boolean(date)));
  const nextDates = new Set(next.map((lecture) => lecture.date).filter((date) => Boolean(date)));
  if (previousDates.size === 0 || nextDates.size === 0) return false;
  for (const date of nextDates) {
    if (previousDates.has(date)) return false;
  }
  return true;
}
function withCarriedTabs(previous, lectures, issues) {
  const counts = /* @__PURE__ */ new Map();
  for (const lecture of lectures) counts.set(lecture.tabName, (counts.get(lecture.tabName) ?? 0) + 1);
  const fatalTabs = new Set(issues.filter((issue2) => issue2.severity === "error").map((issue2) => issue2.tabName));
  const carried = [...lectures];
  const notes = [];
  for (const tabName of fatalTabs) {
    if ((counts.get(tabName) ?? 0) > 0) continue;
    const prior = previous.filter((lecture) => lecture.tabName === tabName);
    if (prior.length === 0) continue;
    carried.push(...prior.map(toNormalized));
    notes.push({
      tabName,
      severity: "warning",
      message: "Showing the last good copy of this tab because the latest version could not be parsed."
    });
  }
  return { lectures: carried, issues: [...issues, ...notes] };
}
async function performSync(ctx) {
  const now = ctx.now ?? /* @__PURE__ */ new Date();
  const attemptAt = now.toISOString();
  try {
    await hydrateArchive(ctx.db);
    const current = readSyncState(ctx.db);
    const { buffer } = await ctx.load();
    const parsed = await parseTimetableSource(buffer, { dateOrder: ctx.config.dateOrder });
    const normalized = normalizeWorkbook(parsed, { courseFallback: ctx.config.courseName });
    persistCancelledRemovals(ctx.db);
    const previous = loadSnapshot(ctx.db);
    const retained = withCarriedTabs(previous, normalized.lectures, normalized.issues);
    const tabNames = parsed.tabs.map((tab) => tab.name);
    const contentHash = contentFingerprint(retained.lectures, tabNames, retained.issues);
    dropChangesFromOtherWeeks(ctx.db, retained.lectures);
    if (current.bootstrapped && current.contentHash === contentHash) {
      writeSyncState(ctx.db, successState(current, attemptAt, contentHash, tabNames, retained.issues, ctx.config.spreadsheetTitle));
      await publishArchive(ctx.db);
      return { ok: true, unchanged: true, changeCount: 0, error: null };
    }
    const freshWeek = current.bootstrapped && replacesPublishedWeek(previous, retained.lectures);
    const stored = current.bootstrapped && !freshWeek ? compareSnapshots(previous, retained.lectures, {
      now,
      previousTabs: current.tabNames,
      nextTabs: tabNames,
      bootstrapped: true
    }) : { lectures: initialSnapshot(retained.lectures), events: [] };
    ctx.db.exec("BEGIN");
    try {
      if (freshWeek) replaceChangeRows(ctx.db, []);
      saveSnapshot(ctx.db, stored.lectures);
      recordChanges(ctx.db, stored.events);
      writeSyncState(ctx.db, {
        ...successState(current, attemptAt, contentHash, tabNames, retained.issues, ctx.config.spreadsheetTitle),
        bootstrapped: true
      });
      ctx.db.exec("COMMIT");
    } catch (error) {
      ctx.db.exec("ROLLBACK");
      throw error;
    }
    await publishArchive(ctx.db);
    return { ok: true, unchanged: false, changeCount: stored.events.length, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The spreadsheet could not be read.";
    writeSyncState(ctx.db, {
      ...readSyncState(ctx.db),
      lastAttemptAt: attemptAt,
      lastError: message
    });
    return { ok: false, unchanged: false, changeCount: 0, error: message };
  }
}
function successState(current, attemptAt, contentHash, tabNames, parseIssues, title) {
  return {
    ...current,
    lastAttemptAt: attemptAt,
    lastSuccessAt: attemptAt,
    lastError: null,
    contentHash,
    tabNames,
    parseIssues,
    spreadsheetTitle: title
  };
}
function runSync(ctx) {
  const existing = inflight.get(ctx.db);
  if (existing) return existing;
  const pending = performSync(ctx).finally(() => {
    inflight.delete(ctx.db);
  });
  inflight.set(ctx.db, pending);
  return pending;
}

// server/src/app.ts
var import_meta2 = {};
function buildBootstrap(db2, config2, now = /* @__PURE__ */ new Date()) {
  const state = readSyncState(db2);
  const zone = zonedParts(now, config2.timezone);
  persistCancelledRemovals(db2);
  const changes = listChanges(db2, 80);
  const restored = restoreRemovedLectures(loadSnapshot(db2), changes);
  const lectures = restored.lectures.map((lecture) => presentLecture(lecture, now, config2.highlightHours)).sort((a, b) => {
    const date = (a.date ?? "").localeCompare(b.date ?? "");
    if (date !== 0) return date;
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    const division = a.division.localeCompare(b.division);
    if (division !== 0) return division;
    return a.subject.localeCompare(b.subject);
  });
  const dates = lectures.map((lecture) => lecture.date).filter((date) => Boolean(date)).sort();
  return {
    collegeName: config2.collegeName,
    schoolName: config2.schoolName,
    courseName: config2.courseName,
    spreadsheetId: config2.spreadsheetId,
    spreadsheetTitle: state.spreadsheetTitle || config2.spreadsheetTitle,
    spreadsheetUrl: spreadsheetUrl(config2.spreadsheetId),
    timezone: config2.timezone,
    today: zone.iso,
    now: now.toISOString(),
    weekStart: dates[0] ?? null,
    weekEnd: dates[dates.length - 1] ?? null,
    sync: {
      lastSuccessAt: state.lastSuccessAt,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      stale: Boolean(state.lastError) || !state.lastSuccessAt,
      bootstrapped: state.bootstrapped,
      intervalSeconds: config2.syncIntervalSeconds,
      highlightHours: config2.highlightHours,
      tabNames: state.tabNames,
      contentHash: state.contentHash,
      source: "google-sheets-xlsx-export"
    },
    parseIssues: state.parseIssues,
    lectures,
    changes: changes.map((change) => {
      if (!change.lectureId || !restored.restoredIds.has(change.lectureId) || change.type !== "removed") return change;
      const subject = change.previous?.subject || "A lecture";
      return { ...change, type: "cancelled", summary: `${subject} lecture cancelled.` };
    })
  };
}
function createApp(db2, config2, load, options) {
  const app2 = (0, import_express.default)();
  app2.disable("x-powered-by");
  app2.use((0, import_cors.default)({ origin: config2.clientOrigin ?? true }));
  if (process.env.VERCEL) {
    app2.use((req, _res, next) => {
      const url = req.url || "/";
      if (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")) {
        next();
        return;
      }
      req.url = url.startsWith("/") ? `/api${url}` : `/api/${url}`;
      next();
    });
  }
  async function syncIfStale() {
    if (!options?.syncOnRead) return;
    const state = readSyncState(db2);
    const age = state.lastSuccessAt ? Date.now() - new Date(state.lastSuccessAt).getTime() : Number.POSITIVE_INFINITY;
    if (age > config2.syncIntervalSeconds * 1e3) await runSync({ db: db2, config: config2, load });
  }
  app2.get("/api/health", (_req, res) => {
    const state = readSyncState(db2);
    res.status(state.lastSuccessAt ? 200 : 503).json({
      ok: Boolean(state.lastSuccessAt),
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError
    });
  });
  app2.get("/api/bootstrap", async (_req, res) => {
    await syncIfStale();
    res.json(buildBootstrap(db2, config2));
  });
  app2.get("/api/calendar.ics", async (req, res) => {
    await syncIfStale();
    const division = typeof req.query.division === "string" ? req.query.division.trim() : "";
    const snapshot = buildBootstrap(db2, config2);
    const lectures = division ? snapshot.lectures.filter((lecture) => lecture.division === division) : [];
    if (!division || lectures.length === 0) {
      res.status(404).type("text/plain").send("Unknown cohort.");
      return;
    }
    const name = cohortName(division);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.query.download === "1") {
      const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "timetable"}.ics`;
      res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    }
    res.send(calendarFile(lectures, config2.timezone, name));
  });
  app2.get("/api/changes", (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
    res.json({ changes: listChanges(db2, limit) });
  });
  app2.post("/api/sync", async (_req, res) => {
    await runSync({ db: db2, config: config2, load });
    res.json(buildBootstrap(db2, config2));
  });
  if (!process.env.VERCEL) {
    const clientDist = import_node_path3.default.resolve(import_node_path3.default.dirname((0, import_node_url2.fileURLToPath)(import_meta2.url)), "../../client/dist");
    if (import_node_fs3.default.existsSync(clientDist)) {
      app2.use(import_express.default.static(clientDist));
      app2.get(/^(?!\/api).*/, (_req, res) => {
        res.sendFile(import_node_path3.default.join(clientDist, "index.html"));
      });
    }
  }
  return app2;
}

// server/src/services/googleSheetsService.ts
var import_node_crypto3 = require("node:crypto");
async function fetchSpreadsheet(config2) {
  if (!config2.spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not configured.");
  }
  const response = await fetch(spreadsheetExportUrl(config2.spreadsheetId), {
    redirect: "follow",
    signal: AbortSignal.timeout(2e4),
    headers: { "User-Agent": "itm-timetable-portal" }
  });
  if (!response.ok) {
    throw new Error(`Google Sheets export failed (${response.status}). The sheet may be private or temporarily unavailable.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 4 || buffer[0] !== 80 || buffer[1] !== 75) {
    throw new Error("The spreadsheet export was not an Excel file. Share the sheet as \u201CAnyone with the link can view\u201D.");
  }
  const hash = (0, import_node_crypto3.createHash)("sha256").update(buffer).digest("hex");
  return { buffer, hash };
}

// server/src/vercel.ts
loadEnvFiles();
var config = getConfig();
var databasePath = process.env.VERCEL ? "/tmp/timetable.sqlite" : config.databasePath;
var db = openDatabase(databasePath);
var app = createApp(db, { ...config, databasePath }, () => fetchSpreadsheet(config), {
  syncOnRead: Boolean(process.env.VERCEL)
});
var vercel_default = app;
module.exports = module.exports.default || module.exports;
