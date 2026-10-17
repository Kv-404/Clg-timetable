import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDatabase, readAllChanges, readLectures, writeSyncState } from "../src/db.ts";
import type { StoredLecture } from "../src/model.ts";
import { exportArchive, importArchive } from "../src/services/durableState.ts";
import { mergeArchives, type TimetableArchive } from "../src/services/timetableArchive.ts";

function lecture(id: string, overrides: Partial<StoredLecture> = {}): StoredLecture {
  return {
    id,
    slotKey: id,
    tabName: "Wednesday",
    course: "BTech",
    semester: "3",
    batch: "2025-29",
    division: "Demis Hassabis 2025",
    date: "2026-10-14",
    weekday: "Wednesday",
    startMinutes: 920,
    endMinutes: 980,
    startLabel: "3:20 PM",
    endLabel: "4:20 PM",
    subject: "Interactive Session",
    faculty: "Dr. Aarti",
    room: "Classroom - 38",
    kind: "lecture",
    sourceStatus: "scheduled",
    reason: null,
    explicitMark: null,
    recurring: false,
    anchor: {
      subject: "Interactive Session",
      faculty: "Dr. Aarti",
      room: "Classroom - 38",
      startMinutes: 920,
      endMinutes: 980,
      startLabel: "3:20 PM",
      endLabel: "4:20 PM",
      sourceStatus: "scheduled",
      reason: "",
      kind: "lecture",
      explicitMark: null,
    },
    highlight: null,
    ...overrides,
  };
}

function archive(lectures: StoredLecture[], savedAt: string, lastSuccessAt: string): TimetableArchive {
  return {
    version: 1,
    savedAt,
    lectures,
    changes: [],
    sync: {
      lastSuccessAt,
      lastAttemptAt: lastSuccessAt,
      lastError: null,
      bootstrapped: true,
      contentHash: "hash",
      tabNames: ["Wednesday"],
      parseIssues: [],
      spreadsheetTitle: "week",
    },
  };
}

describe("timetable archive", () => {
  it("keeps a removed lecture that the newer copy dropped from a day that is still published", () => {
    const older = archive(
      [lecture("gone", { sourceStatus: "cancelled", explicitMark: "cancelled" }), lecture("stays")],
      "2026-10-14T01:00:00.000Z",
      "2026-10-14T01:00:00.000Z",
    );
    const newer = archive([lecture("stays"), lecture("other", { subject: "Tutorial" })], "2026-10-14T02:00:00.000Z", "2026-10-14T02:00:00.000Z");
    const merged = mergeArchives(older, newer);
    assert.deepEqual(merged.lectures.map((item) => item.id).sort(), ["gone", "other", "stays"]);
    assert.equal(merged.lectures.find((item) => item.id === "gone")?.sourceStatus, "cancelled");
  });

  it("does not bring back a lecture from a day the newer week no longer publishes", () => {
    const older = archive(
      [lecture("gone", { sourceStatus: "cancelled", date: "2026-10-07", tabName: "Wednesday" })],
      "2026-10-07T01:00:00.000Z",
      "2026-10-07T01:00:00.000Z",
    );
    const newer = archive([lecture("stays", { date: "2026-10-14" })], "2026-10-14T02:00:00.000Z", "2026-10-14T02:00:00.000Z");
    const merged = mergeArchives(older, newer);
    assert.deepEqual(merged.lectures.map((item) => item.id), ["stays"]);
  });

  it("drops last week's change log when the saved week does not overlap", () => {
    const older = archive([lecture("old", { date: "2026-10-16" })], "2026-10-16T01:00:00.000Z", "2026-10-16T01:00:00.000Z");
    older.changes = [
      {
        id: 9,
        dedupeKey: "old|cancelled",
        detectedAt: "2026-10-16T01:00:00.000Z",
        type: "cancelled",
        lectureId: "old",
        division: "Demis Hassabis 2025",
        course: "BTech",
        semester: "3",
        tabName: "Wednesday",
        date: "2026-10-16",
        weekday: "Friday",
        summary: "Interactive Session lecture cancelled.",
        previous: null,
        next: null,
        fields: ["status"],
      },
    ];
    const newer = archive([lecture("next", { date: "2026-10-23" })], "2026-10-19T02:00:00.000Z", "2026-10-19T02:00:00.000Z");
    const merged = mergeArchives(older, newer);
    assert.deepEqual(merged.lectures.map((item) => item.id), ["next"]);
    assert.equal(merged.changes.length, 0);
    assert.equal(merged.sync.contentHash, newer.sync.contentHash);
  });

  it("drops a change whose date is no longer on the published week", () => {
    const current = archive([lecture("next", { date: "2026-10-23" })], "2026-10-19T02:00:00.000Z", "2026-10-19T02:00:00.000Z");
    const saved = archive([lecture("next", { date: "2026-10-23" })], "2026-10-19T01:00:00.000Z", "2026-10-19T01:00:00.000Z");
    saved.changes = [
      {
        id: 3,
        dedupeKey: "old|faculty",
        detectedAt: "2026-10-16T01:00:00.000Z",
        type: "faculty_change",
        lectureId: "old",
        division: "Demis Hassabis 2025",
        course: "BTech",
        semester: "3",
        tabName: "Friday",
        date: "2026-10-16",
        weekday: "Friday",
        summary: "Faculty changed.",
        previous: null,
        next: null,
        fields: ["faculty"],
      },
    ];
    const merged = mergeArchives(saved, current);
    assert.equal(merged.changes.length, 0);
    assert.equal(merged.lectures[0]?.id, "next");
  });

  it("round-trips the saved lectures and change log", () => {
    const source = openDatabase(":memory:");
    const cancelled = lecture("gone", { sourceStatus: "cancelled", explicitMark: "cancelled" });
    importArchive(source, {
      ...archive([cancelled, lecture("stays")], "2026-10-14T02:00:00.000Z", "2026-10-14T02:00:00.000Z"),
      changes: [
        {
          id: 4,
          dedupeKey: "gone|cancelled",
          detectedAt: "2026-10-14T02:00:00.000Z",
          type: "cancelled",
          lectureId: "gone",
          division: cancelled.division,
          course: cancelled.course,
          semester: cancelled.semester,
          tabName: cancelled.tabName,
          date: cancelled.date,
          weekday: cancelled.weekday,
          summary: "Interactive Session lecture cancelled.",
          previous: null,
          next: null,
          fields: ["status"],
        },
      ],
    });
    const copy = openDatabase(":memory:");
    importArchive(copy, exportArchive(source));
    assert.equal(readLectures(copy).find((item) => item.id === "gone")?.sourceStatus, "cancelled");
    assert.equal(readAllChanges(copy)[0]?.id, 4);
    assert.equal(readAllChanges(copy)[0]?.type, "cancelled");
    writeSyncState(copy, { ...exportArchive(copy).sync, lastError: null });
  });
});
