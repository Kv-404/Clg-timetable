import type { ChangeEvent } from "@shared/types";
import { cohortName } from "@shared/cohort";
import { formatCalendarDate, formatDetected } from "@/lib/time";

const labels: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  cancelled: "Cancelled",
  restored: "Restored",
  reverted: "Reverted",
  rescheduled: "Rescheduled",
  room_change: "Room",
  faculty_change: "Faculty",
  subject_change: "Subject",
  details_changed: "Updated",
  replaced: "Replacement",
  tab_added: "New tab",
  tab_removed: "Tab removed",
};

export function RecentChanges({ changes, timeZone }: { changes: ChangeEvent[]; timeZone: string }) {
  return (
    <section aria-label="Recent timetable updates" data-testid="change-feed" className="space-y-3">
      <div>
        <h2 className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.22em] uppercase">Updates</h2>
        <p className="text-sm text-muted-foreground">
          Times below are when this page detected the change. They are not the moment the sheet was edited.
          History starts from the first sync of this server.
        </p>
      </div>
      {changes.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No changes yet. The current sheet is the baseline. Edits, cancellations, and new classes will show up here after the next sync.
        </p>
      ) : (
        <ol className="space-y-2">
          {changes.map((change) => (
            <li key={change.id} className="border-b border-border py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span>Detected {formatDetected(change.detectedAt, timeZone)}</span>
                {change.division && <span>· {cohortName(change.division)}</span>}
                <span className="rounded-full bg-muted px-2 py-0.5">{labels[change.type] ?? change.type}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{change.summary}</p>
              {(change.date || change.weekday) && (
                <p className="text-xs text-muted-foreground">
                  {change.weekday}
                  {change.date ? ` · ${formatCalendarDate(change.date)}` : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
