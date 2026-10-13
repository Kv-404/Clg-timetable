const bars = [
  ["28%", "72%"],
  ["34%", "88%"],
  ["22%", "54%"],
  ["30%", "76%"],
] as const;

export function LoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center px-6" role="status" aria-live="polite" aria-busy="true" data-testid="loading-screen">
      <div className="w-full max-w-md">
        <p className="text-muted-foreground font-mono text-[11px] tracking-[0.22em] uppercase">Timetable</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Reading the sheet</h1>
        <p className="mt-2 text-sm text-muted-foreground">The timetable will show as soon as it loads.</p>
        <div className="mt-10 grid gap-3" aria-hidden="true">
          {bars.map(([time, chip], index) => (
            <div key={time} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
              <span className="load-bar h-2.5 rounded-sm" style={{ width: time, animationDelay: `${index * 120}ms` }} />
              <span className="load-bar h-9 rounded-md" style={{ width: chip, animationDelay: `${index * 120 + 80}ms` }} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
