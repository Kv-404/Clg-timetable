import { get, put } from "@vercel/blob";
import {
  readAllChanges,
  readLectures,
  readSyncState,
  replaceChangeRows,
  replaceLectures,
  writeSyncState,
  type AppDatabase,
} from "../db.ts";
import { archiveSignature, mergeArchives, type TimetableArchive } from "./timetableArchive.ts";

const pathname = "timetable-state.json";
let lastSignature = "";

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || "";
}

export function exportArchive(db: AppDatabase): TimetableArchive {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    lectures: readLectures(db),
    changes: readAllChanges(db),
    sync: readSyncState(db),
  };
}

export function importArchive(db: AppDatabase, archive: TimetableArchive) {
  db.exec("BEGIN");
  try {
    replaceLectures(db, archive.lectures);
    replaceChangeRows(db, archive.changes);
    writeSyncState(db, { ...archive.sync, bootstrapped: true });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function isArchive(value: unknown): value is TimetableArchive {
  if (!value || typeof value !== "object") return false;
  const archive = value as TimetableArchive;
  return archive.version === 1 && Array.isArray(archive.lectures) && Array.isArray(archive.changes) && Boolean(archive.sync);
}

async function readRemote() {
  const result = await get(pathname, { access: "private", token: blobToken() });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const parsed: unknown = JSON.parse(await new Response(result.stream).text());
  return isArchive(parsed) ? parsed : null;
}

/** On a cold start the local database is empty. Load the last saved timetable before comparing the sheet. */
export async function hydrateArchive(db: AppDatabase) {
  if (!blobToken() || readSyncState(db).bootstrapped) return false;
  const archive = await readRemote();
  if (!archive?.sync.bootstrapped) return false;
  importArchive(db, archive);
  lastSignature = archiveSignature(archive);
  console.log("[sync] loaded saved timetable history");
  return true;
}

/** Writes the timetable and its change log so the next cold start still knows which lectures were removed. */
export async function publishArchive(db: AppDatabase) {
  if (!blobToken() || !readSyncState(db).bootstrapped) return false;
  const local = exportArchive(db);
  if (archiveSignature(local) === lastSignature) return false;
  const remote = await readRemote();
  const merged = remote ? mergeArchives(remote, local) : local;
  if (archiveSignature(merged) !== archiveSignature(local)) importArchive(db, merged);
  const signature = archiveSignature(merged);
  if (remote && signature === archiveSignature(remote)) {
    lastSignature = signature;
    return false;
  }
  merged.savedAt = new Date().toISOString();
  await put(pathname, JSON.stringify(merged), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: blobToken(),
  });
  lastSignature = signature;
  console.log("[sync] saved timetable history");
  return true;
}
