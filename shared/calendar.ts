import { cohortName } from "./cohort.ts";
import type { PublicLecture } from "./types.ts";

export function googleCalendarUrl(lecture: PublicLecture, timeZone: string) {
  if (!lecture.date || lecture.kind === "break") return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(lecture),
    dates: `${googleStamp(lecture.date, lecture.startMinutes, timeZone)}/${googleStamp(lecture.date, lecture.endMinutes, timeZone)}`,
    ctz: timeZone,
    details: eventDetails(lecture),
  });
  if (lecture.room) params.set("location", lecture.room);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function calendarFile(lectures: PublicLecture[], timeZone: string, calendarName = "Timetable") {
  const events = collapseFullOffDays(lectures).filter((lecture) => lecture.date && lecture.kind !== "break");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendarName)}`,
    `X-WR-TIMEZONE:${icsText(timeZone)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const stamp = formatUtc(new Date());
  for (const lecture of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(lecture.id)}@timetable`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${googleStamp(lecture.date!, lecture.startMinutes, timeZone)}`,
      `DTEND:${googleStamp(lecture.date!, lecture.endMinutes, timeZone)}`,
      `SUMMARY:${icsText(eventTitle(lecture))}`,
      `DESCRIPTION:${icsText(eventDetails(lecture))}`,
      `STATUS:${lecture.displayStatus === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    );
    if (lecture.room) lines.push(`LOCATION:${icsText(lecture.room)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function eventTitle(lecture: PublicLecture) {
  const name = cohortName(lecture.division);
  if (lecture.subject === "OFF" || lecture.kind === "off") return `OFF — ${name}`;
  if (lecture.displayStatus === "cancelled") return `Cancelled: ${lecture.subject}`;
  return lecture.subject;
}

function eventDetails(lecture: PublicLecture) {
  return [cohortName(lecture.division), lecture.faculty ? `Faculty: ${lecture.faculty}` : "", lecture.reason ? `Reason: ${lecture.reason}` : "", lecture.changeSummary ?? ""]
    .filter(Boolean)
    .join("\n");
}

function collapseFullOffDays(lectures: PublicLecture[]) {
  const collapsed: PublicLecture[] = lectures.filter((lecture) => lecture.kind === "break");
  const groups = new Map<string, PublicLecture[]>();
  for (const lecture of lectures) {
    if (lecture.kind === "break") continue;
    const key = `${lecture.date ?? lecture.weekday}|${lecture.division}`;
    const list = groups.get(key) ?? [];
    list.push(lecture);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    const slots = group.filter((lecture) => lecture.kind !== "break");
    const fullOff = slots.length > 0 && slots.every((lecture) => lecture.subject === "OFF" && lecture.displayStatus === "cancelled");
    if (!fullOff) {
      collapsed.push(...group);
      continue;
    }
    const ordered = [...group].sort((a, b) => a.startMinutes - b.startMinutes);
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    collapsed.push({
      ...first,
      id: `${first.division}-${first.date ?? first.weekday}-off`,
      endMinutes: last.endMinutes,
      endLabel: last.endLabel,
      reason: "The official timetable marks this whole day OFF.",
    });
  }
  return collapsed;
}

export function googleStamp(dateIso: string, minutes: number, timeZone: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute);
  const utc = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  const refined = guess - offsetMinutes(new Date(utc), timeZone) * 60_000;
  return formatUtc(new Date(refined));
}

function offsetMinutes(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

function formatUtc(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
