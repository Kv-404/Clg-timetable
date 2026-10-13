import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { calendarFile } from "../../shared/calendar.ts";
import { cohortName } from "../../shared/cohort.ts";
import type { BootstrapResponse } from "../../shared/types.ts";
import { spreadsheetUrl, type AppConfig } from "./config.ts";
import { readSyncState, type AppDatabase } from "./db.ts";
import { listChanges } from "./services/changeHistoryService.ts";
import { presentLecture } from "./services/presentLecture.ts";
import { loadSnapshot } from "./services/timetableSnapshotService.ts";
import { runSync, type SyncContext } from "./services/syncScheduler.ts";
import { zonedParts } from "./time.ts";

function buildBootstrap(db: AppDatabase, config: AppConfig, now = new Date()): BootstrapResponse {
  const state = readSyncState(db);
  const zone = zonedParts(now, config.timezone);
  const lectures = loadSnapshot(db)
    .map((lecture) => presentLecture(lecture, now, config.highlightHours))
    .sort((a, b) => {
      const date = (a.date ?? "").localeCompare(b.date ?? "");
      if (date !== 0) return date;
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      const division = a.division.localeCompare(b.division);
      if (division !== 0) return division;
      return a.subject.localeCompare(b.subject);
    });
  const dates = lectures.map((lecture) => lecture.date).filter((date): date is string => Boolean(date)).sort();
  return {
    collegeName: config.collegeName,
    schoolName: config.schoolName,
    courseName: config.courseName,
    spreadsheetId: config.spreadsheetId,
    spreadsheetTitle: state.spreadsheetTitle || config.spreadsheetTitle,
    spreadsheetUrl: spreadsheetUrl(config.spreadsheetId),
    timezone: config.timezone,
    today: zone.iso,
    now: now.toISOString(),
    weekStart: dates[0] ?? null,
    weekEnd: dates[dates.length - 1] ?? null,
    sync: {
      lastSuccessAt: state.lastSuccessAt,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      stale: Boolean(state.lastError) || !state.lastSuccessAt,
      bootstrapped: state.bootstrapped,
      intervalSeconds: config.syncIntervalSeconds,
      highlightHours: config.highlightHours,
      tabNames: state.tabNames,
      contentHash: state.contentHash,
      source: "google-sheets-xlsx-export",
    },
    parseIssues: state.parseIssues,
    lectures,
    changes: listChanges(db, 80),
  };
}

export function createApp(db: AppDatabase, config: AppConfig, load: SyncContext["load"], options?: { syncOnRead?: boolean }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.clientOrigin ?? true }));
  // The catch-all function sometimes receives /bootstrap instead of /api/bootstrap.
  if (process.env.VERCEL) {
    app.use((req, _res, next) => {
      const url = req.url || "/";
      if (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")) {
        next();
        return;
      }
      req.url = url.startsWith("/") ? `/api${url}` : `/api/${url}`;
      next();
    });
  }

  async function syncIfStale() {
    if (!options?.syncOnRead) return;
    const state = readSyncState(db);
    const age = state.lastSuccessAt ? Date.now() - new Date(state.lastSuccessAt).getTime() : Number.POSITIVE_INFINITY;
    if (age > config.syncIntervalSeconds * 1000) await runSync({ db, config, load });
  }

  app.get("/api/health", (_req, res) => {
    const state = readSyncState(db);
    res.status(state.lastSuccessAt ? 200 : 503).json({
      ok: Boolean(state.lastSuccessAt),
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
    });
  });
  app.get("/api/bootstrap", async (_req, res) => {
    await syncIfStale();
    res.json(buildBootstrap(db, config));
  });
  app.get("/api/calendar.ics", async (req, res) => {
    await syncIfStale();
    const division = typeof req.query.division === "string" ? req.query.division.trim() : "";
    const snapshot = buildBootstrap(db, config);
    const lectures = division ? snapshot.lectures.filter((lecture) => lecture.division === division) : [];
    if (!division || lectures.length === 0) {
      res.status(404).type("text/plain").send("Unknown cohort.");
      return;
    }
    const name = cohortName(division);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.query.download === "1") {
      const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "timetable"}.ics`;
      res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    }
    res.send(calendarFile(lectures, config.timezone, name));
  });
  app.get("/api/changes", (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
    res.json({ changes: listChanges(db, limit) });
  });
  app.post("/api/sync", async (_req, res) => {
    await runSync({ db, config, load });
    res.json(buildBootstrap(db, config));
  });

  if (!process.env.VERCEL) {
    const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.get(/^(?!\/api).*/, (_req, res) => {
        res.sendFile(path.join(clientDist, "index.html"));
      });
    }
  }
  return app;
}
