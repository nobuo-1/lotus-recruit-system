// web/src/lib/formatDate.ts
export function formatJpDateTime(iso: string | null | undefined) {
  if (!iso) return "-";

  // UTC → JST（+9時間補正）
  const date = new Date(iso);
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);

  // 曜日を日本語で取得
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[jst.getDay()];

  // ロケールで時刻を整形（JST固定）
  const formatted = jst.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // 区切りを整えて「YYYY-MM-DD(曜) HH:mm:ss」形式で返す
  const cleaned = formatted.replace(/\//g, "-").replace(/\s+/g, " ");
  return cleaned.replace(/^(\d{4}-\d{2}-\d{2})/, `$1（${weekday}）`);
}
