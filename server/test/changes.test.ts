import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedLecture } from "../src/model.ts";
import { compareSnapshots, initialSnapshot } from "../src/services/changeDetectionService.ts";
import { presentLecture } from "../src/services/presentLecture.ts";

const now = new Date("2026-10-13T06:30:00.000Z");

function lecture(overrides: Partial<NormalizedLecture> = {}): NormalizedLecture {
  const merged: NormalizedLecture = {
    id: "",
    slotKey: "",
    tabName: "Tuesday",
    course: "BTech",
    semester: "3",
    batch: "2025-29",
    division: "Sam Altman 2025",
    date: "2026-10-13",
    weekday: "Tuesday",
    startMinutes: 600,
    endMinutes: 660,
    startLabel: "10:00 AM",
    endLabel: "11:00 AM",
    subject: "Data Structures and Algorithm - II",
    faculty: "Dr. Aarti P",
    room: "Classroom - 18",
    kind: "lecture",
    sourceStatus: "scheduled",
    reason: null,
    explicitMark: null,
    recurring: false,
    ...overrides,
  };
  if (!overrides.slotKey) {
    merged.slotKey = `${merged.tabName}|${merged.date ?? "weekly"}|${merged.division}|${merged.startMinutes}-${merged.endMinutes}`;
  }
  if (!overrides.id) merged.id = merged.slotKey;
  return merged;
}

function compare(previous: NormalizedLecture[], next: NormalizedLecture[], previousTabs = ["Tuesday"], nextTabs = previousTabs) {
  return compareSnapshots(initialSnapshot(previous), next, {
    now,
    previousTabs,
    nextTabs,
    bootstrapped: true,
  });
}

