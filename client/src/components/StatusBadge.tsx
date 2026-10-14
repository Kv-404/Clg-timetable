import type { DisplayStatus } from "@shared/types";
import { Ban, CalendarClock, Check, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const copy: Record<DisplayStatus, { label: string; variant: "scheduled" | "cancelled" | "changed"; icon: typeof Check }> = {
  scheduled: { label: "Scheduled", variant: "scheduled", icon: Check },
  cancelled: { label: "Cancelled", variant: "cancelled", icon: Ban },
  changed: { label: "Changed", variant: "changed", icon: PencilLine },
  rescheduled: { label: "Rescheduled", variant: "changed", icon: CalendarClock },
};

export function StatusBadge({ status, label }: { status: DisplayStatus; label?: string }) {
  const item = copy[status];
  const Icon = item.icon;
  const text = label ?? item.label;
  return (
    <Badge variant={item.variant} aria-label={`Status: ${text}`}>
      <Icon className="size-3" aria-hidden="true" />
      <span className="hidden sm:inline">{text}</span>
    </Badge>
  );
}

export function badgeText(status: DisplayStatus, subject: string) {
  if (status === "cancelled" && subject === "OFF") return "OFF";
  return copy[status].label.toUpperCase();
}
