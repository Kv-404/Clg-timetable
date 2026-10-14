import type { ChangeEvent } from "../../../shared/types.ts";
import type { StoredLecture } from "../model.ts";
import { formatMinutes } from "../time.ts";

function slotMinutes(id: string) {
  const match = /\|(\d+)-(\d+)$/.exec(id);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

/** Lectures already recorded as removed, on a day that is still published, come back as cancelled. */
export function restoreRemovedLectures(lectures: StoredLecture[], changes: ChangeEvent[]) {
  const ids = new Set(lectures.map((lecture) => lecture.id));
  const days = new Set(
    lectures.filter((lecture) => lecture.kind !== "break" && lecture.date).map((lecture) => `${lecture.tabName}|${lecture.date}`),
  );
  const restoredIds = new Set<string>();
  const restored: StoredLecture[] = [];
  const rewritten: { id: number; summary: string }[] = [];
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
        explicitMark: null,
      },
      highlight: {
        displayStatus: "cancelled",
        type: "cancelled",
        summary: `${subject} lecture cancelled.`,
        detectedAt: change.detectedAt,
        previous,
        reason: null,
      },
    });
    ids.add(change.lectureId);
    restoredIds.add(change.lectureId);
    rewritten.push({ id: change.id, summary: `${subject} lecture cancelled.` });
  }
  return { lectures: [...lectures, ...restored], restoredIds, rewritten };
}
