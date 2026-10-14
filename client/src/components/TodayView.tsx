import type { PublicLecture } from "@shared/types";
import { cohortName } from "@shared/cohort";
import { ClassMeta } from "@/components/ClassMeta";
import { StatusBadge, badgeText } from "@/components/StatusBadge";
import { ClockLabel } from "@/components/ClockLabel";
import { formatCalendarDate, formatCompactRange, formatLongDate } from "@/lib/time";
import { useColors } from "@/lib/colorState";
import { collapseFullOffDays, slotPhase } from "@/lib/view";

export function TodayView({
  lectures,
  today,
  minutes,
  showDivision,
  note,
}: {
  lectures: PublicLecture[];
  today: string;
  minutes: number;
  showDivision: boolean;
  note?: string;
}) {
  const { classNameFor } = useColors();
  const visible = collapseFullOffDays(lectures);
  const dated = visible.filter((lecture) => lecture.date);
  const date = dated[0]?.date ?? today;
  if (visible.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">Nothing matches this day.</p>;
  }
  const todayHeading = date === today;
  return (
    <div>
      <h2 className={todayHeading ? "text-foreground" : "text-muted-foreground"}>
        <span className="font-sans text-sm font-semibold tracking-normal sm:hidden">
          {formatCalendarDate(date)}
          {todayHeading && <span className="ml-2 text-xs font-medium text-muted-foreground">Today</span>}
        </span>
        <span className="hidden font-mono text-[11px] font-medium tracking-[0.22em] uppercase sm:inline">{formatLongDate(date)}</span>
      </h2>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <ol className="mt-2 flex flex-col gap-1.5 sm:mt-4 sm:grid sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-0 sm:border-t sm:border-border">
        {timeline(visible).map((item, index) => {
          if (item.kind === "break") {
            return (
              <li key={item.key} className="rise-row py-1 text-xs text-muted-foreground sm:col-span-2 sm:border-b sm:border-border sm:py-3 sm:text-sm" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
                <span className="sm:hidden">{item.lecture.subject.replace(/ break$/i, "")} · {formatCompactRange(item.lecture.startLabel, item.lecture.endLabel)}</span>
                <span className="hidden sm:inline">
                  {item.lecture.subject} · {item.lecture.startLabel} – {item.lecture.endLabel}
                </span>
              </li>
            );
          }
          const live = isLive(item.lecture, today, minutes);
          const off = item.lecture.subject === "OFF";
          const allDayOff = off && item.lecture.id.endsWith("-off");
          const showStatus = !off && (item.lecture.displayStatus === "cancelled" || item.lecture.displayStatus === "rescheduled");
          return (
            <li
              key={item.lecture.id}
              className="rise-row sm:col-span-2 sm:grid sm:grid-cols-subgrid sm:items-start sm:border-b sm:border-border sm:py-2.5"
              style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
            >
              <p className={`hidden items-baseline gap-1 font-mono text-xs whitespace-nowrap sm:flex sm:pt-1.5 ${live ? "text-foreground" : "text-muted-foreground"} ${allDayOff ? "text-danger" : ""}`}>
                {!allDayOff && (
                  <>
                    <ClockLabel label={item.lecture.startLabel} />
                    <span aria-hidden="true">–</span>
                    <ClockLabel label={item.lecture.endLabel} />
                  </>
                )}
              </p>
              <div
                data-testid="lecture-card"
                data-live={live ? "true" : undefined}
                className={`min-w-0 ${classNameFor(item.lecture.subject, item.lecture.displayStatus)} ${live ? "is-now" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {!allDayOff && (
                      <p className="font-mono text-[11px] text-muted-foreground sm:hidden" aria-label={`${item.lecture.startLabel} to ${item.lecture.endLabel}`}>
                        {formatCompactRange(item.lecture.startLabel, item.lecture.endLabel)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`tracking-tight ${off ? "text-danger" : ""} ${live ? "font-semibold" : "font-medium"} ${item.lecture.displayStatus === "cancelled" && !off ? "line-through decoration-danger" : ""}`}>
                        {item.lecture.subject}
                      </p>
                      {showStatus && <StatusBadge status={item.lecture.displayStatus} label={badgeText(item.lecture.displayStatus, item.lecture.subject)} />}
                    </div>
                    {showDivision && <p className="text-[11px] text-muted-foreground">{cohortName(item.lecture.division)}</p>}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    {live && <NowMark />}
                    {!off && <ClassMeta faculty={item.lecture.faculty} room={item.lecture.room} />}
                  </div>
                </div>
                {item.lecture.reason && !off && <p className="mt-1 text-sm">{item.lecture.reason}</p>}
                {item.lecture.reason && off && <p className="mt-1 hidden text-sm sm:block">{item.lecture.reason}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function NowMark() {
  return (
    <span className="now-mark" data-testid="now-mark">
      Now
    </span>
  );
}

function isLive(lecture: PublicLecture, today: string, minutes: number) {
  return lecture.kind === "lecture" && lecture.displayStatus !== "cancelled" && slotPhase(lecture, today, minutes) === "now";
}

type TimelineItem = { kind: "lecture"; lecture: PublicLecture } | { kind: "break"; lecture: PublicLecture; key: string };

function timeline(lectures: PublicLecture[]): TimelineItem[] {
  const seenBreaks = new Set<string>();
  const items: TimelineItem[] = [];
  const ordered = [...lectures].sort((a, b) => a.startMinutes - b.startMinutes || a.division.localeCompare(b.division));
  for (const lecture of ordered) {
    if (lecture.kind !== "break") {
      items.push({ kind: "lecture", lecture });
      continue;
    }
    const key = `${lecture.date}|${lecture.startMinutes}|${lecture.endMinutes}`;
    if (seenBreaks.has(key)) continue;
    seenBreaks.add(key);
    items.push({ kind: "break", lecture, key });
  }
  return items;
}
