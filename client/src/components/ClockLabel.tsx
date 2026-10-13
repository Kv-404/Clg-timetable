export function ClockLabel({ label }: { label: string }) {
  const match = /^(\d{1,2})(:\d{2}\s*[AP]M)$/i.exec(label.trim());
  if (!match) return <span>{label}</span>;
  return (
    <span className="inline-grid grid-cols-[2ch_auto] tabular-nums">
      <span className="text-right">{match[1]}</span>
      <span>{match[2]}</span>
    </span>
  );
}
