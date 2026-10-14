import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ChangeEvent, ParseIssue } from "../../shared/types.ts";
import type { ChangeDraft, StoredLecture } from "./model.ts";

export interface StoredChange extends ChangeDraft {
  id: number;
}

export type AppDatabase = DatabaseSync;

export interface SyncState {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  bootstrapped: boolean;
  contentHash: string | null;
  tabNames: string[];
  parseIssues: ParseIssue[];
  spreadsheetTitle: string | null;
}

export function openDatabase(file: string) {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
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
  const existing = db.prepare("SELECT id FROM sync_state WHERE id = 1").get();
  if (!existing) {
    db.prepare("INSERT INTO sync_state (id, bootstrapped) VALUES (1, 0)").run();
  }
  return db;
}

export function readSyncState(db: AppDatabase): SyncState {
  const row = db.prepare(`
    SELECT last_success_at, last_attempt_at, last_error, bootstrapped, content_hash,
           tab_names_json, parse_issues_json, spreadsheet_title
    FROM sync_state WHERE id = 1
  `).get() as {
    last_success_at: string | null;
    last_attempt_at: string | null;
    last_error: string | null;
    bootstrapped: number;
    content_hash: string | null;
    tab_names_json: string;
    parse_issues_json: string;
    spreadsheet_title: string | null;
  };
  return {
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
    bootstrapped: row.bootstrapped === 1,
    contentHash: row.content_hash,
    tabNames: JSON.parse(row.tab_names_json) as string[],
    parseIssues: JSON.parse(row.parse_issues_json) as ParseIssue[],
    spreadsheetTitle: row.spreadsheet_title,
  };
}

export function writeSyncState(db: AppDatabase, state: SyncState) {
  db.prepare(`
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
    state.spreadsheetTitle,
  );
}

export function readLectures(db: AppDatabase): StoredLecture[] {
  const rows = db.prepare("SELECT json FROM lectures").all() as { json: string }[];
  return rows.map((row) => JSON.parse(row.json) as StoredLecture);
}

export function replaceLectures(db: AppDatabase, lectures: StoredLecture[]) {
  db.exec("DELETE FROM lectures");
  const insert = db.prepare("INSERT INTO lectures (id, json) VALUES (?, ?)");
  for (const lecture of lectures) insert.run(lecture.id, JSON.stringify(lecture));
}

export function insertChanges(db: AppDatabase, drafts: ChangeDraft[]) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO change_events (
      dedupe_key, detected_at, type, lecture_id, division, course, semester, tab_name,
      date, weekday, summary, previous_json, next_json, fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const draft of drafts) {
    insert.run(
      draft.dedupeKey,
      draft.detectedAt,
      draft.type,
      draft.lectureId,
      draft.division,
      draft.course,
      draft.semester,
      draft.tabName,
      draft.date,
      draft.weekday,
      draft.summary,
      draft.previous ? JSON.stringify(draft.previous) : null,
      draft.next ? JSON.stringify(draft.next) : null,
      JSON.stringify(draft.fields),
    );
  }
}

export function readAllChanges(db: AppDatabase): StoredChange[] {
  const rows = db.prepare(`
    SELECT id, dedupe_key, detected_at, type, lecture_id, division, course, semester, tab_name,
           date, weekday, summary, previous_json, next_json, fields_json
    FROM change_events
    ORDER BY id ASC
  `).all() as Array<{
    id: number;
    dedupe_key: string;
    detected_at: string;
    type: string;
    lecture_id: string | null;
    division: string | null;
    course: string | null;
    semester: string | null;
    tab_name: string | null;
    date: string | null;
    weekday: string | null;
    summary: string;
    previous_json: string | null;
    next_json: string | null;
    fields_json: string | null;
  }>;
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
    fields: row.fields_json ? JSON.parse(row.fields_json) : [],
  }));
}

export function replaceChangeRows(db: AppDatabase, rows: StoredChange[]) {
  db.exec("DELETE FROM change_events");
  const insert = db.prepare(`
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
      JSON.stringify(row.fields),
    );
  }
  const max = rows.reduce((highest, row) => Math.max(highest, row.id), 0);
  const updated = db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'change_events'").run(max);
  if (updated.changes === 0 && max > 0) {
    db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('change_events', ?)").run(max);
  }
}

export function readChanges(db: AppDatabase, limit = 50): ChangeEvent[] {
  const rows = db.prepare(`
    SELECT id, detected_at, type, lecture_id, division, course, semester, tab_name,
           date, weekday, summary, previous_json, next_json, fields_json
    FROM change_events
    ORDER BY detected_at DESC, id DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    detected_at: string;
    type: string;
    lecture_id: string | null;
    division: string | null;
    course: string | null;
    semester: string | null;
    tab_name: string | null;
    date: string | null;
    weekday: string | null;
    summary: string;
    previous_json: string | null;
    next_json: string | null;
    fields_json: string | null;
  }>;
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
    fields: row.fields_json ? JSON.parse(row.fields_json) : [],
  }));
}
