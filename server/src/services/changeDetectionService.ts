import { createHash } from "node:crypto";
import type { PreviousValues } from "../../../shared/types.ts";
import type { ChangeDraft, Highlight, LectureCore, NormalizedLecture, StoredLecture } from "../model.ts";
import { canon, sameText } from "../time.ts";

export interface CompareOptions {
  now: Date;
  previousTabs: string[];
  nextTabs: string[];
  bootstrapped: boolean;
}

function coreOf(lecture: NormalizedLecture): LectureCore {
  return {
    subject: canon(lecture.subject),
    faculty: canon(lecture.faculty),
    room: canon(lecture.room),
    startMinutes: lecture.startMinutes,
    endMinutes: lecture.endMinutes,
    startLabel: lecture.startLabel,
    endLabel: lecture.endLabel,
    sourceStatus: lecture.sourceStatus,
    reason: canon(lecture.reason ?? ""),
    kind: lecture.kind,
    explicitMark: lecture.explicitMark,
  };
}

function coresEqual(a: LectureCore, b: LectureCore) {
  return (
    sameText(a.subject, b.subject) &&
    sameText(a.faculty, b.faculty) &&
    sameText(a.room, b.room) &&
    a.startMinutes === b.startMinutes &&
    a.endMinutes === b.endMinutes &&
    a.sourceStatus === b.sourceStatus &&
    sameText(a.reason, b.reason) &&
    a.kind === b.kind &&
    a.explicitMark === b.explicitMark
  );
}

function previousOf(core: LectureCore, fields: string[]): PreviousValues {
  const previous: PreviousValues = {};
  if (fields.includes("subject") || fields.includes("status")) previous.subject = core.subject;
  if (fields.includes("faculty")) previous.faculty = core.faculty;
  if (fields.includes("room")) previous.room = core.room;
  if (fields.includes("time") || fields.includes("status")) {
    previous.startLabel = core.startLabel;
    previous.endLabel = core.endLabel;
  }
  if (fields.includes("status")) previous.status = core.sourceStatus;
  return previous;
}

function nextOf(lecture: NormalizedLecture, fields: string[]): PreviousValues {
  const next: PreviousValues = {};
  if (fields.includes("subject") || fields.includes("status")) next.subject = lecture.subject;
  if (fields.includes("faculty")) next.faculty = lecture.faculty;
  if (fields.includes("room")) next.room = lecture.room;
  if (fields.includes("time") || fields.includes("status")) {
    next.startLabel = lecture.startLabel;
    next.endLabel = lecture.endLabel;
  }
  if (fields.includes("status")) next.status = lecture.sourceStatus;
  return next;
}

