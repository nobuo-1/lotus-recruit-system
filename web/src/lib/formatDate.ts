// web/src/lib/formatDate.ts
/** JST固定で "YYYY-MM-DD(曜) HH:MM:SS" を返す */
export function formatJpDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";

  const dtf = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // "YYYY/MM/DD(曜) HH:MM:SS" を parts から組み立てて "/"→"-" に
  const parts = Object.fromEntries(
    dtf.formatToParts(d).map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const yyyy = parts.year ?? "";
  const mm = parts.month ?? "";
  const dd = parts.day ?? "";
  const wd = parts.weekday ?? ""; // 例: "金"
  const HH = parts.hour ?? "";
  const MM = parts.minute ?? "";
  const SS = parts.second ?? "";

  return `${yyyy}-${mm}-${dd}(${wd}) ${HH}:${MM}:${SS}`;
}
