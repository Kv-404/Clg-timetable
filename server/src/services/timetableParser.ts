import ExcelJS from "exceljs";
import type { ParseIssue } from "../../../shared/types.ts";
import type { RawSlot } from "../model.ts";
import { canon, parseDateLabel, parseTimeRange, parseTimeToken, weekdayFromName } from "../time.ts";

export interface ParsedTab {
  name: string;
  collegeName: string | null;
  semester: string | null;
  batch: string | null;
  date: string | null;
  weekday: string | null;
  slots: RawSlot[];
  issues: ParseIssue[];
}

export interface ParsedWorkbook {
  tabs: ParsedTab[];
  issues: ParseIssue[];
  collegeName: string | null;
  semester: string | null;
  batch: string | null;
}

export interface ParseOptions {
  dateOrder?: "DMY" | "MDY";
}

type Role = "empty" | "header" | "time" | "faculty" | "room" | "status" | "reason" | "meta" | "other";

interface Matrix {
  rowCount: number;
  colCount: number;
  own: (row: number, col: number) => string;
  masterOf: (row: number, col: number) => { row: number; col: number; text: string } | null;
}

const HEADER_ALIASES: Record<string, string[]> = {
  subject: ["subject", "course name", "module", "paper", "lecture"],
  faculty: ["faculty", "faculty name", "teacher", "professor", "instructor"],
  room: ["room", "classroom", "classroom no", "class room", "venue", "lab", "laboratory"],
  status: ["status"],
  reason: ["reason", "remarks", "remark", "note", "notes"],
  division: ["division", "class", "cohort", "section"],
  date: ["date"],
  day: ["day", "weekday"],
  time: ["time", "timing", "slot", "time slot"],
  start: ["start", "start time", "from"],
  end: ["end", "end time", "to"],
  semester: ["semester", "sem"],
  course: ["course", "programme", "program"],
};

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${value.getFullYear()}`;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return canon(String(value));
  }
  if (typeof value === "object") {
    const record = value as {
      richText?: Array<{ text?: string }>;
      text?: string;
      result?: unknown;
      hyperlink?: string;
    };
    if (Array.isArray(record.richText)) {
      return canon(record.richText.map((part) => part.text ?? "").join(""));
    }
    if (typeof record.text === "string") return canon(record.text);
    if ("result" in record) return cellText(record.result);
  }
  return canon(String(value));
}

function columnIndex(cell: ExcelJS.Cell) {
  const col = cell.col;
  if (typeof col === "number") return col;
  let index = 0;
  for (const char of String(col).toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index;
}

function loadMatrix(worksheet: ExcelJS.Worksheet): Matrix {
  const rowCount = Math.min(worksheet.rowCount || worksheet.actualRowCount || 0, 400);
  const colCount = Math.min(Math.max(worksheet.columnCount || worksheet.actualColumnCount || 1, 1), 40);
  return {
    rowCount,
    colCount,
    own(row, col) {
      const cell = worksheet.getCell(row, col);
      const master = cell.master ?? cell;
      if (cell.isMerged && master.address !== cell.address) return "";
      return cellText(cell.value);
    },
    masterOf(row, col) {
      const cell = worksheet.getCell(row, col);
      const master = cell.master ?? cell;
      const text = cellText(master.value);
      if (!text) return null;
      return { row: Number(master.row), col: columnIndex(master), text };
    },
  };
}

function labelAt(matrix: Matrix, row: number) {
  const own = matrix.own(row, 1);
  if (own) return own;
  const master = matrix.masterOf(row, 1);
  if (master && master.col === 1) return master.text;
  return "";
}

function classify(label: string): Role {
  const text = canon(label).toLowerCase();
  if (!text) return "empty";
  if (parseTimeRange(label)) return "time";
  if (text === "timing" || text === "time") return "header";
  if (text === "faculty" || text === "teacher" || text === "professor" || text === "faculty name") return "faculty";
  if (/^(classroom no\.?|classroom|class room|room no\.?|room|venue|lab|laboratory)$/.test(text)) return "room";
  if (text === "status") return "status";
  if (/^(reason|remarks|remark|note|notes)$/.test(text)) return "reason";
  if (/^(semester|sem)\b/.test(text) || /^batch\b/.test(text) || parseDateLabel(label)) return "meta";
  return "other";
}

function valueAt(matrix: Matrix, row: number, col: number, allowTimeMerge: boolean) {
  const own = matrix.own(row, col);
  if (own) return own;
  const master = matrix.masterOf(row, col);
  if (!master?.text) return "";
  if (master.row === row) return master.text;
  if (!allowTimeMerge) return "";
  // A day-level merge such as Monday's OFF block is anchored on the first time row
  // and covers later slots. Faculty and room rows must not inherit that value.
  if (classify(labelAt(matrix, master.row)) === "time") return master.text;
  return "";
}

function issue(tabName: string, message: string, severity: "warning" | "error", row?: number, snippet?: string): ParseIssue {
  return { tabName, message, severity, row, snippet };
}

function readMeta(matrix: Matrix, headerRow: number, dateOrder: "DMY" | "MDY") {
  let collegeName: string | null = null;
  let semester: string | null = null;
  let batch: string | null = null;
  let date: string | null = null;
  let weekday: string | null = null;
  const notes: string[] = [];
  for (let row = 1; row < headerRow; row += 1) {
    const text = labelAt(matrix, row);
    if (!text) continue;
    const semesterMatch = text.match(/^(?:semester|sem)\s*[-–:]?\s*([0-9]+)/i);
    const batchMatch = text.match(/^batch\s*[-–:]?\s*(.+)/i);
    const parsedDate = parseDateLabel(text, dateOrder);
    if (semesterMatch) semester = semesterMatch[1] ?? semester;
    else if (batchMatch) batch = canon(batchMatch[1]);
    else if (parsedDate) {
      date = parsedDate.iso;
      weekday = parsedDate.computedWeekday;
      if (parsedDate.weekday !== parsedDate.computedWeekday) {
        notes.push(`Date ${text} says ${parsedDate.weekday}, which does not match ${parsedDate.computedWeekday}. The calendar date was used.`);
      }
    } else if (!collegeName && text.length > 3) collegeName = canon(text);
  }
  return { collegeName, semester, batch, date, weekday, notes };
}

function divisionsOn(matrix: Matrix, headerRow: number) {
  const divisions: Array<{ col: number; name: string }> = [];
  for (let col = 2; col <= matrix.colCount; col += 1) {
    let name = matrix.own(headerRow, col);
    const master = matrix.masterOf(headerRow, col);
    if (!name && master && master.row === headerRow) name = master.text;
    name = canon(name);
    if (!name || name.toLowerCase() === "timing") continue;
    if (master && master.col !== col && divisions.some((division) => division.col === master.col)) continue;
    divisions.push({ col, name });
  }
  return divisions;
}

function parseGrid(matrix: Matrix, tabName: string, dateOrder: "DMY" | "MDY"): ParsedTab | null {
  let headerRow = 0;
  for (let row = 1; row <= Math.min(matrix.rowCount, 40); row += 1) {
    if (canon(labelAt(matrix, row)).toLowerCase() === "timing") {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) return null;

  const issues: ParseIssue[] = [];
  const meta = readMeta(matrix, headerRow, dateOrder);
  for (const note of meta.notes) issues.push(issue(tabName, note, "warning"));
  const tabWeekday = weekdayFromName(tabName);
  const weekday = meta.weekday ?? tabWeekday;
  if (meta.weekday && tabWeekday && meta.weekday !== tabWeekday) {
    issues.push(issue(tabName, `Tab name “${tabName}” does not match the date's weekday ${meta.weekday}.`, "warning"));
  }

  const divisions = divisionsOn(matrix, headerRow);
  if (divisions.length === 0) {
    issues.push(issue(tabName, "The Timing header has no cohort or division columns, so no lectures were read from this tab.", "error", headerRow));
    return { name: tabName, collegeName: meta.collegeName, semester: meta.semester, batch: meta.batch, date: meta.date, weekday, slots: [], issues };
  }

  const slots: RawSlot[] = [];
  let row = headerRow + 1;
  while (row <= matrix.rowCount) {
    const master = matrix.masterOf(row, 1);
    if (master && master.col === 1 && master.row === headerRow) {
      row += 1;
      continue;
    }
    const label = labelAt(matrix, row);
    const role = classify(label);
    if (role === "empty" || role === "header" || role === "meta") {
      row += 1;
      continue;
    }
    if (role !== "time") {
      if (role === "other") {
        issues.push(issue(tabName, "This row is not a time slot, faculty row, or classroom row, so it was left out of the timetable.", "warning", row, label.slice(0, 180)));
      }
      row += 1;
      continue;
    }

    const range = parseTimeRange(label);
    const blockRow = row;
    const extras: Array<{ role: "faculty" | "room" | "status" | "reason"; row: number }> = [];
    let cursor = row + 1;
    while (cursor <= matrix.rowCount) {
      const continued = matrix.masterOf(cursor, 1);
      if (continued && continued.col === 1 && continued.row === blockRow) {
        cursor += 1;
        continue;
      }
      const nextLabel = labelAt(matrix, cursor);
      const nextRole = classify(nextLabel);
      if (nextRole === "time" || nextRole === "header" || nextRole === "empty" || nextRole === "meta") break;
      if (nextRole === "faculty" || nextRole === "room" || nextRole === "status" || nextRole === "reason") {
        extras.push({ role: nextRole, row: cursor });
        cursor += 1;
        continue;
      }
      issues.push(issue(tabName, "This row sits inside a time block but does not match a known field, so its text was not attached to a lecture.", "warning", cursor, nextLabel.slice(0, 180)));
      cursor += 1;
    }

    if (!range) {
      issues.push(issue(tabName, `Could not parse the time “${label}”.`, "warning", blockRow, label));
    }

    const facultyRow = extras.find((extra) => extra.role === "faculty")?.row;
    const roomRow = extras.find((extra) => extra.role === "room")?.row;
    const statusRow = extras.find((extra) => extra.role === "status")?.row;
    const reasonRow = extras.find((extra) => extra.role === "reason")?.row;

    for (const division of divisions) {
      const subject = valueAt(matrix, blockRow, division.col, true);
      const faculty = facultyRow ? valueAt(matrix, facultyRow, division.col, false) : "";
      const room = roomRow ? valueAt(matrix, roomRow, division.col, false) : "";
      const statusText = statusRow ? valueAt(matrix, statusRow, division.col, false) : "";
      const reasonText = reasonRow ? valueAt(matrix, reasonRow, division.col, false) : "";
      if (!canon(subject) && !canon(statusText)) continue;
      slots.push({
        tabName,
        course: null,
        semester: meta.semester,
        batch: meta.batch,
        division: division.name,
        date: meta.date,
        weekday,
        startMinutes: range?.start ?? null,
        endMinutes: range?.end ?? null,
        subject,
        faculty,
        room,
        statusText,
        reasonText,
        row: blockRow,
      });
    }
    row = cursor;
  }

  return { name: tabName, collegeName: meta.collegeName, semester: meta.semester, batch: meta.batch, date: meta.date, weekday, slots, issues };
}

