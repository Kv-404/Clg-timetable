import type { DisplayStatus } from "@shared/types";

export const toneIds = ["peacock", "basil", "blueberry", "grape", "flamingo", "tangerine", "banana", "sage", "lavender"] as const;
export type ToneId = (typeof toneIds)[number];

const colorKey = "timetable-subject-colors";

/** Same subject keeps one tone slot. A new name lands on the next free-looking slot by itself. */
export function autoTone(subject: string): ToneId {
  let hash = 0;
  for (let index = 0; index < subject.length; index += 1) {
    hash = (Math.imul(hash, 155) + subject.charCodeAt(index)) >>> 0;
  }
  return toneIds[hash % toneIds.length]!;
}

export function isToneId(value: string): value is ToneId {
  return (toneIds as readonly string[]).includes(value);
}

export function readColorMap(): Partial<Record<string, ToneId>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(colorKey) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: Partial<Record<string, ToneId>> = {};
    for (const [subject, tone] of Object.entries(parsed)) {
      if (typeof tone === "string" && isToneId(tone)) map[subject] = tone;
    }
    return map;
  } catch {
    return {};
  }
}

export function writeColorMap(map: Partial<Record<string, ToneId>>) {
  try {
    localStorage.setItem(colorKey, JSON.stringify(map));
  } catch {
    // Edits still apply for this visit when storage is blocked.
  }
}

export function toneFor(subject: string, status: DisplayStatus, assigned?: ToneId | null): ToneId | "graphite" {
  if (subject.trim().toUpperCase() === "OFF") return "graphite";
  if (assigned && isToneId(assigned)) return assigned;
  return autoTone(subject);
}

/** A class keeps its subject colour, including when it is cancelled. OFF stays neutral. */
export function calendarTone(subject: string, status: DisplayStatus, assigned?: ToneId | null) {
  return `cal-chip cal-${toneFor(subject, status, assigned)}`;
}
