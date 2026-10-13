import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import type { DisplayStatus } from "@shared/types";
import { calendarTone, readColorMap, toneFor, writeColorMap, type ToneId } from "@/lib/calendarTone";
import { applyPalette, readPalette, type PaletteId } from "@/lib/palettes";
import type { ThemeId } from "@/lib/prefs";

type ColorState = {
  palette: PaletteId;
  map: Partial<Record<string, ToneId>>;
  classNameFor: (subject: string, status: DisplayStatus) => string;
  slotFor: (subject: string, status: DisplayStatus) => ToneId | "graphite";
  choosePalette: (id: PaletteId) => void;
  chooseSubject: (subject: string, tone: ToneId | null) => void;
  resetSubjects: () => void;
};

const ColorContext = createContext<ColorState | null>(null);

export function ColorProvider({ theme, children }: { theme: ThemeId; children: ReactNode }) {
  const [palette, setPalette] = useState<PaletteId>(readPalette);
  const [map, setMap] = useState<Partial<Record<string, ToneId>>>(readColorMap);

  useLayoutEffect(() => {
    applyPalette(palette, theme);
  }, [palette, theme]);

  const value = useMemo<ColorState>(
    () => ({
      palette,
      map,
      classNameFor: (subject, status) => calendarTone(subject, status, map[subject]),
      slotFor: (subject, status) => toneFor(subject, status, map[subject]),
      choosePalette: setPalette,
      chooseSubject: (subject, tone) => {
        setMap((current) => {
          const next = { ...current };
          if (!tone) delete next[subject];
          else next[subject] = tone;
          writeColorMap(next);
          return next;
        });
      },
      resetSubjects: () => {
        writeColorMap({});
        setMap({});
      },
    }),
    [palette, map],
  );

  return <ColorContext.Provider value={value}>{children}</ColorContext.Provider>;
}

export function useColors() {
  const value = useContext(ColorContext);
  if (!value) throw new Error("Class colours are only available inside the timetable.");
  return value;
}