function headerMap(matrix: Matrix, row: number) {
  const map = new Map<string, number>();
  for (let col = 1; col <= matrix.colCount; col += 1) {
    const text = canon(matrix.own(row, col) || matrix.masterOf(row, col)?.text || "").toLowerCase();
    if (!text) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(text) && !map.has(field)) map.set(field, col);
    }
  }
  return map;
}

function looksLikeRowHeader(map: Map<string, number>) {
  const hasSubject = map.has("subject");
  const hasWhen = map.has("time") || map.has("start");
  const signals = ["subject", "faculty", "room", "time", "start", "status"].filter((field) => map.has(field)).length;
  return hasSubject && hasWhen && signals >= 2;
}

function parseRowTable(matrix: Matrix, tabName: string, dateOrder: "DMY" | "MDY"): ParsedTab | null {
  let headerRow = 0;
  let columns = new Map<string, number>();
  for (let row = 1; row <= Math.min(matrix.rowCount, 40); row += 1) {
    const map = headerMap(matrix, row);
    if (looksLikeRowHeader(map)) {
      headerRow = row;
      columns = map;
      break;
    }
  }
  if (!headerRow) return null;

  const issues: ParseIssue[] = [];
  const meta = readMeta(matrix, headerRow, dateOrder);
  const slots: RawSlot[] = [];
  const tabWeekday = weekdayFromName(tabName);

  for (let row = headerRow + 1; row <= matrix.rowCount; row += 1) {
    const read = (field: string) => {
      const col = columns.get(field);
      if (!col) return "";
      return valueAt(matrix, row, col, false);
    };
    const values = ["subject", "faculty", "room", "status", "time", "start", "date", "division"].map(read);
    if (values.every((value) => !canon(value))) continue;

    const subject = read("subject");
    const statusText = read("status");
    const timeText = read("time");
    const startText = read("start");
    const endText = read("end");
    const range = timeText ? parseTimeRange(timeText) : null;
    const start = range?.start ?? (startText ? parseTimeTokenSafe(startText) : null);
    const end = range?.end ?? (endText ? parseTimeTokenSafe(endText) : null);
    if ((timeText || startText) && (start === null || end === null)) {
      issues.push(issue(tabName, "This lecture row has a time that could not be parsed. It is still listed.", "warning", row, timeText || `${startText} ${endText}`));
    } else if (start === null || end === null) {
      issues.push(issue(tabName, "This lecture row has no usable time. It is still listed so the information is not dropped.", "warning", row, subject || statusText));
    }

    const dateText = read("date");
    const parsedDate = dateText ? parseDateLabel(dateText, dateOrder) : null;
    const dayText = read("day");
    const division = canon(read("division")) || tabName;
    slots.push({
      tabName,
      course: canon(read("course")) || null,
      semester: canon(read("semester")) || meta.semester,
      batch: meta.batch,
      division,
      date: parsedDate?.iso ?? meta.date,
      weekday: parsedDate?.computedWeekday ?? weekdayFromName(dayText) ?? meta.weekday ?? tabWeekday,
      startMinutes: start,
      endMinutes: end,
      subject,
      faculty: read("faculty"),
      room: read("room"),
      statusText,
      reasonText: read("reason"),
      row,
    });
  }

  return {
    name: tabName,
    collegeName: meta.collegeName,
    semester: meta.semester,
    batch: meta.batch,
    date: meta.date,
    weekday: meta.weekday ?? tabWeekday,
    slots,
    issues,
  };
}

