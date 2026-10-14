import { cohortName } from "@shared/cohort";
import type { ChangeEvent } from "@shared/types";

/** Class disappeared, came back, or moved. Quiet bookkeeping stays out of the alert. */
const alertTypes = new Set([
  "cancelled",
  "restored",
  "rescheduled",
  "room_change",
  "faculty_change",
  "subject_change",
  "details_changed",
  "replaced",
  "added",
  "removed",
  "reverted",
  "tab_added",
  "tab_removed",
]);

/**
 * Changes are newest first. The first call with an empty store records the
 * current list and alerts nothing, so opening the page does not replay history.
 * The set is updated in place.
 */
export function takeAlerts(changes: ChangeEvent[], seen: { exists: boolean; ids: Set<number> }) {
  if (!seen.exists) {
    for (const change of changes) seen.ids.add(change.id);
    return { alerts: [] as ChangeEvent[], dirty: true };
  }
  const alerts: ChangeEvent[] = [];
  let dirty = false;
  for (const change of changes) {
    if (seen.ids.has(change.id)) continue;
    seen.ids.add(change.id);
    dirty = true;
    if (alertTypes.has(change.type)) alerts.push(change);
  }
  return { alerts, dirty };
}

export function alertCopy(alerts: ChangeEvent[]) {
  const newest = alerts[0];
  if (!newest) return null;
  const title = newest.division ? cohortName(newest.division) : "Timetable";
  const body = alerts.length === 1 ? newest.summary : `${alerts.length} updates. ${newest.summary}`;
  return { title, body, tag: `timetable-${newest.id}` };
}
