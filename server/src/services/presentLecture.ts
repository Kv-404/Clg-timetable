import type { PublicLecture } from "../../../shared/types.ts";
import type { StoredLecture } from "../model.ts";

function highlightVisible(lecture: StoredLecture, now: Date, highlightHours: number) {
  const highlight = lecture.highlight;
  if (!highlight) return false;
  if (highlight.displayStatus === "cancelled") return true;
  const detected = Date.parse(highlight.detectedAt);
  if (!Number.isFinite(detected)) return false;
  return now.getTime() - detected <= highlightHours * 60 * 60 * 1000;
}

export function presentLecture(lecture: StoredLecture, now: Date, highlightHours: number): PublicLecture {
  const visible = highlightVisible(lecture, now, highlightHours);
  const highlight = visible ? lecture.highlight : null;
  let displayStatus: PublicLecture["displayStatus"] = "scheduled";
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
    recurring: lecture.recurring,
  };
}
