import type { ExplicitMark, LectureKind, PreviousValues } from "../../shared/types.ts";

export interface RawSlot {
  tabName: string;
  course: string | null;
  semester: string | null;
  batch: string | null;
  division: string;
  date: string | null;
  weekday: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  subject: string;
  faculty: string;
  room: string;
  statusText: string;
  reasonText: string;
  row: number;
}

export interface NormalizedLecture {
  id: string;
  slotKey: string;
  tabName: string;
  course: string;
  semester: string;
  batch: string;
  division: string;
  date: string | null;
  weekday: string;
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
  subject: string;
  faculty: string;
  room: string;
  kind: LectureKind;
  sourceStatus: "scheduled" | "cancelled";
  reason: string | null;
  explicitMark: ExplicitMark;
  recurring: boolean;
}

export interface LectureCore {
  subject: string;
  faculty: string;
  room: string;
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
  sourceStatus: "scheduled" | "cancelled";
  reason: string;
  kind: LectureKind;
  explicitMark: ExplicitMark;
}

export interface Highlight {
  displayStatus: "changed" | "rescheduled" | "cancelled";
  type: string;
  summary: string;
  detectedAt: string;
  previous: PreviousValues;
  reason: string | null;
}

export interface StoredLecture extends NormalizedLecture {
  anchor: LectureCore;
  highlight: Highlight | null;
}

export interface ChangeDraft {
  dedupeKey: string;
  detectedAt: string;
  type: string;
  lectureId: string | null;
  division: string | null;
  course: string | null;
  semester: string | null;
  tabName: string | null;
  date: string | null;
  weekday: string | null;
  summary: string;
  previous: PreviousValues | null;
  next: PreviousValues | null;
  fields: string[];
}
