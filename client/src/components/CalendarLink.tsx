import type { PublicLecture } from "@shared/types";
import { CalendarPlus } from "lucide-react";
import { googleCalendarUrl } from "@/lib/calendar";

export function CalendarLink({ lecture, timeZone }: { lecture: PublicLecture; timeZone: string; compact?: boolean }) {
  const href = googleCalendarUrl(lecture, timeZone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid="calendar-link"
      aria-label={`Add ${lecture.subject} to Google Calendar`}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <CalendarPlus className="size-4" aria-hidden="true" />
    </a>
  );
}
