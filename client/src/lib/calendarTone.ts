import type { DisplayStatus } from "@shared/types";

const tones = ["peacock", "basil", "blueberry", "grape", "flamingo", "tangerine", "banana", "sage", "lavender"] as const;

/** Same subject keeps one tone slot. The active theme paints that slot. Cancelled stays graphite. */
export function calendarTone(subject: string, status: DisplayStatus) {
  if (status === "cancelled") return "cal-chip cal-graphite";
  let hash = 0;
  for (let index = 0; index < subject.length; index += 1) {
    // 155 separates the subjects on this sheet onto different colors. A new name stays on one color.
    hash = (Math.imul(hash, 155) + subject.charCodeAt(index)) >>> 0;
  }
  return `cal-chip cal-${tones[hash % tones.length]}`;
}
