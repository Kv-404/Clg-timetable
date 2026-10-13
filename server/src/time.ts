const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function canon(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function sameText(a: string | null | undefined, b: string | null | undefined) {
  return canon(a).toLowerCase() === canon(b).toLowerCase();
}

export function formatMinutes(minutes: number) {
  const h24 = ((Math.floor(minutes / 60) % 24) + 24) % 24;
  const minute = ((minutes % 60) + 60) % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function parseTimeToken(token: string): number | null {
  const match = canon(token).match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toUpperCase();
  if (hour > 23 || minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "PM" && hour < 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
}

export function parseTimeRange(label: string): { start: number; end: number } | null {
  const text = canon(label);
  const match = text.match(/^(.+?)\s*(?:-|–|—|\bto\b)\s*(.+)$/i);
  if (!match) return null;
  const start = parseTimeToken(match[1] ?? "");
  const end = parseTimeToken(match[2] ?? "");
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

export function parseDateLabel(input: string, order: "DMY" | "MDY" = "DMY") {
  const text = canon(input);
  const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  const day = order === "DMY" ? first : second;
  const month = order === "DMY" ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const named = text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  const computed = WEEKDAYS[date.getUTCDay()] ?? "Monday";
  const weekday = named ? named[1]!.charAt(0).toUpperCase() + named[1]!.slice(1).toLowerCase() : computed;
  return { iso, weekday, computedWeekday: computed };
}

export function weekdayFromName(name: string) {
  const text = canon(name).toLowerCase();
  const found = WEEKDAYS.find((day) => text === day.toLowerCase() || text.startsWith(`${day.toLowerCase()} `));
  return found ?? null;
}

export function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return {
    iso,
    minutes,
    weekday: parts.weekday ?? "Monday",
  };
}
