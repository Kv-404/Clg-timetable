export function ColorSwitch({
  on,
  onChange,
  title = "Class colours",
  onHint = "Each class has its own colour",
  offHint = "Plain timetable",
  testId = "colors-toggle",
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  title?: string;
  onHint?: string;
  offHint?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={testId}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left"
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{on ? onHint : offHint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full ${on ? "bg-foreground" : "bg-muted"}`} aria-hidden="true">
        <span className={`absolute top-0.5 size-5 rounded-full border border-border bg-background ${on ? "right-0.5" : "left-0.5"}`} />
      </span>
    </button>
  );
}
