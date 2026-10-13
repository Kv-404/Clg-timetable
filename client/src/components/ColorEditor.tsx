import { useState } from "react";
import { toneIds, type ToneId } from "@/lib/calendarTone";
import { useColors } from "@/lib/colorState";
import { paletteChoices, paletteMarks } from "@/lib/palettes";
import type { ThemeId } from "@/lib/prefs";

const toneNames: Record<ToneId, string> = {
  peacock: "Blue",
  basil: "Green",
  blueberry: "Indigo",
  grape: "Violet",
  flamingo: "Red",
  tangerine: "Orange",
  banana: "Gold",
  sage: "Teal",
  lavender: "Rose",
};

export function ColorEditor({ theme, subjects }: { theme: ThemeId; subjects: string[] }) {
  const colors = useColors();
  const [open, setOpen] = useState<string | null>(null);
  const classes = subjects
    .map((subject) => subject.trim())
    .filter((subject) => subject && subject.toUpperCase() !== "OFF")
    .sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <p className="text-muted-foreground font-mono text-[11px] tracking-[0.22em] uppercase">Presets</p>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {paletteChoices.map((choice) => {
          const marks = paletteMarks(choice.id, theme);
          const selected = colors.palette === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={selected}
              data-testid={`palette-${choice.id}`}
              onClick={() => colors.choosePalette(choice.id)}
              className={`rounded-md px-1 py-1.5 ${selected ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              <span className="mb-1 flex justify-center gap-0.5" aria-hidden="true">
                {marks.map((fill) => (
                  <span key={fill} className="size-2 rounded-full" style={{ background: fill }} />
                ))}
              </span>
              <span className="block text-[11px]">{choice.name}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-muted-foreground font-mono text-[11px] tracking-[0.22em] uppercase">Classes</p>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={colors.resetSubjects}>
          Reset
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">New classes pick a colour on their own. You can change any of them.</p>
      <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
        {classes.map((subject) => {
          const slot = colors.slotFor(subject, "scheduled");
          const custom = Boolean(colors.map[subject]);
          const expanded = open === subject;
          return (
            <li key={subject}>
              <button
                type="button"
                aria-expanded={expanded}
                data-testid="color-subject"
                onClick={() => setOpen(expanded ? null : subject)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted"
              >
                <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: `var(--tone-${slot})` }} />
                <span className="min-w-0 flex-1 truncate text-sm">{subject}</span>
                {!custom && <span className="text-muted-foreground text-[10px]">Auto</span>}
              </button>
              {expanded && (
                <div className="flex flex-wrap items-center gap-1 px-1 pt-1 pb-2">
                  {toneIds.map((tone, index) => {
                    const selected = colors.map[subject] === tone;
                    const name = colors.palette === "theme" ? toneNames[tone] : `Colour ${index + 1}`;
                    return (
                      <button
                        key={tone}
                        type="button"
                        aria-label={`Set ${subject} to ${name}`}
                        title={name}
                        aria-pressed={selected}
                        data-testid={`swatch-${tone}`}
                        onClick={() => colors.chooseSubject(subject, tone)}
                        className={`size-6 rounded-sm ${selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
                        style={{ background: `var(--tone-${tone})` }}
                      />
                    );
                  })}
                  <button
                    type="button"
                    aria-pressed={!custom}
                    className="ml-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => colors.chooseSubject(subject, null)}
                  >
                    Auto
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