function parseTimeTokenSafe(token: string) {
  if (!canon(token)) return null;
  if (!/(AM|PM)/i.test(token) && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(canon(token))) return null;
  return parseTimeToken(token);
}

async function workbookFrom(source: Buffer | ExcelJS.Workbook) {
  if (!Buffer.isBuffer(source)) return source;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source as unknown as ExcelJS.Buffer);
  return workbook;
}

export async function parseTimetableSource(source: Buffer | ExcelJS.Workbook, options: ParseOptions = {}): Promise<ParsedWorkbook> {
  const dateOrder = options.dateOrder ?? "DMY";
  const workbook = await workbookFrom(source);
  const tabs: ParsedTab[] = [];
  workbook.eachSheet((worksheet) => {
    const tabName = canon(worksheet.name) || "Untitled";
    const matrix = loadMatrix(worksheet);
    if (matrix.rowCount === 0) {
      tabs.push({
        name: tabName,
        collegeName: null,
        semester: null,
        batch: null,
        date: null,
        weekday: weekdayFromName(tabName),
        slots: [],
        issues: [issue(tabName, "This tab is empty.", "warning")],
      });
      return;
    }
    const grid = parseGrid(matrix, tabName, dateOrder);
    const parsed = grid ?? parseRowTable(matrix, tabName, dateOrder);
    if (!parsed) {
      tabs.push({
        name: tabName,
        collegeName: null,
        semester: null,
        batch: null,
        date: null,
        weekday: weekdayFromName(tabName),
        slots: [],
        issues: [issue(tabName, "This tab does not match a cohort grid or a lecture table. No rows were imported from it.", "error")],
      });
      return;
    }
    tabs.push(parsed);
  });

  const issues = tabs.flatMap((tab) => tab.issues);
  return {
    tabs,
    issues,
    collegeName: tabs.find((tab) => tab.collegeName)?.collegeName ?? null,
    semester: tabs.find((tab) => tab.semester)?.semester ?? null,
    batch: tabs.find((tab) => tab.batch)?.batch ?? null,
  };
}
