// web/src/components/JobCategoriesCell.tsx
"use client";

type JobObj = { large?: unknown; small?: unknown };

// 文字なら trim、それ以外は空文字
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// JSON文字列なら {large,small} へパースを試みる
const parseMaybeJson = (v: string): JobObj | null => {
  const s = v.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return null;
  try {
    const o = JSON.parse(s);
    if (o && typeof o === "object") return o as JobObj;
  } catch (_) {}
  return null;
};

const toLabel = (v: unknown): string => {
  // 文字列 → JSONの可能性を考慮
  if (typeof v === "string") {
    const parsed = parseMaybeJson(v);
    if (parsed) {
      const L = str(parsed.large);
      const S = str(parsed.small);
      return L && S ? `${L}（${S}）` : L || S || "";
    }
    // 通常の純粋な文字列（すでに "大（小）" 形式など）
    return v.trim();
  }

  // オブジェクト {large, small}
  if (v && typeof v === "object") {
    const L = str((v as JobObj).large);
    const S = str((v as JobObj).small);
    return L && S ? `${L}（${S}）` : L || S || "";
  }

  return "";
};

export function JobCategoriesCell({
  items,
}: {
  /** 文字列 or JSON文字列 or {large,small} の配列を想定 */
  items: Array<string | JobObj> | null | undefined;
}) {
  const list = Array.isArray(items) ? items : [];
  const lines = list.map(toLabel).filter(Boolean);

  if (lines.length === 0) return <span className="text-neutral-400">-</span>;

  // ボタン風ではなく、中央揃え＆改行で羅列。色はメール/都道府県と同じトーン
  return (
    <div className="flex flex-col items-center text-center text-neutral-600 leading-6">
      {lines.map((t, i) => (
        <span key={i}>{t}</span>
      ))}
    </div>
  );
}
