// web/scripts/generate-nta-town-seeds-from-postal.ts
// 目的: 日本郵便 KEN_ALL（ZIP/CSV）から、指定自治体の町丁名シードを抽出し
//       src/constants/ntaTownSeeds.generated.ts を生成（メモリ節約のストリーミング実装）

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import iconv from "iconv-lite";
import { parse as csvParse } from "csv-parse";
import AdmZip from "adm-zip";

type Row = string[];

// 対象自治体
const TARGETS: Record<string, string[]> = {
  東京都: ["世田谷区", "渋谷区", "千代田区", "中央区", "港区", "新宿区"],
  大阪府: ["大阪市中央区"],
};

// 入出力
const DATA_DIR = path.resolve(process.cwd(), "data/nta-csv");
const OUT_TS = path.resolve(
  process.cwd(),
  "src/constants/ntaTownSeeds.generated.ts"
);

// KEN_ALL 列番号（0-indexed）
const COL_PREF = 6; // 都道府県
const COL_CITY = 7; // 市区町村
const COL_TOWN = 8; // 町域

// --- 正規化ユーティリティ ---
const z2h = (s: string) =>
  s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
const normalize = (s: string) => {
  let t = s;
  t = t.replace(/\uFEFF/g, ""); // BOM
  t = t.replace(/\u3000/g, " "); // 全角空白→半角
  t = t.replace(/\s+/g, " "); // 連続空白
  t = z2h(t).trim();
  if (/以下に掲載がない場合/.test(t)) return ""; // 町域なし扱い
  t = t.replace(/（[^）]*）/g, ""); // 括弧注記を除去
  t = t.replace(/([0-9０-９]+)\s*丁目/g, ""); // ○丁目除去
  return t.trim();
};

type MapSet = Record<string, Record<string, Set<string>>>;

function ensureMap(map: MapSet, pref: string, city: string) {
  map[pref] ||= {};
  map[pref][city] ||= new Set<string>();
}
function isTarget(pref: string, city: string) {
  const list = TARGETS[pref];
  return !!list && list.includes(city);
}

function listCandidateFiles(): string[] {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`ERROR: ${DATA_DIR} がありません。`);
  }
  const names = fs.readdirSync(DATA_DIR);
  const abs = names
    .filter((n) => /\.(csv|CSV|zip|ZIP)$/.test(n))
    .map((n) => path.join(DATA_DIR, n));
  if (abs.length === 0) {
    throw new Error(
      `ERROR: ${DATA_DIR} に KEN_ALL.ZIP（または ken_all.zip / utf_ken_all.zip / KEN_ALL.CSV）を配置してください。`
    );
  }
  return abs;
}

/** CSV の Readable(文字列チャンク) を逐次パース */
async function processCsvReadable(
  readable: NodeJS.ReadableStream,
  outMap: MapSet
) {
  return new Promise<void>((resolve, reject) => {
    const parser = csvParse({
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
    });

    parser.on("readable", () => {
      let row: Row;
      // eslint-disable-next-line no-cond-assign
      while ((row = parser.read() as Row)) {
        if (!row || row.length < 9) continue;
        const pref = normalize(row[COL_PREF] || "");
        const city = normalize(row[COL_CITY] || "");
        let town = normalize(row[COL_TOWN] || "");
        if (!pref || !city || !town) continue;
        if (!isTarget(pref, city)) continue;

        town = town.replace(/[‐－―ー]/g, "-").trim();
        if (!town) continue;

        ensureMap(outMap, pref, city);
        outMap[pref][city]!.add(town);
      }
    });

    parser.on("error", reject);
    parser.on("end", resolve);

    (readable as any).pipe(parser as any);
  });
}

