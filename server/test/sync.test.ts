import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { openDatabase, readChanges, readLectures, readSyncState, replaceChangeRows } from "../src/db.ts";
import { runSync } from "../src/services/syncScheduler.ts";

async function workbookBuffer(fill: (sheet: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tuesday");
  sheet.getCell("A1").value = "SEMESTER - 3";
  sheet.getCell("A2").value = "13/10/2026 (Tuesday)";
  sheet.getCell("A3").value = "Timing";
  sheet.getCell("B3").value = "Sam Altman 2025";
  sheet.getCell("A4").value = "10:00 AM - 11:00 AM";
  sheet.getCell("B4").value = "Data Structures and Algorithm - II";
  sheet.getCell("A5").value = "Faculty";
  sheet.getCell("B5").value = "Dr. Aarti P";
  sheet.getCell("A6").value = "Classroom No";
  sheet.getCell("B6").value = "Classroom - 18";
  fill(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function context(db: ReturnType<typeof openDatabase>, buffers: Buffer[]) {
  let index = 0;
  return {
    db,
    config: {
      courseName: "BTech",
      dateOrder: "DMY" as const,
      spreadsheetTitle: "Test sheet",
      syncIntervalSeconds: 45,
    },
    load: async () => {
      const buffer = buffers[Math.min(index, buffers.length - 1)];
      index += 1;
      if (!buffer) throw new Error("Google Sheets export failed (503). The sheet may be private or temporarily unavailable.");
      return { buffer };
    },
  };
}

describe("sync", () => {
  it("keeps the last timetable when the spreadsheet is unavailable", async () => {
    const db = openDatabase(":memory:");
    const good = await workbookBuffer(() => undefined);
    const first = await runSync(context(db, [good]));
    assert.equal(first.ok, true);
    assert.equal(first.changeCount, 0);
    assert.equal(readLectures(db).length, 1);

    const failed = await runSync({
      ...context(db, [good]),
      load: async () => {
        throw new Error("Google Sheets export failed (503). The sheet may be private or temporarily unavailable.");
      },
    });
    assert.equal(failed.ok, false);
    assert.match(readSyncState(db).lastError ?? "", /503/);
    assert.equal(readLectures(db).length, 1);
    assert.equal(readLectures(db)[0]?.subject, "Data Structures and Algorithm - II");
  });

  it("records one history row when the same change is synced twice", async () => {
    const db = openDatabase(":memory:");
    const before = await workbookBuffer(() => undefined);
    const after = await workbookBuffer((sheet) => {
      sheet.getCell("B6").value = "Classroom - 40";
    });
    await runSync(context(db, [before]));
    const changed = await runSync(context(db, [after]));
    assert.equal(changed.changeCount, 1);
    const repeated = await runSync(context(db, [after]));
    assert.equal(repeated.unchanged, true);
    assert.equal(readChanges(db).length, 1);
    assert.equal(readChanges(db)[0]?.type, "room_change");
  });

  it("notices a new division tab and a lecture added on an existing day", async () => {
    const db = openDatabase(":memory:");
    const before = await workbookBuffer(() => undefined);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(before as unknown as ExcelJS.Buffer);
    const tuesday = workbook.getWorksheet("Tuesday")!;
    tuesday.getCell("A8").value = "11:10 AM - 12:10 PM";
    tuesday.getCell("B8").value = "Machine Learning Fundamentals";
    tuesday.getCell("A9").value = "Faculty";
    tuesday.getCell("B9").value = "Prof. Karan";
    tuesday.getCell("A10").value = "Classroom No";
    tuesday.getCell("B10").value = "Classroom - 37";
    const extra = workbook.addWorksheet("BCA-A");
    extra.addRow(["Subject", "Faculty", "Time", "Room", "Status", "Division", "Date"]);
    extra.addRow(["Java", "Prof. Amaan", "12:00 PM - 1:00 PM", "Lab 2", "SCHEDULED", "BCA-A", "14/10/2026"]);
    const after = Buffer.from(await workbook.xlsx.writeBuffer());

    await runSync(context(db, [before]));
    const diff = await runSync(context(db, [after]));
    assert.ok(diff.changeCount >= 2);
    const changes = readChanges(db);
    assert.ok(changes.some((change) => change.type === "tab_added" && change.summary.includes("BCA-A")));
    const added = changes.find((change) => change.type === "added" && change.summary.includes("Machine Learning"));
    assert.equal(added?.division, "Sam Altman 2025");
    assert.equal(added?.date, "2026-10-13");
    const java = readLectures(db).find((lecture) => lecture.subject === "Java");
    assert.equal(java?.division, "BCA-A");
    assert.equal(java?.weekday, "Wednesday");
  });

  it("starts a fresh baseline when the sheet moves to a new week", async () => {
    const db = openDatabase(":memory:");
    const before = await workbookBuffer(() => undefined);
    await runSync(context(db, [before]));
    const edited = await workbookBuffer((sheet) => {
      sheet.getCell("B6").value = "Classroom - 40";
    });
    const changed = await runSync(context(db, [edited]));
    assert.equal(changed.changeCount, 1);
    assert.equal(readChanges(db).length, 1);

    const after = await workbookBuffer((sheet) => {
      sheet.getCell("A2").value = "20/10/2026 (Tuesday)";
      sheet.getCell("B4").value = "Machine Learning Fundamentals";
      sheet.getCell("B6").value = "Classroom - 4";
    });
    const rolled = await runSync(context(db, [after]));
    assert.equal(rolled.ok, true);
    assert.equal(rolled.changeCount, 0);
    assert.equal(readChanges(db).length, 0);
    const lectures = readLectures(db);
    assert.equal(lectures.length, 1);
    assert.equal(lectures[0]?.date, "2026-10-20");
    assert.equal(lectures[0]?.subject, "Machine Learning Fundamentals");
    assert.equal(lectures[0]?.room, "Classroom - 4");

    const tweak = await workbookBuffer((sheet) => {
      sheet.getCell("A2").value = "20/10/2026 (Tuesday)";
      sheet.getCell("B4").value = "Machine Learning Fundamentals";
      sheet.getCell("B6").value = "Classroom - 9";
    });
    const next = await runSync(context(db, [tweak]));
    assert.equal(next.changeCount, 1);
    assert.equal(readChanges(db)[0]?.type, "room_change");
    assert.equal(readLectures(db)[0]?.date, "2026-10-20");
  });

  it("removes change history from a week the sheet no longer publishes", async () => {
    const db = openDatabase(":memory:");
    const sheet = await workbookBuffer(() => undefined);
    await runSync(context(db, [sheet]));
    replaceChangeRows(db, [
      {
        id: 8,
        dedupeKey: "old-week",
        detectedAt: "2026-10-10T01:00:00.000Z",
        type: "faculty_change",
        lectureId: "old",
        division: "Sam Altman 2025",
        course: "BTech",
        semester: "3",
        tabName: "Tuesday",
        date: "2026-10-06",
        weekday: "Tuesday",
        summary: "Faculty changed.",
        previous: null,
        next: null,
        fields: ["faculty"],
      },
    ]);
    const again = await runSync(context(db, [sheet]));
    assert.equal(again.ok, true);
    assert.equal(readChanges(db).some((change) => change.date === "2026-10-06"), false);
    assert.equal(readLectures(db)[0]?.date, "2026-10-13");
  });
});
