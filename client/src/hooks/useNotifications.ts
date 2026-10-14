import type { ChangeEvent } from "@shared/types";
import { useEffect, useState } from "react";
import { alertCopy, takeAlerts } from "@/lib/notifyChanges";

const seenKey = "timetable-notified-ids";
const optInKey = "timetable-notify";

function readSeen() {
  try {
    const raw = localStorage.getItem(seenKey);
    return { exists: raw !== null, ids: new Set<number>(raw ? (JSON.parse(raw) as number[]) : []) };
  } catch {
    return { exists: false, ids: new Set<number>() };
  }
}

function writeSeen(ids: Set<number>) {
  try {
    localStorage.setItem(seenKey, JSON.stringify([...ids]));
  } catch {
    // A blocked store still alerts for this visit.
  }
}

function readOptIn() {
  try {
    return localStorage.getItem(optInKey) === "1";
  } catch {
    return false;
  }
}

function writeOptIn() {
  try {
    localStorage.setItem(optInKey, "1");
  } catch {
    // The choice still applies for this visit.
  }
}

function permissionNow(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

let registrationTask: Promise<ServiceWorkerRegistration | null> | null = null;

function registration() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  registrationTask ??= navigator.serviceWorker
    .register("/sw.js")
    .then(async (worker) => {
      if (worker.active) return worker;
      return navigator.serviceWorker.ready;
    })
    .catch(() => null);
  return registrationTask;
}

async function showSystem(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const worker = await registration();
  if (worker) {
    try {
      await worker.showNotification(title, { body, tag });
      return;
    } catch {
      // Desktop browsers still accept the page constructor.
    }
  }
  try {
    new Notification(title, { body, tag });
  } catch {
    // The note on the page is the fallback.
  }
}

export function useChangeNotifications(changes: ChangeEvent[]) {
  const [permission, setPermission] = useState<NotificationPermission>(permissionNow);
  const [optedIn, setOptedIn] = useState(() => readOptIn() || permissionNow() === "granted");
  const [notice, setNotice] = useState<string | null>(null);
  const signature = changes.map((change) => change.id).join("|");

  useEffect(() => {
    void registration();
  }, []);

  useEffect(() => {
    if (!optedIn) return;
    const seen = readSeen();
    const result = takeAlerts(changes, seen);
    if (result.dirty) writeSeen(seen.ids);
    const copy = alertCopy(result.alerts);
    if (!copy) return;
    setNotice(copy.body);
    void showSystem(copy.title, copy.body, copy.tag);
  }, [signature, optedIn, permission, changes]);

  async function enable() {
    writeOptIn();
    setOptedIn(true);
    if (typeof Notification === "undefined") {
      setNotice("This browser has no system alerts. Updates will show on this page.");
      return;
    }
    let next: NotificationPermission;
    try {
      next = await Notification.requestPermission();
    } catch {
      setPermission("denied");
      setNotice("This browser has no system alerts. Updates will show on this page.");
      return;
    }
    setPermission(next);
    if (next === "granted") {
      const text = "Notifications are on. You'll be told when a class changes.";
      setNotice(text);
      void showSystem("Timetable", text, "timetable-on");
      return;
    }
    if (next === "denied") {
      setNotice("System alerts are blocked. Updates will show on this page.");
      return;
    }
    setNotice("Updates will show on this page. Allow notifications to hear about them in the background.");
  }

  return {
    supported: typeof Notification !== "undefined",
    permission,
    optedIn,
    notice,
    dismiss: () => setNotice(null),
    enable,
  };
}
