import type { ChangeEvent } from "@shared/types";
import { useEffect, useState } from "react";

const storageKey = "timetable-notified-ids";

function readSeen() {
  try {
    const raw = localStorage.getItem(storageKey);
    return { exists: raw !== null, ids: new Set<number>(raw ? (JSON.parse(raw) as number[]) : []) };
  } catch {
    return { exists: false, ids: new Set<number>() };
  }
}

function writeSeen(ids: Set<number>) {
  localStorage.setItem(storageKey, JSON.stringify([...ids]));
}

const important = new Set([
  "cancelled",
  "restored",
  "rescheduled",
  "room_change",
  "faculty_change",
  "subject_change",
  "details_changed",
  "replaced",
  "added",
  "tab_added",
]);

export function useChangeNotifications(changes: ChangeEvent[]) {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof Notification === "undefined") return "denied";
    return Notification.permission;
  });

  useEffect(() => {
    if (permission !== "granted" || typeof Notification === "undefined") return;
    const seen = readSeen();
    if (!seen.exists) {
      for (const change of changes) seen.ids.add(change.id);
      writeSeen(seen.ids);
      return;
    }
    let dirty = false;
    for (const change of [...changes].reverse()) {
      if (seen.ids.has(change.id)) continue;
      seen.ids.add(change.id);
      dirty = true;
      if (!important.has(change.type)) continue;
      const title = change.division ? `${change.division}` : "Timetable update";
      new Notification(title, { body: change.summary, tag: `timetable-${change.id}` });
    }
    if (dirty) writeSeen(seen.ids);
  }, [changes, permission]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    const next = await Notification.requestPermission();
    setPermission(next);
    if (next === "granted") {
      const seen = readSeen();
      for (const change of changes) seen.ids.add(change.id);
      writeSeen(seen.ids);
    }
  }

  return {
    supported: typeof Notification !== "undefined",
    permission,
    enable,
  };
}
