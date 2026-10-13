import { calendarFile } from "@shared/calendar";
import { cohortName } from "@shared/cohort";

export { eventTitle, googleCalendarUrl, googleStamp } from "@shared/calendar";
export { cohortName };

export function calendarFeedUrl(division: string, download = false) {
  const feed = new URL("/api/calendar.ics", window.location.origin);
  feed.searchParams.set("division", division);
  if (download) feed.searchParams.set("download", "1");
  return feed.toString();
}

export function googleWeekCalendarUrl(division: string) {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarFeedUrl(division))}`;
}

export function appleWeekCalendarUrl(division: string) {
  return calendarFeedUrl(division).replace(/^https?:/, "webcal:");
}

export function outlookWeekCalendarUrl(division: string) {
  const feed = calendarFeedUrl(division);
  return `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(cohortName(division))}`;
}

export function downloadCalendarFile(filename: string, lectures: Parameters<typeof calendarFile>[0], timeZone: string) {
  const body = calendarFile(lectures, timeZone);
  if (!body.includes("BEGIN:VEVENT")) return false;
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
