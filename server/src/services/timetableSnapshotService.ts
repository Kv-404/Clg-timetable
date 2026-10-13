import type { AppDatabase } from "../db.ts";
import { readLectures, replaceLectures } from "../db.ts";
import type { NormalizedLecture, StoredLecture } from "../model.ts";

export function loadSnapshot(db: AppDatabase) {
  return readLectures(db);
}

export function saveSnapshot(db: AppDatabase, lectures: StoredLecture[]) {
  replaceLectures(db, lectures);
}

export function toNormalized(lecture: StoredLecture): NormalizedLecture {
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
    recurring: lecture.recurring,
  };
}
