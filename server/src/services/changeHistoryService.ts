import type { AppDatabase } from "../db.ts";
import { insertChanges, readChanges } from "../db.ts";
import type { ChangeDraft } from "../model.ts";

export function recordChanges(db: AppDatabase, drafts: ChangeDraft[]) {
  insertChanges(db, drafts);
}

export function listChanges(db: AppDatabase, limit = 50) {
  return readChanges(db, limit);
}