describe("change detection", () => {
  it("does not emit events when a refresh has the same timetable", () => {
    const original = [lecture()];
    const diff = compare(original, [lecture({ faculty: "Dr.  Aarti   P" })]);
    assert.equal(diff.events.length, 0);
    assert.equal(diff.lectures.length, 1);
    assert.equal(diff.lectures[0]?.highlight, null);
  });

  it("records a new lecture once, on the right division and day", () => {
    const added = lecture({
      division: "Jeff Bezos 2025",
      date: "2026-10-14",
      weekday: "Wednesday",
      tabName: "Wednesday",
      subject: "Machine Learning Fundamentals",
      startMinutes: 780,
      endMinutes: 840,
      startLabel: "1:00 PM",
      endLabel: "2:00 PM",
    });
    const first = compare([], [added], ["Tuesday"], ["Tuesday", "Wednesday"]);
    assert.equal(first.events.filter((event) => event.type === "added").length, 1);
    assert.equal(first.events.find((event) => event.type === "added")?.division, "Jeff Bezos 2025");
    assert.equal(first.events.find((event) => event.type === "added")?.date, "2026-10-14");
    assert.equal(first.lectures[0]?.weekday, "Wednesday");
    assert.ok(first.events.some((event) => event.type === "tab_added"));

    const second = compareSnapshots(first.lectures, [added], {
      now: new Date("2026-10-13T06:31:00.000Z"),
      previousTabs: ["Tuesday", "Wednesday"],
      nextTabs: ["Tuesday", "Wednesday"],
      bootstrapped: true,
    });
    assert.equal(second.events.length, 0);
  });

  it("detects a classroom change without marking the lecture cancelled", () => {
    const diff = compare([lecture({ room: "Classroom - 39" })], [lecture({ room: "Classroom - 40" })]);
    assert.equal(diff.events.length, 1);
    assert.equal(diff.events[0]?.type, "room_change");
    assert.match(diff.events[0]?.summary ?? "", /Classroom - 39/);
    assert.match(diff.events[0]?.summary ?? "", /Classroom - 40/);
    const view = presentLecture(diff.lectures[0]!, now, 72);
    assert.equal(view.displayStatus, "changed");
    assert.equal(view.previous?.room, "Classroom - 39");
    assert.equal(view.room, "Classroom - 40");
  });

  it("detects a faculty change", () => {
    const diff = compare([lecture()], [lecture({ faculty: "Prof. Shreya" })]);
    assert.equal(diff.events[0]?.type, "faculty_change");
    assert.equal(presentLecture(diff.lectures[0]!, now, 72).previous?.faculty, "Dr. Aarti P");
  });

  it("detects an explicit cancellation and keeps the original subject", () => {
    const diff = compare(
      [lecture()],
      [lecture({ subject: "OFF", kind: "off", sourceStatus: "cancelled", explicitMark: "cancelled", reason: "Marked OFF on the official timetable.", faculty: "", room: "" })],
    );
    assert.equal(diff.events[0]?.type, "cancelled");
    const view = presentLecture(diff.lectures[0]!, now, 72);
    assert.equal(view.displayStatus, "cancelled");
    assert.equal(view.subject, "OFF");
    assert.equal(view.previous?.subject, "Data Structures and Algorithm - II");
    assert.equal(diff.lectures.length, 1);
  });

  it("detects a cancelled class being restored", () => {
    const cancelled = compare(
      [lecture()],
      [lecture({ sourceStatus: "cancelled", explicitMark: "cancelled", reason: "Faculty unavailable" })],
    );
    const restored = compareSnapshots(cancelled.lectures, [lecture()], {
      now: new Date("2026-10-13T07:00:00.000Z"),
      previousTabs: ["Tuesday"],
      nextTabs: ["Tuesday"],
      bootstrapped: true,
    });
    assert.equal(restored.events[0]?.type, "restored");
    assert.equal(presentLecture(restored.lectures[0]!, now, 72).displayStatus, "scheduled");
  });

  it("detects an in-place change being reverted", () => {
    const changed = compare([lecture({ room: "Classroom - 39" })], [lecture({ room: "Classroom - 40" })]);
    const reverted = compareSnapshots(changed.lectures, [lecture({ room: "Classroom - 39" })], {
      now: new Date("2026-10-13T08:00:00.000Z"),
      previousTabs: ["Tuesday"],
      nextTabs: ["Tuesday"],
      bootstrapped: true,
    });
    assert.equal(reverted.events.length, 1);
    assert.equal(reverted.events[0]?.type, "reverted");
    assert.equal(reverted.lectures[0]?.highlight, null);
  });

  it("moves a class to a new time without creating a second copy", () => {
    const before = lecture({
      subject: "Operating Systems",
      room: "Room 201",
      faculty: "Prof. Karan",
      startMinutes: 600,
      endMinutes: 660,
      startLabel: "10:00 AM",
      endLabel: "11:00 AM",
    });
    const after = lecture({
      subject: "Operating Systems",
      room: "Room 305",
      faculty: "Prof. Karan",
      startMinutes: 660,
      endMinutes: 720,
      startLabel: "11:00 AM",
      endLabel: "12:00 PM",
    });
    const diff = compare([before], [after]);
    assert.deepEqual(diff.events.map((event) => event.type), ["rescheduled"]);
    assert.equal(diff.lectures.length, 1);
    assert.equal(diff.lectures[0]?.id, before.id);
    assert.equal(diff.lectures[0]?.startLabel, "11:00 AM");
    assert.equal(diff.lectures[0]?.room, "Room 305");
    const view = presentLecture(diff.lectures[0]!, now, 72);
    assert.equal(view.displayStatus, "rescheduled");
    assert.equal(view.previous?.startLabel, "10:00 AM");
    assert.equal(view.previous?.room, "Room 201");

    const again = compareSnapshots(diff.lectures, [after], {
      now: new Date("2026-10-13T06:40:00.000Z"),
      previousTabs: ["Tuesday"],
      nextTabs: ["Tuesday"],
      bootstrapped: true,
    });
    assert.equal(again.events.length, 0);
    assert.equal(again.lectures.length, 1);
    assert.equal(again.lectures[0]?.highlight?.detectedAt, diff.lectures[0]?.highlight?.detectedAt);
  });

  it("does not treat a removed row as a cancellation", () => {
    const diff = compare([lecture()], []);
    assert.equal(diff.events[0]?.type, "removed");
    assert.match(diff.events[0]?.summary ?? "", /not marked cancelled/i);
    assert.equal(diff.lectures.length, 0);
  });

  it("does not pair two different sessions that share only a subject", () => {
    const removed = lecture({ subject: "Operating Systems", faculty: "Prof. Karan", room: "Room 201" });
    const added = lecture({
      subject: "Operating Systems",
      faculty: "Dr. Dipanjan",
      room: "Room 305",
      startMinutes: 780,
      endMinutes: 840,
      startLabel: "1:00 PM",
      endLabel: "2:00 PM",
    });
    const diff = compare([removed], [added]);
    assert.deepEqual(diff.events.map((event) => event.type).sort(), ["added", "cancelled"]);
    assert.equal(diff.lectures.length, 2);
    const kept = diff.lectures.find((item) => item.id === removed.id);
    assert.equal(kept?.sourceStatus, "cancelled");
    assert.notEqual(diff.lectures.find((item) => item.subject === "Operating Systems" && item.id !== removed.id)?.id, removed.id);
  });

  it("keeps a lecture that was removed from a day that is still published, and marks it cancelled", () => {
    const gone = lecture({ subject: "Interactive Session", startMinutes: 920, endMinutes: 980, startLabel: "3:20 PM", endLabel: "4:20 PM" });
    const stays = lecture({ subject: "Software Engineering", startMinutes: 600, endMinutes: 660 });
    const diff = compare([gone, stays], [stays]);
    assert.equal(diff.events.length, 1);
    assert.equal(diff.events[0]?.type, "cancelled");
    assert.match(diff.events[0]?.summary ?? "", /lecture cancelled/i);
    assert.equal(diff.lectures.length, 2);
    const cancelled = diff.lectures.find((item) => item.id === gone.id);
    assert.equal(cancelled?.sourceStatus, "cancelled");
    assert.equal(presentLecture(cancelled!, now, 72).displayStatus, "cancelled");

    const again = compareSnapshots(diff.lectures, [stays], {
      now: new Date("2026-10-13T06:40:00.000Z"),
      previousTabs: ["Tuesday"],
      nextTabs: ["Tuesday"],
      bootstrapped: true,
    });
    assert.equal(again.events.length, 0);
    assert.equal(again.lectures.find((item) => item.id === gone.id)?.sourceStatus, "cancelled");
  });
});
