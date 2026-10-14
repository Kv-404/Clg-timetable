import type { BootstrapResponse, PublicLecture } from "@shared/types";
import { cohortName } from "@shared/cohort";
import { CalendarDays, CalendarPlus, ChevronDown, Clock, Download, FileSpreadsheet, History, Palette, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RecentChanges } from "@/components/RecentChanges";
import { Setup } from "@/components/Setup";
import { TimetableFilters } from "@/components/TimetableFilters";
import { TodayView } from "@/components/TodayView";
import { WeeklyView } from "@/components/WeeklyView";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChangeNotifications } from "@/hooks/useNotifications";
import { appleWeekCalendarUrl, calendarFeedUrl, googleWeekCalendarUrl, outlookWeekCalendarUrl } from "@/lib/calendar";
import { readSetup, readStoredCohort, saveCohort, themes, type ThemeId } from "@/lib/prefs";
import { ColorEditor } from "@/components/ColorEditor";
import { ColorSwitch } from "@/components/ColorSwitch";
import { formatClock, formatClockTime, formatCompactRange, shortRoom, zonedNow } from "@/lib/time";
import { applyFilters, collapseFullOffDays, defaultFilters, slotPhase, unique, type Filters } from "@/lib/view";

const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function Dashboard({
  data,
  now,
  pending,
  onRefresh,
  theme,
  colors,
  bold,
  onTheme,
  onColors,
  onBold,
}: {
  data: BootstrapResponse;
  now: Date;
  pending: boolean;
  onRefresh: () => void;
  theme: ThemeId;
  colors: boolean;
  bold: boolean;
  onTheme: (theme: ThemeId) => void;
  onColors: (on: boolean) => void;
  onBold: (on: boolean) => void;
}) {
  const [ready, setReady] = useState(readSetup);
  const [cohort, setCohort] = useState(readStoredCohort);
  const [filters, setFilters] = useState<Filters>(() => ({ ...defaultFilters(data.lectures, data.today), division: readStoredCohort() }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState("week");
  const zone = zonedNow(now, data.timezone);
  const divisions = unique(data.lectures.map((lecture) => lecture.division));
  const selected = divisions.includes(cohort) ? cohort : "";
  const cohortChanges = data.changes.filter((change) => !selected || !change.division || change.division === selected);
  const notifications = useChangeNotifications(cohortChanges);

  const courses = unique(data.lectures.map((lecture) => lecture.course));
  const semesters = unique(data.lectures.filter((lecture) => lecture.course === filters.course).map((lecture) => lecture.semester));
  const scope = data.lectures.filter(
    (lecture) =>
      (!filters.course || lecture.course === filters.course) &&
      (!filters.semester || lecture.semester === filters.semester) &&
      lecture.division === selected &&
      lecture.kind !== "break",
  );
  const days = dayOrder.filter((day) => scope.some((lecture) => lecture.weekday === day));
  const subjects = unique(scope.map((lecture) => lecture.subject));
  const faculties = unique(scope.map((lecture) => lecture.faculty));
  const rooms = unique(scope.map((lecture) => lecture.room));
  const effective = { ...filters, division: selected };
  const dayLectures = collapseFullOffDays(applyFilters(data.lectures, effective));
  const weekLectures = collapseFullOffDays(applyFilters(data.lectures, effective, { ignoreDay: true }));
  const todayPack = useMemo(() => resolveToday(dayLectures, zone.iso, filters.day), [dayLectures, zone.iso, filters.day]);
  const upcoming = nextClass(scope, zone.iso, zone.minutes);
  const changes = cohortChanges;
  const failing = Boolean(data.sync.lastError);

  function choose(division: string) {
    saveCohort(division);
    setCohort(division);
    setFilters((current) => ({ ...current, division, day: "", subject: "", faculty: "", room: "", query: "", status: "all" }));
  }

  function patch(partial: Partial<Filters>) {
    setFilters((current) => {
      const next = { ...current, ...partial, division: selected };
      if (partial.course) {
        const nextSemesters = unique(data.lectures.filter((lecture) => lecture.course === next.course).map((lecture) => lecture.semester));
        next.semester = nextSemesters[0] ?? "";
        next.subject = "";
        next.faculty = "";
        next.room = "";
      } else if (partial.semester !== undefined) {
        next.subject = "";
        next.faculty = "";
        next.room = "";
      }
      return next;
    });
  }

  if (!ready || !selected) {
    return (
      <Setup
        divisions={divisions}
        cohort={selected}
        theme={theme}
        colors={colors}
        bold={bold}
        onTheme={onTheme}
        onColors={onColors}
        onBold={onBold}
        onDone={(division) => {
          choose(division);
          setReady(true);
          setView("week");
        }}
      />
    );
  }

  return (
    <Tabs value={view} onValueChange={setView} className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-6">
          <p className="hidden shrink-0 text-sm font-medium tracking-tight sm:block">Timetable</p>
          <CohortMenu value={selected} divisions={divisions} onChange={choose} />
          <div className="ml-auto flex items-center gap-1">
            <CalendarMenu division={selected} />
            <IconButton label={pending ? "Refreshing" : "Refresh"} onClick={onRefresh} disabled={pending} testId="refresh-button">
              <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
            </IconButton>
            <AppearanceMenu theme={theme} colors={colors} bold={bold} subjects={subjects} onTheme={onTheme} onColors={onColors} onBold={onBold} />
            <a
              href={data.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the sheet"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
            </a>
            <IconButton label={filtersOpen ? "Hide filters" : "Filters"} pressed={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </IconButton>
            {notifications.permission !== "granted" && (
              <button type="button" data-testid="notify-button" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline" onClick={() => void notifications.enable()}>
                Notify me
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 pb-1.5 sm:gap-3 sm:px-6 sm:pb-2">
          <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
            {days.map((day) => (
              <DayChip
                key={day}
                today={day === zone.weekday}
                selected={view === "today" && (filters.day === day || (filters.day === "" && day === zone.weekday))}
                onClick={() => {
                  patch({ day });
                  setView("today");
                }}
              >
                {day.slice(0, 3)}
              </DayChip>
            ))}
          </div>
          <TabsList aria-label="Timetable views" className="shrink-0 gap-3 pb-0 sm:gap-4">
            <TabsTrigger value="today" className="inline-flex items-center gap-1.5">
              <Clock className="hidden size-3.5 sm:block" aria-hidden="true" /> Day
            </TabsTrigger>
            <TabsTrigger value="week" className="inline-flex items-center gap-1.5">
              <CalendarDays className="hidden size-3.5 sm:block" aria-hidden="true" /> Week
            </TabsTrigger>
            <TabsTrigger value="updates" className="inline-flex items-center gap-1.5">
              <History className="hidden size-3.5 sm:block" aria-hidden="true" /> Updates
            </TabsTrigger>
          </TabsList>
        </div>
      </header>

      <main id="timetable" className="px-3 py-3 sm:px-6 sm:py-6">
        <h1 className="sr-only">{cohortName(selected)} timetable</h1>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="hidden text-sm text-muted-foreground sm:block">
              {data.weekStart && data.weekEnd ? `${formatShort(data.weekStart)} – ${formatShort(data.weekEnd)}` : "This week"}
              <span className="mx-2">·</span>
              {formatClock(now, data.timezone)}
            </p>
            {!upcoming && <p className="font-mono text-xs text-muted-foreground sm:hidden">{formatClockTime(now, data.timezone)}</p>}
            {upcoming && <NowLine lecture={upcoming} today={zone.iso} minutes={zone.minutes} />}
            {notifications.permission !== "granted" && (
              <button type="button" data-testid="notify-button" className="mt-2 text-xs text-muted-foreground hover:text-foreground sm:hidden" onClick={() => void notifications.enable()}>
                Notify me
              </button>
            )}
          </div>
          <Input
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder="Search subject, faculty, or room"
            aria-label="Search the timetable"
            className="hidden w-64 shrink-0 sm:block"
          />
        </div>
        <p data-testid="sync-status" role={failing ? "alert" : "status"} className={`mb-4 text-sm ${failing ? "text-warning" : "sr-only"}`}>
          {failing ? `Could not refresh. ${data.sync.lastError} The last timetable is still shown.` : syncedLabel(data.sync.lastSuccessAt, now)}
        </p>
        {filtersOpen && (
          <div className="mb-6 max-w-sm space-y-3">
            <Input
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
              placeholder="Search"
              aria-label="Search the timetable"
              className="sm:hidden"
            />
            <TimetableFilters
              filters={effective}
              courses={courses}
              semesters={semesters}
              days={days}
              subjects={subjects}
              faculties={faculties}
              rooms={rooms}
              onChange={patch}
              onClear={() => patch({ day: "", subject: "", faculty: "", room: "", status: "all", query: "" })}
            />
          </div>
        )}

        <TabsContent value="today" className="rise mt-0">
          <TodayView lectures={todayPack.lectures} today={zone.iso} minutes={zone.minutes} showDivision={false} note={todayPack.note} />
        </TabsContent>
        <TabsContent value="week" className="rise mt-0">
          <WeeklyView lectures={weekLectures} showDivision={false} today={zone.iso} minutes={zone.minutes} />
        </TabsContent>
        <TabsContent value="updates" className="mt-0">
          <RecentChanges changes={changes} timeZone={data.timezone} />
        </TabsContent>
      </main>
      {notifications.notice && (
        <div
          role="status"
          data-testid="notify-notice"
          className="fixed inset-x-3 bottom-3 z-50 flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
        >
          <p className="min-w-0 flex-1 leading-snug">{notifications.notice}</p>
          <button type="button" className="shrink-0 text-xs text-muted-foreground hover:text-foreground" onClick={notifications.dismiss}>
            Close
          </button>
        </div>
      )}
    </Tabs>
  );
}

function CalendarMenu({ division }: { division: string }) {
  const [open, setOpen] = useState(false);
  const [protonNote, setProtonNote] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const feed = calendarFeedUrl(division);
  const file = `${cohortName(division).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "timetable"}.ics`;
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function addToProton() {
    try {
      await navigator.clipboard.writeText(feed);
      setProtonNote("copied");
    } catch {
      setProtonNote("manual");
    }
    window.open("https://calendar.proton.me", "_blank", "noopener");
    setOpen(false);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        data-testid="calendar-week"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Add ${cohortName(division)}'s week to a calendar`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-auto sm:gap-2 sm:border sm:border-border sm:px-3 sm:text-sm sm:text-foreground"
      >
        <CalendarPlus className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Add week</span>
      </button>
      {open && (
        <div role="menu" aria-label="Add week" className="menu-pop absolute top-full right-0 z-40 mt-1 w-56 rounded-lg border border-border bg-background p-1 shadow-sm">
          <a role="menuitem" data-testid="calendar-download" href={calendarFeedUrl(division, true)} download={file} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
            <Download className="size-4" aria-hidden="true" />
            Download file
          </a>
          <a role="menuitem" data-testid="calendar-google" href={googleWeekCalendarUrl(division)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
            <CalendarPlus className="size-4" aria-hidden="true" />
            Google Calendar
          </a>
          <a role="menuitem" data-testid="calendar-apple" href={appleWeekCalendarUrl(division)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
            <CalendarPlus className="size-4" aria-hidden="true" />
            Apple Calendar
          </a>
          <a role="menuitem" data-testid="calendar-outlook" href={outlookWeekCalendarUrl(division)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
            <CalendarPlus className="size-4" aria-hidden="true" />
            Outlook
          </a>
          <button type="button" role="menuitem" data-testid="calendar-proton" onClick={() => void addToProton()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted">
            <CalendarPlus className="size-4" aria-hidden="true" />
            Proton Calendar
          </button>
        </div>
      )}
      {protonNote && (
        <div role="status" data-testid="proton-note" className="absolute top-full right-0 z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-3 text-sm shadow-sm">
          <p>{protonNote === "copied" ? "Link copied." : "Copy this link."} In Proton Calendar, click + next to My calendars, choose Add calendar from URL, and paste it.</p>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{feed}</p>
          <button type="button" className="mt-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setProtonNote(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function AppearanceMenu({
  theme,
  colors,
  bold,
  subjects,
  onTheme,
  onColors,
  onBold,
}: {
  theme: ThemeId;
  colors: boolean;
  bold: boolean;
  subjects: string[];
  onTheme: (theme: ThemeId) => void;
  onColors: (on: boolean) => void;
  onBold: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={menuRef} className="relative">
      <IconButton label="Theme and colours" pressed={open} onClick={() => setOpen((current) => !current)} testId="appearance-button">
        <Palette className="size-4" aria-hidden="true" />
      </IconButton>
      {open && (
        <div role="menu" aria-label="Theme and colours" className="menu-pop absolute top-full right-0 z-40 mt-1 max-h-[min(32rem,calc(100dvh-5rem))] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-background p-3 shadow-sm">
          <p className="text-muted-foreground font-mono text-[11px] tracking-[0.22em] uppercase">Theme</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {themes.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={theme === item.id}
                onClick={() => onTheme(item.id)}
                className={`rounded-md px-2 py-1.5 text-left text-xs ${theme === item.id ? "bg-foreground text-background" : "hover:bg-muted"}`}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <ColorSwitch on={colors} onChange={onColors} />
          </div>
          {colors && (
            <div className="mt-2">
              <ColorSwitch on={bold} onChange={onBold} title="Bold colours" onHint="Solid class colours" offHint="Soft tint" testId="bold-toggle" />
            </div>
          )}
          {colors && (
            <div className="mt-3">
              <ColorEditor theme={theme} subjects={subjects} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CohortMenu({ value, divisions, onChange }: { value: string; divisions: string[]; onChange: (division: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Cohort"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium whitespace-nowrap hover:bg-muted"
      >
        {cohortName(value)}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Cohort" className="menu-pop absolute top-full left-0 z-40 mt-1 min-w-52 rounded-lg border border-border bg-background p-1 shadow-sm">
          {divisions.map((division) => (
            <button
              key={division}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(division);
                setOpen(false);
              }}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${division === value ? "font-medium" : ""}`}
            >
              {cohortName(division)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  pressed,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function DayChip({ selected, today, children, onClick }: { selected: boolean; today: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-current={today ? "date" : undefined}
      onClick={onClick}
      className={`day-chip shrink-0 rounded-md px-2 py-1 text-xs ${selected ? "bg-foreground font-medium text-background" : today ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function NowLine({ lecture, today, minutes }: { lecture: PublicLecture; today: string; minutes: number }) {
  const live = slotPhase(lecture, today, minutes) === "now";
  const range = formatCompactRange(lecture.startLabel, lecture.endLabel);
  const when = lecture.date && lecture.date !== today ? `${lecture.weekday.slice(0, 3)} ${range}` : range;
  const room = lecture.room ? ` · ${shortRoom(lecture.room)}` : "";
  return (
    <p className="flex items-baseline gap-2 text-sm" data-testid={live ? "now-banner" : undefined}>
      <span className={live ? "shrink-0 font-medium" : "shrink-0 text-muted-foreground"}>{live ? "Now" : "Next"}</span>
      <span className="min-w-0 truncate font-medium tracking-tight">{lecture.subject}</span>
      <span className="shrink-0 text-muted-foreground">
        {when}
        {room}
      </span>
    </p>
  );
}

function nextClass(lectures: PublicLecture[], today: string, minutes: number) {
  const classes = lectures
    .filter((lecture) => lecture.kind === "lecture" && lecture.displayStatus !== "cancelled" && lecture.date)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.startMinutes - b.startMinutes);
  return (
    classes.find((lecture) => slotPhase(lecture, today, minutes) === "now") ??
    classes.find((lecture) => {
      const phase = slotPhase(lecture, today, minutes);
      return phase === "upcoming" || phase === "later";
    })
  );
}

function resolveToday(lectures: PublicLecture[], today: string, day: string) {
  if (day) {
    return { lectures: lectures.filter((lecture) => lecture.weekday === day), note: undefined as string | undefined };
  }
  const todays = lectures.filter((lecture) => lecture.date === today);
  if (todays.length > 0) return { lectures: todays, note: undefined };
  const dated = lectures.map((lecture) => lecture.date).filter((date): date is string => Boolean(date)).sort();
  const nearest = dated.find((date) => date >= today) ?? dated[0];
  if (!nearest) return { lectures: [], note: "This sheet has no dated lectures." };
  return {
    lectures: lectures.filter((lecture) => lecture.date === nearest),
    note: "Today is outside the dates in the sheet. Showing the nearest day.",
  };
}

function formatShort(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));
}

function syncedLabel(iso: string | null, now: Date) {
  if (!iso) return "Not synced yet";
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "Synced just now";
  return minutes < 60 ? `Synced ${minutes}m ago` : `Synced ${Math.round(minutes / 60)}h ago`;
}
