import type { StoredChange, SyncState } from "../db.ts";
import type { StoredLecture } from "../model.ts";

/** Saved timetable, change log, and sync cursor. This is what survives a server restart. */
export interface TimetableArchive {
  version: 1;
  savedAt: string;
  lectures: StoredLecture[];
  changes: StoredChange[];
  sync: SyncState;
}

export function archiveSignature(archive: TimetableArchive) {
  const lectures = archive.lectures
    .map((lecture) => `${lecture.id}\t${lecture.sourceStatus}\t${lecture.subject}\t${lecture.faculty}\t${lecture.room}\t${lecture.startMinutes}`)
    .sort()
    .join("\n");
  const changes = archive.changes.map((change) => `${change.dedupeKey}\t${change.type}\t${change.summary}`).sort().join("\n");
  return `${archive.sync.contentHash ?? ""}\n${lectures}\n${changes}`;
}

function dayKey(lecture: StoredLecture) {
  return `${lecture.tabName}|${lecture.date ?? ""}`;
}

/**
 * The newer snapshot wins. A cancelled lecture from the older copy is kept
 * when that day is still published and the newer copy no longer lists it.
 */
export function mergeArchives(left: TimetableArchive, right: TimetableArchive): TimetableArchive {
  const leftAt = left.sync.lastSuccessAt ?? "";
  const rightAt = right.sync.lastSuccessAt ?? "";
  const newer = rightAt >= leftAt ? right : left;
  const older = newer === right ? left : right;
  const ids = new Set(newer.lectures.map((lecture) => lecture.id));
  const days = new Set(newer.lectures.filter((lecture) => lecture.kind !== "break" && lecture.date).map(dayKey));
  const kept = older.lectures.filter(
    (lecture) =>
      lecture.kind === "lecture" &&
      lecture.sourceStatus === "cancelled" &&
      !ids.has(lecture.id) &&
      days.has(dayKey(lecture)),
  );
  const changes = new Map<string, StoredChange>();
  for (const change of newer.changes) changes.set(change.dedupeKey, change);
  for (const change of older.changes) {
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
    sync: newer.sync,
  };
}
