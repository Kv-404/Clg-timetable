import { createHash } from "node:crypto";
import type { ExplicitMark, ParseIssue } from "../../../shared/types.ts";
import type { NormalizedLecture, RawSlot } from "../model.ts";
import type { ParsedWorkbook } from "./timetableParser.ts";
import { canon, formatMinutes, sameText, weekdayFromName } from "../time.ts";

export interface NormalizeOptions {
  courseFallback: string;
}

function normalizeMark(word: string): "cancelled" | "off" | "rescheduled" | "changed" {
  const value = word.toLowerCase();
  if (value === "canceled" || value === "cancelled" || value === "holiday") return "cancelled";
  if (value === "off") return "off";
  if (value === "rescheduled") return "rescheduled";
  return "changed";
}

function parseStatusToken(status: string) {
  const text = canon(status).toLowerCase();
  if (!text || text === "scheduled" || text === "confirmed") return null;
  if (/^(cancelled|canceled|holiday)$/.test(text)) return "cancelled" as const;
  if (text === "off") return "off" as const;
  if (text === "rescheduled") return "rescheduled" as const;
  if (text === "changed") return "changed" as const;
  return null;
}

function parseMarkedSubject(subject: string) {
  const paren = subject.match(/^(.*?)\s*[([]\s*(cancelled|canceled|rescheduled|changed|off|holiday)\b\s*[:\-–]?\s*([^)\]]*)[)\]]\s*$/i);
  if (paren) {
    return {
      subject: canon(paren[1]) || subject,
      mark: normalizeMark(paren[2] ?? ""),
      reason: canon(paren[3]) || null,
    };
  }
  const trail = subject.match(/^(.*?)\s*[|–]\s*(cancelled|canceled|rescheduled|changed|off|holiday)\b\s*[:\-–]?\s*(.*)$/i);
  if (trail && canon(trail[1])) {
    return {
      subject: canon(trail[1]),
      mark: normalizeMark(trail[2] ?? ""),
      reason: canon(trail[3]) || null,
    };
  }
  if (/^(cancelled|canceled|off|holiday|rescheduled|changed)$/i.test(subject)) {
    return { subject, mark: normalizeMark(subject), reason: null };
  }
  return { subject, mark: null as null, reason: null as string | null };
}

function slotKeyFor(slot: {
  tabName: string;
  date: string | null;
  division: string;
  startMinutes: number;
  endMinutes: number;
  row: number;
}) {
  const when = slot.startMinutes >= 0 ? `${slot.startMinutes}-${slot.endMinutes}` : `row-${slot.row}`;
  return [slot.tabName, slot.date ?? "weekly", slot.division, when].join("|");
}

export function normalizeWorkbook(parsed: ParsedWorkbook, options: NormalizeOptions) {
  const lectures: NormalizedLecture[] = [];
  const issues: ParseIssue[] = [...parsed.issues];
  for (const tab of parsed.tabs) {
    for (const slot of tab.slots) {
      const lecture = normalizeSlot(slot, options.courseFallback);
      if (lecture) lectures.push(lecture);
    }
  }
  return { lectures, issues, collegeName: parsed.collegeName, semester: parsed.semester, batch: parsed.batch };
}

export function normalizeSlot(slot: RawSlot, courseFallback: string): NormalizedLecture | null {
  const marked = parseMarkedSubject(canon(slot.subject));
  const statusMark = parseStatusToken(slot.statusText);
  const mark = statusMark ?? marked.mark;
  const reason = canon(slot.reasonText) || marked.reason;
  let subject = marked.subject;
  let kind: NormalizedLecture["kind"] = "lecture";
  let sourceStatus: NormalizedLecture["sourceStatus"] = "scheduled";
  let explicitMark: ExplicitMark = null;
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
    row: slot.row,
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
    recurring: !slot.date,
  };
}

export function contentFingerprint(lectures: NormalizedLecture[], tabs: string[], issues: ParseIssue[]) {
  const lines = lectures
    .map((lecture) =>
      [
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
        lecture.weekday,
      ].join("\u001f"),
    )
    .sort();
  const issueLines = issues
    .map((item) => `${item.severity}|${item.tabName}|${item.row ?? ""}|${item.message}`)
    .sort();
  return createHash("sha256")
    .update(JSON.stringify({ tabs: [...tabs].sort(), lines, issueLines }))
    .digest("hex");
}

export function sameLectureText(a: string, b: string) {
  return sameText(a, b);
}
