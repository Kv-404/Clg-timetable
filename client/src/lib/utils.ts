import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  const words = name.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "CL";
}

const cohortPalette = ["#1d4e89", "#0f6e56", "#7a4e2d", "#3f3d8f", "#7c3a4a", "#3f6212"];

export function cohortColor(name: string, names: string[]) {
  const index = Math.max(0, names.indexOf(name));
  return cohortPalette[index % cohortPalette.length] ?? cohortPalette[0];
}
