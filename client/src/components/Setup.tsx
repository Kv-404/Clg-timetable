import { cohortName } from "@shared/cohort";
import { Check } from "lucide-react";
import { useState } from "react";
import { ColorSwitch } from "@/components/ColorSwitch";
import { saveSetup, themes, type ThemeId } from "@/lib/prefs";

export function Setup({
  divisions,
  cohort,
  theme,
  colors,
  bold,
  onTheme,
  onColors,
  onBold,
  onDone,
}: {
  divisions: string[];
  cohort: string;
  theme: ThemeId;
  colors: boolean;
  bold: boolean;
  onTheme: (theme: ThemeId) => void;
  onColors: (on: boolean) => void;
  onBold: (on: boolean) => void;
  onDone: (division: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(divisions.includes(cohort) ? cohort : "");
  const titles = ["Which cohort are you in?", "Pick a theme"];
  const notes = ["This stays on this browser.", "Week is the grid. One day is a compact list. You can change the theme and class colours later."];

  function finish() {
    if (!picked) return;
    saveSetup({ cohort: picked, theme });
    onDone(picked);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium tracking-tight">Timetable</p>
      <div key={step} className="rise">
        <p className="text-muted-foreground mt-8 font-mono text-[11px] tracking-[0.22em] uppercase">
          {step + 1} of {titles.length}
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">{titles[step]}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{notes[step]}</p>
        {step === 0 && (
          <ul className="mt-8 grid gap-2">
            {divisions.map((division) => {
              const selected = picked === division;
              return (
                <li key={division}>
                  <button
                    type="button"
                    onClick={() => setPicked(division)}
                    className={choiceClass(selected, "items-center px-4 py-3 text-lg")}
                    aria-pressed={selected}
                  >
                    {cohortName(division)}
                    <ChoiceMark selected={selected} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {step === 1 && (
          <>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {themes.map((item) => {
                const selected = theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onTheme(item.id)}
                    className={choiceClass(selected, "flex-col items-stretch px-3 py-3")}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="flex gap-1" aria-hidden="true">
                        {item.swatch.map((color) => (
                          <span key={color} className="size-3 rounded-full border border-black/10" style={{ background: color }} />
                        ))}
                      </span>
                      <ChoiceMark selected={selected} />
                    </span>
                    <span className="mt-2 block text-sm font-medium">{item.name}</span>
                    <span className={`block text-xs ${selected ? "opacity-70" : "text-muted-foreground"}`}>{item.blurb}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-2">
              <ColorSwitch on={colors} onChange={onColors} />
              {colors && <ColorSwitch on={bold} onChange={onBold} title="Bold colours" onHint="Solid class colours" offHint="Soft tint" testId="bold-toggle" />}
            </div>
          </>
        )}
      </div>
      <div className="mt-8 flex items-center justify-between">
        <button type="button" className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>
          Back
        </button>
        {step < 1 ? (
          <button
            type="button"
            className="rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-40"
            disabled={!picked}
            onClick={() => setStep(1)}
          >
            Next
          </button>
        ) : (
          <button type="button" className="rounded-md bg-foreground px-4 py-2 text-sm text-background" onClick={finish}>
            Save
          </button>
        )}
      </div>
    </main>
  );
}

function choiceClass(selected: boolean, extra: string) {
  return `flex w-full justify-between gap-3 rounded-lg border text-left tracking-tight ${extra} ${
    selected ? "border-transparent bg-foreground text-background" : "border-border hover:bg-muted"
  }`;
}

function ChoiceMark({ selected }: { selected: boolean }) {
  if (!selected) return <span className="size-5 shrink-0 rounded-full border border-current opacity-35" aria-hidden="true" />;
  return <Check className="size-5 shrink-0" aria-hidden="true" />;
}
