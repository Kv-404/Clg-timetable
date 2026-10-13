import type { PublicLecture } from "@shared/types";
import { cohortName } from "@shared/cohort";
import { StatusBadge, badgeText } from "@/components/StatusBadge";
import { ClockLabel } from "@/components/ClockLabel";
import { formatLongDate } from "@/lib/time";
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
  return (
    <div>
      <h2 className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.22em] uppercase">{formatLongDate(date)}</h2>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <ol className="mt-4 grid grid-cols-1 gap-x-4 border-t border-border sm:grid-cols-[max-content_minmax(0,1fr)]">
        {timeline(visible).map((item, index) => {
          if (item.kind === "break") {
            return (
              <li key={item.key} className="rise-row col-span-1 border-b border-border py-3 text-sm text-muted-foreground sm:col-span-2" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
                {item.lecture.subject} · {item.lecture.startLabel} – {item.lecture.endLabel}
              </li>
            );
          }
          const live = isLive(item.lecture, today, minutes);
          const detail = [showDivision ? cohortName(item.lecture.division) : "", item.lecture.faculty, item.lecture.room].filter(Boolean);
          return (
            <li
              key={item.lecture.id}
              className="rise-row col-span-1 grid grid-cols-1 items-start gap-y-1 border-b border-border py-2.5 sm:col-span-2 sm:grid-cols-subgrid sm:gap-y-0"
              style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
            >
              <p className={`flex items-baseline gap-1 font-mono text-xs whitespace-nowrap sm:pt-1.5 ${live ? "text-foreground" : "text-muted-foreground"}`}>
                <ClockLabel label={item.lecture.startLabel} />
                <span aria-hidden="true">–</span>
                <ClockLabel label={item.lecture.endLabel} />
              </p>
              <div
                data-testid="lecture-card"
                data-live={live ? "true" : undefined}
                className={`min-w-0 ${classNameFor(item.lecture.subject, item.lecture.displayStatus)} ${live ? "is-now" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-medium tracking-tight ${item.lecture.displayStatus === "cancelled" ? "text-danger line-through" : ""}`}>{item.lecture.subject}</p>
                  {item.lecture.displayStatus !== "scheduled" && (
                    <StatusBadge status={item.lecture.displayStatus} label={badgeText(item.lecture.displayStatus, item.lecture.subject)} />
                  )}
                </div>
                {detail.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{detail.join(" · ")}</p>}
                {item.lecture.previous?.room && item.lecture.previous.room !== item.lecture.room && (
                  <p className="text-sm text-muted-foreground">Was {item.lecture.previous.room}</p>
                )}
                {item.lecture.reason && <p className="mt-1 text-sm">{item.lecture.reason}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
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