async function processZipFile(zipPath: string, outMap: MapSet) {
  const sizeMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
  console.log(`Found ZIP: ${path.basename(zipPath)} (${sizeMb} MB)`);

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((e) => /\.csv$/i.test(e.entryName));
  if (entries.length === 0) return;

  for (const ent of entries) {
    const buf = ent.getData(); // Buffer
    const isUtf = /utf/i.test(ent.entryName);

    // CSV → 文字列ストリームへ
    const decoded: NodeJS.ReadableStream = isUtf
      ? (Readable.from(
          buf.toString("utf8")
        ) as unknown as NodeJS.ReadableStream)
      : (Readable.from(buf).pipe(
          iconv.decodeStream("shift_jis")
        ) as unknown as NodeJS.ReadableStream);

    await processCsvReadable(decoded, outMap);
  }
}

async function processCsvFile(csvPath: string, outMap: MapSet) {
  const sizeMb = (fs.statSync(csvPath).size / 1024 / 1024).toFixed(2);
  console.log(`Found CSV: ${path.basename(csvPath)} (${sizeMb} MB)`);
  const isUtf = /utf/i.test(path.basename(csvPath));

  const decoded: NodeJS.ReadableStream = isUtf
    ? (fs.createReadStream(csvPath, {
        encoding: "utf8",
      }) as unknown as NodeJS.ReadableStream)
    : (fs
        .createReadStream(csvPath)
        .pipe(
          iconv.decodeStream("shift_jis")
        ) as unknown as NodeJS.ReadableStream);

  await processCsvReadable(decoded, outMap);
}

function emitTs(map: MapSet) {
  const obj: Record<string, Record<string, string[]>> = {};
  let prefs = 0,
    cities = 0,
    towns = 0;

  for (const [p, cs] of Object.entries(map)) {
    prefs++;
    obj[p] = {};
    for (const [c, set] of Object.entries(cs)) {
      cities++;
      const arr = Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
      towns += arr.length;
      obj[p][c] = arr; // ← 可変配列（readonly ではない）
      console.log(`[HIT] ${p}__${c}: ${arr.length} towns`);
    }
  }

  console.log(`Summary: prefs=${prefs}, cities=${cities}, towns=${towns}`);

  const header = `/* AUTO-GENERATED by scripts/generate-nta-town-seeds-from-postal.ts
   * Source: Japan Post "KEN_ALL" (全国一括 郵便番号データ; ZIP/CSV)
   * Targets: 東京都(世田谷区/渋谷区/千代田区/中央区/港区/新宿区), 大阪府(大阪市中央区)
   * Note: 町丁名の「○丁目」等は除去し、代表名で統一しています。
   */\n\n`;
  const body =
    `export type NtaTownSeeds = Record<string, Record<string, string[]>>;\n` +
    // ★ ここがポイント：`as const` を付けない！
    `export const NTA_TOWN_SEEDS: NtaTownSeeds = ${JSON.stringify(
      obj,
      null,
      2
    )};\n\n` +
    `export function listSeedTowns(pref: string, city: string): string[] {\n` +
    `  return (NTA_TOWN_SEEDS[pref]?.[city] ?? []).slice();\n` +
    `}\n\n` +
    `export function isSeedTown(pref: string, city: string, town: string): boolean {\n` +
    `  const arr = NTA_TOWN_SEEDS[pref]?.[city] ?? [];\n` +
    `  return arr.includes(town);\n` +
    `}\n`;

  fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
  fs.writeFileSync(OUT_TS, header + body, "utf8");
  console.log(`Generated ${OUT_TS}`);
}

async function main() {
  try {
    const files = listCandidateFiles();

    // 集計用マップ（pref → city → Set(town)）
    const map: MapSet = {};

    for (const file of files) {
      const lc = file.toLowerCase();
      if (lc.endsWith(".zip")) {
        await processZipFile(file, map);
      } else if (lc.endsWith(".csv")) {
        await processCsvFile(file, map);
      }
    }

    emitTs(map);
  } catch (e: any) {
    console.error(e?.stack || e?.message || String(e));
    process.exit(1);
  }
}

main();
