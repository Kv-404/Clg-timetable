import type { AppDatabase } from "../db.ts";
import { readChanges } from "../db.ts";
import { loadSnapshot, saveSnapshot } from "./timetableSnapshotService.ts";
import { restoreRemovedLectures } from "./restoreRemoved.ts";

/** Writes a removed lecture back into the saved timetable as cancelled, and records that in the change log. */
export function persistCancelledRemovals(db: AppDatabase) {
  const restored = restoreRemovedLectures(loadSnapshot(db), readChanges(db, 500));
  if (restored.restoredIds.size === 0) return restored;
  const update = db.prepare("UPDATE change_events SET type = 'cancelled', summary = ? WHERE id = ? AND type = 'removed'");
  db.exec("BEGIN");
  try {
    saveSnapshot(db, restored.lectures);
    for (const row of restored.rewritten) update.run(row.summary, row.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return restored;
}
