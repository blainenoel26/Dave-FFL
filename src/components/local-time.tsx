"use client";

const format = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** A timestamp in the viewer's own time zone. */
export function LocalTime({ iso }: { iso: string }) {
  return <span suppressHydrationWarning>{format.format(new Date(iso))}</span>;
}
