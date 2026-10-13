import type { PublicLecture } from "@shared/types";

export interface Filters {
  course: string;
  semester: string;
  division: string;
  day: string;
  subject: string;
  faculty: string;
  room: string;
  status: "all" | "scheduled" | "changed" | "cancelled";
  query: string;
}

export function defaultFilters(lectures: PublicLecture[], today: string): Filters {
  const courses = unique(lectures.map((lecture) => lecture.course));
  const course = courses[0] ?? "";
  const semesters = unique(lectures.filter((lecture) => lecture.course === course).map((lecture) => lecture.semester));
  const semester = semesters[0] ?? "";
  const divisions = unique(
    lectures.filter((lecture) => lecture.course === course && lecture.semester === semester).map((lecture) => lecture.division),
  );
  const withToday = divisions.find((division) =>
    lectures.some((lecture) => lecture.division === division && lecture.date === today && lecture.kind === "lecture"),
  );
  return {
    course,
    semester,
    division: withToday ?? divisions[0] ?? "",
    day: "",
    subject: "",
    faculty: "",
    room: "",
    status: "all",
    query: "",
  };
}

export function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function applyFilters(lectures: PublicLecture[], filters: Filters, options?: { ignoreDay?: boolean; ignoreStatus?: boolean; ignoreQuery?: boolean }) {
  const query = filters.query.trim().toLowerCase();
  return lectures.filter((lecture) => {
    if (filters.course && lecture.course !== filters.course) return false;
    if (filters.semester && lecture.semester !== filters.semester) return false;
    if (filters.division && lecture.division !== filters.division) return false;
    if (!options?.ignoreDay && filters.day && lecture.weekday !== filters.day) return false;
    if (filters.subject && lecture.subject !== filters.subject) return false;
    if (filters.faculty && lecture.faculty !== filters.faculty) return false;
    if (filters.room && lecture.room !== filters.room) return false;
    if (!options?.ignoreStatus && filters.status !== "all") {
      if (lecture.kind === "break") return false;
      if (filters.status === "scheduled" && (lecture.displayStatus !== "scheduled" || lecture.kind !== "lecture")) return false;
      if (filters.status === "cancelled" && lecture.displayStatus !== "cancelled") return false;
      if (filters.status === "changed" && lecture.displayStatus !== "changed" && lecture.displayStatus !== "rescheduled") return false;
    }
    if (!options?.ignoreQuery && query) {
      const haystack = [lecture.subject, lecture.faculty, lecture.room, lecture.division, lecture.reason ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function countStatuses(lectures: PublicLecture[]) {
  const classes = lectures.filter((lecture) => lecture.kind !== "break");
  return {
    scheduled: classes.filter((lecture) => lecture.displayStatus === "scheduled" && lecture.kind === "lecture").length,
    cancelled: classes.filter((lecture) => lecture.displayStatus === "cancelled").length,
    changed: classes.filter((lecture) => lecture.displayStatus === "changed" || lecture.displayStatus === "rescheduled").length,
  };
}

export function isFullOff(lectures: PublicLecture[]) {
  const slots = lectures.filter((lecture) => lecture.kind !== "break");
  return slots.length > 0 && slots.every((lecture) => lecture.subject === "OFF" && lecture.displayStatus === "cancelled");
}

export function collapseFullOffDays(lectures: PublicLecture[]) {
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
    if (!isFullOff(group)) {
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

export type SlotPhase = "past" | "now" | "upcoming" | "later" | "earlier";

export function slotPhase(lecture: PublicLecture, today: string, minutes: number): SlotPhase {
  if (!lecture.date) return "upcoming";
  if (lecture.date > today) return "later";
  if (lecture.date < today) return "earlier";
  if (lecture.startMinutes < 0) return "upcoming";
  if (minutes >= lecture.startMinutes && minutes < lecture.endMinutes) return "now";
  if (minutes >= lecture.endMinutes) return "past";
  return "upcoming";
}
