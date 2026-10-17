import type { ParseIssue } from "../../../shared/types.ts";
import type { AppConfig } from "../config.ts";
import type { AppDatabase, SyncState } from "../db.ts";
import { readSyncState, replaceChangeRows, writeSyncState } from "../db.ts";
import type { NormalizedLecture, StoredLecture } from "../model.ts";
import { compareSnapshots, initialSnapshot } from "./changeDetectionService.ts";
import { recordChanges } from "./changeHistoryService.ts";
import { contentFingerprint, normalizeWorkbook } from "./timetableNormalizer.ts";
import { parseTimetableSource } from "./timetableParser.ts";
import { hydrateArchive, publishArchive } from "./durableState.ts";
import { persistCancelledRemovals } from "./persistCancelled.ts";
import { loadSnapshot, saveSnapshot, toNormalized } from "./timetableSnapshotService.ts";

export interface SyncContext {
  db: AppDatabase;
  config: Pick<AppConfig, "courseName" | "dateOrder" | "spreadsheetTitle" | "syncIntervalSeconds">;
  load: () => Promise<{ buffer: Buffer }>;
  now?: Date;
}

export interface SyncOutcome {
  ok: boolean;
  unchanged: boolean;
  changeCount: number;
  error: string | null;
}

const inflight = new WeakMap<AppDatabase, Promise<SyncOutcome>>();

/** A new weekly sheet has a different set of dates. That is a new baseline, not an edit of last week. */
function replacesPublishedWeek(previous: StoredLecture[], next: NormalizedLecture[]) {
  const previousDates = new Set(previous.map((lecture) => lecture.date).filter((date): date is string => Boolean(date)));
  const nextDates = new Set(next.map((lecture) => lecture.date).filter((date): date is string => Boolean(date)));
  if (previousDates.size === 0 || nextDates.size === 0) return false;
  for (const date of nextDates) {
    if (previousDates.has(date)) return false;
  }
  return true;
}

function withCarriedTabs(previous: ReturnType<typeof loadSnapshot>, lectures: NormalizedLecture[], issues: ParseIssue[]) {
  const counts = new Map<string, number>();
  for (const lecture of lectures) counts.set(lecture.tabName, (counts.get(lecture.tabName) ?? 0) + 1);
  const fatalTabs = new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.tabName));
  const carried = [...lectures];
  const notes: ParseIssue[] = [];
  for (const tabName of fatalTabs) {
    if ((counts.get(tabName) ?? 0) > 0) continue;
    const prior = previous.filter((lecture) => lecture.tabName === tabName);
    if (prior.length === 0) continue;
    carried.push(...prior.map(toNormalized));
    notes.push({
      tabName,
      severity: "warning",
      message: "Showing the last good copy of this tab because the latest version could not be parsed.",
    });
  }
  return { lectures: carried, issues: [...issues, ...notes] };
}

async function performSync(ctx: SyncContext): Promise<SyncOutcome> {
  const now = ctx.now ?? new Date();
  const attemptAt = now.toISOString();
  try {
    await hydrateArchive(ctx.db);
    const current = readSyncState(ctx.db);
    const { buffer } = await ctx.load();
    const parsed = await parseTimetableSource(buffer, { dateOrder: ctx.config.dateOrder });
    const normalized = normalizeWorkbook(parsed, { courseFallback: ctx.config.courseName });
    persistCancelledRemovals(ctx.db);
    const previous = loadSnapshot(ctx.db);
    const retained = withCarriedTabs(previous, normalized.lectures, normalized.issues);
    const tabNames = parsed.tabs.map((tab) => tab.name);
    const contentHash = contentFingerprint(retained.lectures, tabNames, retained.issues);

    if (current.bootstrapped && current.contentHash === contentHash) {
      writeSyncState(ctx.db, successState(current, attemptAt, contentHash, tabNames, retained.issues, ctx.config.spreadsheetTitle));
      await publishArchive(ctx.db);
      return { ok: true, unchanged: true, changeCount: 0, error: null };
    }

    const freshWeek = current.bootstrapped && replacesPublishedWeek(previous, retained.lectures);
    const stored = current.bootstrapped && !freshWeek
      ? compareSnapshots(previous, retained.lectures, {
          now,
          previousTabs: current.tabNames,
          nextTabs: tabNames,
          bootstrapped: true,
        })
      : { lectures: initialSnapshot(retained.lectures), events: [] };

    ctx.db.exec("BEGIN");
    try {
      if (freshWeek) replaceChangeRows(ctx.db, []);
      saveSnapshot(ctx.db, stored.lectures);
      recordChanges(ctx.db, stored.events);
      writeSyncState(ctx.db, {
        ...successState(current, attemptAt, contentHash, tabNames, retained.issues, ctx.config.spreadsheetTitle),
        bootstrapped: true,
      });
      ctx.db.exec("COMMIT");
    } catch (error) {
      ctx.db.exec("ROLLBACK");
      throw error;
    }
    await publishArchive(ctx.db);
    return { ok: true, unchanged: false, changeCount: stored.events.length, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The spreadsheet could not be read.";
    writeSyncState(ctx.db, {
      ...readSyncState(ctx.db),
      lastAttemptAt: attemptAt,
      lastError: message,
    });
    return { ok: false, unchanged: false, changeCount: 0, error: message };
  }
}

function successState(current: SyncState, attemptAt: string, contentHash: string, tabNames: string[], parseIssues: ParseIssue[], title: string): SyncState {
  return {
    ...current,
    lastAttemptAt: attemptAt,
    lastSuccessAt: attemptAt,
    lastError: null,
    contentHash,
    tabNames,
    parseIssues,
    spreadsheetTitle: title,
  };
}

export function runSync(ctx: SyncContext) {
  const existing = inflight.get(ctx.db);
  if (existing) return existing;
  const pending = performSync(ctx).finally(() => {
    inflight.delete(ctx.db);
  });
  inflight.set(ctx.db, pending);
  return pending;
}

export function startScheduler(ctx: SyncContext) {
  void runSync(ctx).then((result) => {
    if (result.ok) {
      console.log(`[sync] timetable updated (${result.unchanged ? "no changes" : `${result.changeCount} changes`})`);
    } else {
      console.error(`[sync] ${result.error}`);
    }
  });
  const timer = setInterval(() => {
    void runSync(ctx).then((result) => {
      if (!result.ok) console.error(`[sync] ${result.error}`);
      else if (!result.unchanged) console.log(`[sync] ${result.changeCount} timetable changes detected`);
    });
  }, ctx.config.syncIntervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
