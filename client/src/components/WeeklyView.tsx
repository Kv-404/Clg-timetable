import type { PublicLecture } from "@shared/types";
import { cohortName } from "@shared/cohort";
import { useEffect, useRef } from "react";
import { StatusBadge, badgeText } from "@/components/StatusBadge";
import { TodayView } from "@/components/TodayView";
import { useColors } from "@/lib/colorState";
import { ClockLabel } from "@/components/ClockLabel";
import { formatCalendarDate } from "@/lib/time";
import { isFullOff, slotPhase } from "@/lib/view";

const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function WeeklyView({
  lectures,
  showDivision,
  today = "",
  minutes = -1,
}: {
  lectures: PublicLecture[];
  showDivision: boolean;
  today?: string;
  minutes?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const days = [...new Set(lectures.map((lecture) => lecture.date).filter((date): date is string => Boolean(date)))].sort((a, b) => a.localeCompare(b));
  const dayKey = days.join("|");
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    function revealToday() {
      const column = root?.querySelector("th.cal-today");
      if (!(column instanceof HTMLElement) || !root) return;
      const time = root.querySelector("thead th");
      const gutter = time instanceof HTMLElement ? time.getBoundingClientRect().width : 0;
      const rootBox = root.getBoundingClientRect();
      const columnBox = column.getBoundingClientRect();
      const previous = column.previousElementSibling;
      const previousBox = previous instanceof HTMLElement ? previous.getBoundingClientRect() : null;
      const edge = rootBox.left + gutter;
      const previousClipped = Boolean(previousBox && previousBox.left < edge - 1 && previousBox.right > edge + 1);
      const todayClipped = columnBox.left < edge - 1 || columnBox.right > rootBox.right - 4;
      if (!previousClipped && !todayClipped) return;
      root.scrollLeft += columnBox.left - edge;
    }
    revealToday();
    window.addEventListener("resize", revealToday);
    return () => window.removeEventListener("resize", revealToday);
  }, [today, dayKey]);
  if (days.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">No dated lectures match these filters.</p>;
  }
  const forDay = (date: string) => lectures.filter((lecture) => lecture.date === date);
  const offDay = (date: string) => isFullOff(forDay(date));
  // Full-day OFF cards span the first slot through the last. Their start must not label a normal class row.
  const starts = [...new Set(lectures.filter((lecture) => lecture.kind !== "off").map((lecture) => lecture.startMinutes))]
    .filter((minute) => minute >= 0)
    .sort((a, b) => a - b);
  return (
    <>
    <div className="space-y-8 sm:hidden">
      {days.map((date) => (
        <div key={date}>
          <TodayView lectures={forDay(date)} today={today} minutes={minutes} showDivision={showDivision} />
        </div>
      ))}
    </div>
    <div ref={scroller} className="rise hidden overflow-x-auto border-y border-border sm:block">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-background px-3 py-3 align-bottom font-mono text-[11px] font-medium tracking-[0.22em] whitespace-nowrap text-muted-foreground uppercase">Time</th>
            {days.map((date) => {
              const dayLectures = forDay(date);
              const weekday = dayLectures[0]?.weekday ?? "";
              const off = offDay(date);
              return (
                <th key={date} className={`min-w-40 px-3 py-3 align-bottom font-medium ${date === today ? "cal-today" : ""}`}>
                  <span className="block">{weekday || dayOrder.find((day) => dayLectures.some((lecture) => lecture.weekday === day))}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{formatCalendarDate(date)}</span>
                  {off && (
                    <>
                      <span className="mt-1 inline-flex">
                        <StatusBadge status="cancelled" label="OFF" />
                      </span>
                      <span className="mt-1 block text-xs font-normal text-danger">{spanOf(dayLectures)}</span>
                    </>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {starts.length === 0 ? (
            <tr className="align-top">
              <th className="sticky left-0 bg-background px-3 py-3 font-mono text-xs font-medium whitespace-nowrap text-muted-foreground">All day</th>
              {days.map((date) => (
                <td key={date} className="px-3 py-3 text-sm text-danger">
                  OFF
                  <span className="mt-1 block text-xs">{spanOf(forDay(date))}</span>
                </td>
              ))}
            </tr>
          ) : (
            starts.map((start) => {
              const sample = lectures.find((lecture) => lecture.startMinutes === start && lecture.kind !== "off");
              const rowLectures = lectures.filter((lecture) => lecture.startMinutes === start && lecture.kind !== "off");
              const breakOnly = rowLectures.length > 0 && rowLectures.every((lecture) => lecture.kind === "break");
              if (breakOnly) {
                return (
                  <tr key={start} className="border-b border-border bg-muted/60">
                    <td className="sticky left-0 z-10 bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{sample?.startLabel}</td>
                    {segments(days, offDay).map((segment) =>
                      segment.off ? (
                        segment.dates.map((date) => (
                          <td key={date} className="px-3 py-2 text-center text-xs text-danger">
                            OFF
                          </td>
                        ))
                      ) : (
                        <td
                          key={segment.dates.join("-")}
                          colSpan={segment.dates.length}
                          className="px-3 py-2 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                        >
                          {sample?.subject} · {sample?.startLabel} – {sample?.endLabel}
                        </td>
                      ),
                    )}
                  </tr>
                );
              }
              return (
                <tr key={start} className="border-b border-border align-top">
                  <th className="sticky left-0 z-10 bg-background px-3 py-3 font-mono text-xs font-medium whitespace-nowrap text-muted-foreground">
                    <ClockLabel label={sample?.startLabel ?? ""} />
                    <span className="mt-1 block font-normal">
                      <ClockLabel label={sample?.endLabel ?? ""} />
                    </span>
                  </th>
                  {days.map((date) => {
                    if (offDay(date)) {
                      return (
                        <td key={date} className={`px-3 py-3 text-xs text-danger ${date === today ? "cal-today" : ""}`}>
                          OFF
                        </td>
                      );
                    }
                    const cell = forDay(date).filter((lecture) => lecture.startMinutes === start && lecture.kind !== "break");
                    return (
                      <td key={date} className={`px-2 py-2 ${date === today ? "cal-today" : ""}`}>
                        <div className="space-y-2">
                          {cell.map((lecture) => (
                            <Cell key={lecture.id} lecture={lecture} showDivision={showDivision} now={isLive(lecture, today, minutes)} />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}

function spanOf(items: PublicLecture[]) {
  const slots = items.filter((lecture) => lecture.kind !== "break").sort((a, b) => a.startMinutes - b.startMinutes);
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (!first || !last) return "";
  return `${first.startLabel} – ${last.endLabel}`;
}

function segments(days: string[], offDay: (date: string) => boolean) {
  const groups: { off: boolean; dates: string[] }[] = [];
  for (const date of days) {
    const off = offDay(date);
    const last = groups[groups.length - 1];
    if (last && last.off === off) last.dates.push(date);
    else groups.push({ off, dates: [date] });
  }
  return groups;
}

function isLive(lecture: PublicLecture, today: string, minutes: number) {
  return lecture.kind === "lecture" && lecture.displayStatus !== "cancelled" && slotPhase(lecture, today, minutes) === "now";
}

function Cell({ lecture, showDivision, now }: { lecture: PublicLecture; showDivision: boolean; now: boolean }) {
  const { classNameFor } = useColors();
  const marked = lecture.displayStatus === "cancelled" || lecture.displayStatus === "changed" || lecture.displayStatus === "rescheduled";
  const previousTime = lecture.previous?.startLabel && lecture.previous.startLabel !== lecture.startLabel;
  return (
    <div className={`${classNameFor(lecture.subject, lecture.displayStatus)} ${now ? "is-now" : ""}`} data-testid="lecture-card" data-live={now ? "true" : undefined}>
      {marked && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={lecture.displayStatus} label={badgeText(lecture.displayStatus, lecture.subject)} />
        </div>
      )}
      <p className={`font-medium ${lecture.displayStatus === "cancelled" ? "text-danger line-through" : ""}`}>{lecture.subject}</p>
      {showDivision && <p className="text-xs text-muted-foreground">{cohortName(lecture.division)}</p>}
      {previousTime && (
        <p className="text-xs">
          <span className="line-through">{lecture.previous?.startLabel}</span> {lecture.startLabel}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{lecture.room || lecture.faculty || ""}</p>
      {lecture.previous?.room && lecture.previous.room !== lecture.room && <p className="text-xs">Was {lecture.previous.room}</p>}
    </div>
  );
}
