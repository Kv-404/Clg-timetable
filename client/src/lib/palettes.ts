import { themeMeta, type ThemeId } from "@/lib/prefs";
import { toneIds, type ToneId } from "@/lib/calendarTone";

export const paletteIds = ["theme", "red", "blue", "green", "warm"] as const;
export type PaletteId = (typeof paletteIds)[number];

type Pair = { fill: string; ink: string };
type Row = Record<ToneId, Pair>;

const toneOrder = toneIds;

/** Preset paints for dark themes and for Light. The Theme preset keeps each theme's own colours. */
const presets: Record<Exclude<PaletteId, "theme">, { dark: Row; light: Row }> = {
  red: {
    dark: row([
      ["#94302c", "#f6f3f1"],
      ["#8b3921", "#f6f3f1"],
      ["#952d3e", "#f6f3f1"],
      ["#8a335c", "#f6f3f1"],
      ["#7e4326", "#f6f3f1"],
      ["#6a4d2f", "#f6f3f1"],
      ["#63562c", "#f6f3f1"],
      ["#932271", "#f6f3f1"],
      ["#8d372a", "#f6f3f1"],
    ]),
    light: row([
      ["#e0a5a3", "#361312"],
      ["#e4aa98", "#361a12"],
      ["#e0a3ad", "#361218"],
      ["#e6a0c0", "#361223"],
      ["#d9b3a1", "#361e12"],
      ["#d9bda1", "#362412"],
      ["#d9cca1", "#362d12"],
      ["#e0a2cd", "#36122b"],
      ["#dfa9a0", "#361712"],
    ]),
  },
  blue: {
    dark: row([
      ["#26567f", "#f6f3f1"],
      ["#304ea0", "#f6f3f1"],
      ["#2c5963", "#f6f3f1"],
      ["#5530cf", "#f6f3f1"],
      ["#2c635b", "#f6f3f1"],
      ["#325386", "#f6f3f1"],
      ["#3d4aa4", "#f6f3f1"],
      ["#624292", "#f6f3f1"],
      ["#225873", "#f6f3f1"],
    ]),
    light: row([
      ["#96bfe3", "#122536"],
      ["#9eb1e5", "#121b36"],
      ["#a1cfd9", "#123036"],
      ["#b3a7db", "#1a1236"],
      ["#a1d9d1", "#123631"],
      ["#a1b7d9", "#122036"],
      ["#a3ace7", "#121736"],
      ["#c0a2ed", "#201236"],
      ["#a1c6d9", "#122a36"],
    ]),
  },
  green: {
    dark: row([
      ["#2c6344", "#f6f3f1"],
      ["#2c6350", "#f6f3f1"],
      ["#35632c", "#f6f3f1"],
      ["#49632c", "#f6f3f1"],
      ["#2c6359", "#f6f3f1"],
      ["#2c6332", "#f6f3f1"],
      ["#2c6349", "#f6f3f1"],
      ["#40632c", "#f6f3f1"],
      ["#2c6339", "#f6f3f1"],
    ]),
    light: row([
      ["#a1d9b9", "#123621"],
      ["#a1d9c6", "#12362a"],
      ["#aad9a1", "#183612"],
      ["#c2dba1", "#212f0e"],
      ["#a1d9cf", "#123630"],
      ["#a1d9a6", "#123615"],
      ["#a1d9bf", "#123625"],
      ["#b5d9a1", "#1f3612"],
      ["#a1d9ae", "#12361a"],
    ]),
  },
  warm: {
    dark: row([
      ["#76472c", "#f6f3f1"],
      ["#654f2e", "#f6f3f1"],
      ["#7c4338", "#f6f3f1"],
      ["#63592c", "#f6f3f1"],
      ["#94302c", "#f6f3f1"],
      ["#6a4d2f", "#f6f3f1"],
      ["#63612c", "#f6f3f1"],
      ["#912b5e", "#f6f3f1"],
      ["#7d432e", "#f6f3f1"],
    ]),
    light: row([
      ["#d9b5a1", "#361f12"],
      ["#d9c2a1", "#362712"],
      ["#eba596", "#361812"],
      ["#d9cfa1", "#363012"],
      ["#e0a5a3", "#361312"],
      ["#d9bda1", "#362412"],
      ["#ded3a8", "#2f290e"],
      ["#daa5c0", "#361224"],
      ["#eaa991", "#361b12"],
    ]),
  },
};

function row(pairs: readonly (readonly [string, string])[]): Row {
  return Object.fromEntries(toneOrder.map((tone, index) => [tone, { fill: pairs[index]![0], ink: pairs[index]![1] }])) as Row;
}

/** Three dots for the Theme preset button. These match the theme palette, including the dark red. */
const themeMarks: Record<ThemeId, [string, string, string]> = {
  dark: ["#5ec8ff", "#fda4af", "#4ade80"],
  light: ["#38bdf8", "#fb7185", "#34d399"],
  nord: ["#88c0d0", "#e7a0a4", "#a3be8c"],
  catppuccin: ["#89b4fa", "#f38ba8", "#a6e3a1"],
  dracula: ["#8be9fd", "#ff79c6", "#50fa7b"],
  rose: ["#9ccfd8", "#f0a0b4", "#a8d4c4"],
  ocean: ["#7dd3fc", "#a5b4fc", "#86efac"],
  matcha: ["#5eead4", "#d9f99d", "#86efac"],
  sunset: ["#fda4af", "#fb7185", "#fb923c"],
};

export const paletteChoices: { id: PaletteId; name: string }[] = [
  { id: "theme", name: "Theme" },
  { id: "red", name: "Red" },
  { id: "blue", name: "Blue" },
  { id: "green", name: "Green" },
  { id: "warm", name: "Warm" },
];

export function paletteMarks(id: PaletteId, theme: ThemeId): [string, string, string] {
  if (id === "theme") return themeMarks[theme];
  const mode = themeMeta(theme).dark ? presets[id].dark : presets[id].light;
  return [mode.peacock.fill, mode.flamingo.fill, mode.basil.fill];
}

export function readPalette(): PaletteId {
  try {
    const stored = localStorage.getItem("timetable-palette");
    if (paletteIds.includes(stored as PaletteId)) return stored as PaletteId;
  } catch {
    // The theme palette still applies for this visit.
  }
  return "theme";
}

export function applyPalette(id: PaletteId, theme: ThemeId) {
  const root = document.documentElement;
  if (id === "theme") {
    for (const tone of toneOrder) {
      root.style.removeProperty(`--tone-${tone}`);
      root.style.removeProperty(`--ink-${tone}`);
    }
    delete root.dataset.palette;
  } else {
    const mode = themeMeta(theme).dark ? presets[id].dark : presets[id].light;
    for (const tone of toneOrder) {
      root.style.setProperty(`--tone-${tone}`, mode[tone].fill);
      root.style.setProperty(`--ink-${tone}`, mode[tone].ink);
    }
    root.dataset.palette = id;
  }
  try {
    localStorage.setItem("timetable-palette", id);
  } catch {
    // The choice still applies for this visit.
  }
}