function dedupeKey(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function rangeLabel(lecture: { startLabel: string; endLabel: string }) {
  return `${lecture.startLabel}–${lecture.endLabel}`;
}

function draft(input: Omit<ChangeDraft, "dedupeKey"> & { dedupeParts: unknown[] }): ChangeDraft {
  const { dedupeParts, ...rest } = input;
  return { ...rest, dedupeKey: dedupeKey(dedupeParts) };
}

function contextOf(lecture: NormalizedLecture | null, tabName?: string) {
  return {
    lectureId: lecture?.id ?? null,
    division: lecture?.division ?? null,
    course: lecture?.course ?? null,
    semester: lecture?.semester ?? null,
    tabName: lecture?.tabName ?? tabName ?? null,
    date: lecture?.date ?? null,
    weekday: lecture?.weekday ?? null,
  };
}

function changedFields(prev: LectureCore, next: NormalizedLecture) {
  const fields: string[] = [];
  if (!sameText(prev.subject, next.subject)) fields.push("subject");
  if (!sameText(prev.faculty, next.faculty)) fields.push("faculty");
  if (!sameText(prev.room, next.room)) fields.push("room");
  if (prev.startMinutes !== next.startMinutes || prev.endMinutes !== next.endMinutes) fields.push("time");
  if (prev.sourceStatus !== next.sourceStatus || prev.kind !== next.kind) fields.push("status");
  if (!sameText(prev.reason, next.reason ?? "")) fields.push("reason");
  if (prev.explicitMark !== next.explicitMark) fields.push("status");
  return [...new Set(fields)];
}

function describeFieldChange(prev: LectureCore, next: NormalizedLecture, fields: string[]) {
  const subject = next.kind === "off" ? prev.subject : next.subject;
  if (fields.length === 1 && fields[0] === "room") {
    return `${next.subject} moved from ${prev.room || "an unassigned room"} to ${next.room || "an unassigned room"}.`;
  }
  if (fields.length === 1 && fields[0] === "faculty") {
    return `${next.subject} faculty changed from ${prev.faculty || "unassigned"} to ${next.faculty || "unassigned"}.`;
  }
  if (fields.length === 1 && fields[0] === "subject") {
    return `${prev.subject} was replaced by ${next.subject} at ${rangeLabel(next)}.`;
  }
  if (fields.length === 1 && fields[0] === "time") {
    return `${subject} moved from ${rangeLabel(prev)} to ${rangeLabel(next)}.`;
  }
  const bits: string[] = [];
  if (fields.includes("subject")) bits.push(`subject is now ${next.subject} (was ${prev.subject})`);
  if (fields.includes("time")) bits.push(`time is now ${rangeLabel(next)} (was ${rangeLabel(prev)})`);
  if (fields.includes("room")) bits.push(`room is now ${next.room || "unassigned"} (was ${prev.room || "unassigned"})`);
  if (fields.includes("faculty")) bits.push(`faculty is now ${next.faculty || "unassigned"} (was ${prev.faculty || "unassigned"})`);
  if (fields.includes("reason")) bits.push("the note was updated");
  return `${next.subject} was updated: ${bits.join("; ")}.`;
}

function canPair(removed: NormalizedLecture, added: NormalizedLecture) {
  if (removed.tabName !== added.tabName || removed.date !== added.date || removed.division !== added.division) return false;
  if (removed.kind === "break" || added.kind === "break") return false;
  if (removed.sourceStatus === "cancelled" || added.sourceStatus === "cancelled") return false;
  if (!sameText(removed.subject, added.subject)) return false;
  const facultyRemoved = canon(removed.faculty).toLowerCase();
  const facultyAdded = canon(added.faculty).toLowerCase();
  const roomRemoved = canon(removed.room).toLowerCase();
  const roomAdded = canon(added.room).toLowerCase();
  const facultyDiffers = Boolean(facultyRemoved && facultyAdded && facultyRemoved !== facultyAdded);
  const roomDiffers = Boolean(roomRemoved && roomAdded && roomRemoved !== roomAdded);
  // Same subject with a different faculty and room is a different session, not a move.
  if (facultyDiffers && roomDiffers) return false;
  return true;
}

function pairMoves(removed: StoredLecture[], added: NormalizedLecture[]) {
  const pairs: Array<{ removed: StoredLecture; added: NormalizedLecture }> = [];
  const usedRemoved = new Set<string>();
  const usedAdded = new Set<string>();
  const groupKey = (lecture: NormalizedLecture) =>
    [lecture.tabName, lecture.date ?? "", lecture.division, canon(lecture.subject).toLowerCase()].join("|");
  const keys = new Set([...removed.map(groupKey), ...added.map(groupKey)]);
  for (const key of keys) {
    const groupRemoved = removed.filter((lecture) => !usedRemoved.has(lecture.id) && groupKey(lecture) === key && added.some((candidate) => canPair(lecture, candidate)));
    const groupAdded = added.filter((lecture) => !usedAdded.has(lecture.slotKey) && groupKey(lecture) === key && removed.some((candidate) => canPair(candidate, lecture)));
    if (groupRemoved.length === 0 || groupAdded.length === 0) continue;
    const allCross = groupRemoved.every((left) => groupAdded.every((right) => canPair(left, right)));
    if (allCross) {
      const orderedRemoved = [...groupRemoved].sort((a, b) => a.startMinutes - b.startMinutes);
      const orderedAdded = [...groupAdded].sort((a, b) => a.startMinutes - b.startMinutes);
      const count = Math.min(orderedRemoved.length, orderedAdded.length);
      for (let index = 0; index < count; index += 1) {
        const left = orderedRemoved[index]!;
        const right = orderedAdded[index]!;
        usedRemoved.add(left.id);
        usedAdded.add(right.slotKey);
        pairs.push({ removed: left, added: right });
      }
      continue;
    }
    const pool = [...groupAdded];
    for (const left of [...groupRemoved].sort((a, b) => a.startMinutes - b.startMinutes)) {
      const matchIndex = pool.findIndex((right) => canPair(left, right));
      if (matchIndex === -1) continue;
      const right = pool.splice(matchIndex, 1)[0]!;
      usedRemoved.add(left.id);
      usedAdded.add(right.slotKey);
      pairs.push({ removed: left, added: right });
    }
  }
  return { pairs, usedRemoved, usedAdded };
}

function highlightFor(displayStatus: Highlight["displayStatus"], type: string, summary: string, detectedAt: string, previous: PreviousValues, reason: string | null): Highlight {
  return { displayStatus, type, summary, detectedAt, previous, reason };
}

export function initialSnapshot(lectures: NormalizedLecture[]): StoredLecture[] {
  return lectures.map((lecture) => ({
    ...lecture,
    anchor: coreOf(lecture),
    highlight: null,
  }));
}

export function compareSnapshots(previous: StoredLecture[], next: NormalizedLecture[], options: CompareOptions) {
  const detectedAt = options.now.toISOString();
  const events: ChangeDraft[] = [];
  const output: StoredLecture[] = [];
  const previousBySlot = new Map(previous.map((lecture) => [lecture.slotKey, lecture]));
  const matched = new Set<string>();
  const unmatchedNext: NormalizedLecture[] = [];

  for (const lecture of next) {
    const prior = previousBySlot.get(lecture.slotKey);
    if (!prior) {
      unmatchedNext.push(lecture);
      continue;
    }
    matched.add(prior.id);
    const priorCore = coreOf(prior);
    const nextCore = coreOf(lecture);
    if (coresEqual(priorCore, nextCore)) {
      output.push({
        ...lecture,
        id: prior.id,
        anchor: prior.anchor,
        highlight: prior.highlight,
      });
      continue;
    }

    if (coresEqual(nextCore, prior.anchor)) {
      const restored = prior.sourceStatus === "cancelled" && lecture.sourceStatus === "scheduled";
      const summary = restored
        ? `${lecture.subject} is back on the timetable.`
        : `${lecture.subject} change was reverted.`;
      events.push(draft({
        ...contextOf({ ...lecture, id: prior.id }),
        detectedAt,
        type: restored ? "restored" : "reverted",
        summary,
        previous: previousOf(priorCore, ["subject", "faculty", "room", "time", "status"]),
        next: nextOf(lecture, ["subject", "faculty", "room", "time", "status"]),
        fields: changedFields(priorCore, lecture),
        dedupeParts: [prior.id, restored ? "restored" : "reverted", priorCore, nextCore],
      }));
      output.push({ ...lecture, id: prior.id, anchor: nextCore, highlight: null });
      continue;
    }

    if (prior.kind !== "break" && lecture.kind === "break") {
      const summary = `${prior.subject} at ${rangeLabel(prior)} is no longer listed. The slot is now a break, and it was not marked cancelled.`;
      events.push(draft({
        ...contextOf(prior),
        detectedAt,
        type: "removed",
        summary,
        previous: previousOf(priorCore, ["subject", "time", "room", "faculty"]),
        next: null,
        fields: ["status"],
        dedupeParts: [prior.id, "removed", priorCore],
      }));
      output.push({ ...lecture, id: lecture.slotKey, anchor: nextCore, highlight: null });
      continue;
    }

    if (prior.kind === "break" && lecture.kind !== "break") {
      const summary = `${lecture.subject} added at ${rangeLabel(lecture)}${lecture.room ? ` in ${lecture.room}` : ""}.`;
      events.push(draft({
        ...contextOf({ ...lecture, id: prior.id }),
        detectedAt,
        type: "added",
        summary,
        previous: null,
        next: nextOf(lecture, ["subject", "time", "room", "faculty"]),
        fields: ["subject"],
        dedupeParts: [prior.id, "added", nextCore],
      }));
      output.push({ ...lecture, id: prior.id, anchor: nextCore, highlight: null });
      continue;
    }

    const fields = changedFields(priorCore, lecture);
    const becameCancelled = lecture.sourceStatus === "cancelled" && prior.sourceStatus !== "cancelled";
    const leftCancelled = prior.sourceStatus === "cancelled" && lecture.sourceStatus !== "cancelled";
    let type = "details_changed";
    let displayStatus: Highlight["displayStatus"] = "changed";
    let summary = describeFieldChange(priorCore, lecture, fields);

    if (becameCancelled) {
      type = "cancelled";
      displayStatus = "cancelled";
      summary = lecture.kind === "off"
        ? `${prior.kind === "off" ? rangeLabel(prior) : prior.subject} is marked OFF.`
        : `${prior.subject} lecture cancelled.`;
    } else if (leftCancelled && !sameText(prior.subject, lecture.subject) && !/^off$/i.test(prior.subject)) {
      type = "replaced";
      displayStatus = "changed";
      summary = `${lecture.subject} replaces the cancelled ${prior.subject} lecture.`;
    } else if (leftCancelled) {
      type = "restored";
      displayStatus = "changed";
      summary = /^off$/i.test(prior.subject)
        ? `${rangeLabel(lecture)} is no longer OFF. ${lecture.subject} is scheduled.`
        : `${lecture.subject} is back on the timetable.`;
    } else if (lecture.explicitMark === "rescheduled" || fields.includes("time")) {
      type = "rescheduled";
      displayStatus = "rescheduled";
      summary = `${lecture.subject} moved from ${rangeLabel(prior)} to ${rangeLabel(lecture)}.`;
    } else if (fields.length === 1 && fields[0] === "room") type = "room_change";
    else if (fields.length === 1 && fields[0] === "faculty") type = "faculty_change";
    else if (fields.length === 1 && fields[0] === "subject") type = "subject_change";

    const shownFields = becameCancelled ? ["subject", "time", "room", "faculty", "status"] : fields;
    events.push(draft({
      ...contextOf({ ...lecture, id: prior.id }),
      detectedAt,
      type,
      summary,
      previous: previousOf(priorCore, shownFields),
      next: nextOf(lecture, shownFields),
      fields,
      dedupeParts: [prior.id, type, priorCore, nextCore],
    }));
    output.push({
      ...lecture,
      id: prior.id,
      anchor: priorCore,
      highlight: highlightFor(displayStatus, type, summary, detectedAt, previousOf(priorCore, shownFields), lecture.reason),
    });
  }

  const unmatchedPrevious = previous.filter((lecture) => !matched.has(lecture.id));
  const { pairs, usedRemoved, usedAdded } = pairMoves(
    unmatchedPrevious.filter((lecture) => lecture.kind !== "break"),
    unmatchedNext.filter((lecture) => lecture.kind !== "break"),
  );

  for (const pair of pairs) {
    const removedCore = coreOf(pair.removed);
    const addedCore = coreOf(pair.added);
    const fields = changedFields(removedCore, pair.added);
    if (!fields.includes("time")) fields.push("time");
    if (coresEqual(addedCore, pair.removed.anchor)) {
      const summary = `${pair.added.subject} change was reverted.`;
      events.push(draft({
        ...contextOf({ ...pair.added, id: pair.removed.id }),
        detectedAt,
        type: "reverted",
        summary,
        previous: previousOf(removedCore, ["time", "room", "faculty", "subject"]),
        next: nextOf(pair.added, ["time", "room", "faculty", "subject"]),
        fields,
        dedupeParts: [pair.removed.id, "reverted", removedCore, addedCore],
      }));
      output.push({ ...pair.added, id: pair.removed.id, anchor: addedCore, highlight: null });
      continue;
    }
    const summaryParts = [`${pair.added.subject} moved from ${rangeLabel(pair.removed)} to ${rangeLabel(pair.added)}.`];
    if (!sameText(pair.removed.room, pair.added.room)) {
      summaryParts.push(`Room is now ${pair.added.room || "unassigned"} (was ${pair.removed.room || "unassigned"}).`);
    }
    const summary = summaryParts.join(" ");
    events.push(draft({
      ...contextOf({ ...pair.added, id: pair.removed.id }),
      detectedAt,
      type: "rescheduled",
      summary,
      previous: previousOf(removedCore, fields),
      next: nextOf(pair.added, fields),
      fields,
      dedupeParts: [pair.removed.id, "rescheduled", removedCore, addedCore],
    }));
    output.push({
      ...pair.added,
      id: pair.removed.id,
      anchor: removedCore,
      highlight: highlightFor("rescheduled", "rescheduled", summary, detectedAt, previousOf(removedCore, fields), pair.added.reason),
    });
  }

  for (const lecture of unmatchedNext) {
    if (usedAdded.has(lecture.slotKey)) continue;
    if (lecture.kind === "break") {
      output.push({ ...lecture, anchor: coreOf(lecture), highlight: null });
      continue;
    }
    const summary = `${lecture.subject} added at ${rangeLabel(lecture)}${lecture.room ? ` in ${lecture.room}` : ""}.`;
    events.push(draft({
      ...contextOf(lecture),
      detectedAt,
      type: "added",
      summary,
      previous: null,
      next: nextOf(lecture, ["subject", "time", "room", "faculty"]),
      fields: ["subject"],
      dedupeParts: [lecture.slotKey, "added", coreOf(lecture)],
    }));
    output.push({ ...lecture, anchor: coreOf(lecture), highlight: null });
  }

  for (const lecture of unmatchedPrevious) {
    if (usedRemoved.has(lecture.id) || lecture.kind === "break") continue;
    const dayRemains = next.some((item) => item.tabName === lecture.tabName && item.date === lecture.date && item.kind !== "break");
    // Dropping one class from a day that is still published is a cancellation. It stays on the grid in red.
    if (dayRemains && lecture.kind === "lecture") {
      const summary = `${lecture.subject} lecture cancelled.`;
      const fields = ["subject", "time", "room", "faculty", "status"];
      const already = lecture.sourceStatus === "cancelled";
      if (!already) {
        events.push(draft({
          ...contextOf(lecture),
          detectedAt,
          type: "cancelled",
          summary,
          previous: previousOf(coreOf(lecture), fields),
          next: null,
          fields: ["status"],
          dedupeParts: [lecture.id, "cancelled", coreOf(lecture)],
        }));
      }
      output.push({
        ...lecture,
        sourceStatus: "cancelled",
        explicitMark: "cancelled",
        reason: lecture.reason || "Removed from the official timetable.",
        anchor: lecture.anchor,
        highlight: already && lecture.highlight?.displayStatus === "cancelled"
          ? lecture.highlight
          : highlightFor("cancelled", "cancelled", summary, detectedAt, previousOf(coreOf(lecture), fields), lecture.reason),
      });
      continue;
    }
    // The day itself is gone, so this is not marked as a cancelled class.
    const summary = `${lecture.subject} at ${rangeLabel(lecture)} is no longer listed. It was not marked cancelled.`;
    events.push(draft({
      ...contextOf(lecture),
      detectedAt,
      type: "removed",
      summary,
      previous: previousOf(coreOf(lecture), ["subject", "time", "room", "faculty"]),
      next: null,
      fields: ["subject"],
      dedupeParts: [lecture.id, "removed", coreOf(lecture)],
    }));
  }

  if (options.bootstrapped) {
    const before = new Set(options.previousTabs);
    const after = new Set(options.nextTabs);
    for (const tab of options.nextTabs) {
      if (before.has(tab)) continue;
      const count = next.filter((lecture) => lecture.tabName === tab && lecture.kind === "lecture").length;
      events.push(draft({
        ...contextOf(null, tab),
        detectedAt,
        type: "tab_added",
        summary: count > 0 ? `Tab “${tab}” was added with ${count} lecture${count === 1 ? "" : "s"}.` : `Tab “${tab}” was added.`,
        previous: null,
        next: null,
        fields: ["tab"],
        dedupeParts: ["tab_added", tab, next.filter((lecture) => lecture.tabName === tab).map((lecture) => lecture.slotKey).sort()],
      }));
    }
    for (const tab of options.previousTabs) {
      if (after.has(tab)) continue;
      events.push(draft({
        ...contextOf(null, tab),
        detectedAt,
        type: "tab_removed",
        summary: `Tab “${tab}” is no longer in the spreadsheet. Its classes were removed from the portal and were not marked cancelled.`,
        previous: null,
        next: null,
        fields: ["tab"],
        dedupeParts: ["tab_removed", tab],
      }));
    }
  }

  return { lectures: output, events };
}
