export const themeIds = ["dark", "light", "nord", "catppuccin", "dracula", "rose", "ocean", "matcha", "sunset"] as const;
export type ThemeId = (typeof themeIds)[number];

export const themes: { id: ThemeId; name: string; dark: boolean; blurb: string; swatch: [string, string, string] }[] = [
  { id: "dark", name: "Dark", dark: true, blurb: "Black and white", swatch: ["#111111", "#f4f4f5", "#3f3f46"] },
  { id: "light", name: "Light", dark: false, blurb: "Clean paper", swatch: ["#ffffff", "#171717", "#e4e4e7"] },
  { id: "nord", name: "Nord", dark: true, blurb: "Cool arctic", swatch: ["#2e3440", "#eceff4", "#88c0d0"] },
  { id: "catppuccin", name: "Catppuccin", dark: true, blurb: "Soft mocha", swatch: ["#1e1e2e", "#cdd6f4", "#cba6f7"] },
  { id: "dracula", name: "Dracula", dark: true, blurb: "Purple night", swatch: ["#282a36", "#f8f8f2", "#bd93f9"] },
  { id: "rose", name: "Rosé Pine", dark: true, blurb: "Dusty rose", swatch: ["#191724", "#e0def4", "#ebbcba"] },
  { id: "ocean", name: "Ocean", dark: true, blurb: "Deep blue", swatch: ["#0b1d36", "#e7f0ff", "#38bdf8"] },
  { id: "matcha", name: "Matcha", dark: true, blurb: "Green night", swatch: ["#121a14", "#e7f5ea", "#86efac"] },
  { id: "sunset", name: "Sunset", dark: true, blurb: "Warm pop", swatch: ["#1c1214", "#ffe8dc", "#fb7185"] },
];

const setupKey = "timetable-setup";
const cohortKey = "timetable-cohort";
const themeKey = "timetable-theme";
const colorsKey = "timetable-colors";

function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Choices still apply for this visit when storage is blocked.
  }
}

export function readSetup() {
  return storageGet(setupKey) === "1";
}

export function readStoredCohort() {
  return storageGet(cohortKey) ?? "";
}

export function readStoredTheme(): ThemeId {
  const stored = storageGet(themeKey);
  if (stored === "calendar") {
    storageSet(themeKey, "light");
    return "light";
  }
  if (themeIds.includes(stored as ThemeId)) return stored as ThemeId;
  if (storageGet("theme") === "light") return "light";
  return "dark";
}

export function readStoredColors() {
  return storageGet(colorsKey) !== "0";
}

export function themeMeta(id: ThemeId) {
  return themes.find((theme) => theme.id === id) ?? themes[0]!;
}

export function applyTheme(id: ThemeId) {
  const theme = themeMeta(id);
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.classList.toggle("dark", theme.dark);
  document.documentElement.style.colorScheme = theme.dark ? "dark" : "light";
  storageSet(themeKey, theme.id);
  storageSet("theme", theme.dark ? "dark" : "light");
}

export function applyColors(on: boolean) {
  document.documentElement.dataset.colors = on ? "on" : "off";
  storageSet(colorsKey, on ? "1" : "0");
}

export function saveCohort(division: string) {
  storageSet(cohortKey, division);
}

export function saveSetup(choices: { cohort: string; theme: ThemeId }) {
  saveCohort(choices.cohort);
  applyTheme(choices.theme);
  storageSet(setupKey, "1");
}
