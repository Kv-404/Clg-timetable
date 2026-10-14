import { compactRoom } from "@/lib/time";

export function ClassMeta({ faculty, room }: { faculty: string; room: string }) {
  const place = room ? compactRoom(room) : "";
  if (!faculty && !place) return null;
  return (
    <div className="shrink-0 text-right leading-tight">
      {faculty && (
        <p className="max-w-24 truncate text-[11px] text-muted-foreground" title={faculty}>
          {faculty}
        </p>
      )}
      {place && (
        <p className="text-[11px] text-muted-foreground" title={room}>
          {place}
        </p>
      )}
    </div>
  );
}
