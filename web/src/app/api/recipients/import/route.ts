// web/src/app/api/recipients/import/route.ts
import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { supabaseServer } from "@/lib/supabaseServer";

type ImportRow = {
  email?: string;
  name?: string;
  company_name?: string;
  region?: string;
  job_type?: string;
};

type ProfileTenantRow = {
  tenant_id: string | null;
};

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  email: "email",
  "emailaddress": "email",
  "e-mail": "email",
  mail: "email",
  "メール": "email",
  "メールアドレス": "email",

  name: "name",
  fullname: "name",
  "名前": "name",
  "氏名": "name",
  "担当者": "name",
  "担当者名": "name",

  company: "company_name",
  companyname: "company_name",
  company_name: "company_name",
  "会社名": "company_name",
  "企業名": "company_name",

  region: "region",
  prefecture: "region",
  "地域": "region",
  "都道府県": "region",

  job: "job_type",
  jobtype: "job_type",
  job_type: "job_type",
  "職種": "job_type",
  "職種名": "job_type",
};

// 小さなメールバリデータ（最低限）
function isValidEmail(s: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

function normalizeHeader(raw: string) {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/[ \t\r\n\u3000]/g, "")
    .trim()
    .toLowerCase();
}

function toText(v: unknown) {
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function normalizeImportRow(row: Record<string, unknown>): ImportRow {
  const out: ImportRow = {};

  for (const [rawKey, value] of Object.entries(row)) {
    const key = HEADER_ALIASES[normalizeHeader(rawKey)];
    if (!key) continue;
    const text = toText(value);
    if (!text) continue;
    out[key] = text;
  }

  return out;
}

function decodeXmlEntities(text: string) {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_m, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === "amp") return "&";
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "quot") return '"';
      if (lower === "apos") return "'";
      if (lower.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      }
      if (lower.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
      }
      return "";
    }
  );
}

function stripRuby(xml: string) {
  return xml.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
}

function readZipText(zip: AdmZip, entryName: string) {
  const entry = zip.getEntry(entryName);
  if (!entry) return null;
  return entry.getData().toString("utf8");
}

function parseSharedStrings(xml: string | null) {
  if (!xml) return [];
  const cleaned = stripRuby(xml);
  const items = cleaned.match(/<si\b[\s\S]*?<\/si>/g) ?? [];

  return items.map((item) => {
    const texts = Array.from(item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map(
      (m) => decodeXmlEntities(m[1])
    );
    return texts.join("");
  });
}

function getAttr(attrs: string, name: string) {
  return attrs.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1] ?? null;
}

function colRefToIndex(ref: string) {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function extractSheetPath(zip: AdmZip) {
  const workbookXml = readZipText(zip, "xl/workbook.xml");
  const relsXml = readZipText(zip, "xl/_rels/workbook.xml.rels");

  const firstSheetRelId =
    workbookXml?.match(/<sheet\b[^>]*\br:id="([^"]+)"/i)?.[1] ?? null;
  if (!firstSheetRelId || !relsXml) return "xl/worksheets/sheet1.xml";

  const relMatch = relsXml.match(
    new RegExp(
      `<Relationship\\b[^>]*Id="${firstSheetRelId}"[^>]*Target="([^"]+)"`,
      "i"
    )
  );
  const target = relMatch?.[1];
  if (!target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("xl/") ? target : `xl/${target.replace(/^\//, "")}`;
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  const cleaned = stripRuby(xml);
  const rows = cleaned.match(/<row\b[\s\S]*?<\/row>/g) ?? [];

  return rows.map((rowXml) => {
    const row: string[] = [];
    const cells = rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g);

    for (const [, attrs, body] of cells) {
      const ref = getAttr(attrs, "r");
      if (!ref) continue;

      const col = ref.match(/[A-Z]+/i)?.[0];
      if (!col) continue;

      const cellType = getAttr(attrs, "t");
      const index = colRefToIndex(col);
      let value = "";

      if (cellType === "s") {
        const idx = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const sharedIndex = Number(idx ?? "-1");
        value =
          sharedIndex >= 0 && sharedIndex < sharedStrings.length
            ? sharedStrings[sharedIndex]
            : "";
      } else if (cellType === "inlineStr") {
        value = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
          .map((m) => decodeXmlEntities(m[1]))
          .join("");
      } else {
        value = decodeXmlEntities(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      }

      row[index] = value.trim();
    }

    return row;
  });
}

function parseXlsx(buffer: Buffer) {
  const zip = new AdmZip(buffer);
  const sharedStrings = parseSharedStrings(readZipText(zip, "xl/sharedStrings.xml"));
  const sheetPath = extractSheetPath(zip);
  const sheetXml = readZipText(zip, sheetPath);
  if (!sheetXml) throw new Error("xlsx sheet not found");

  const rows = parseWorksheetRows(sheetXml, sharedStrings).filter((row) =>
    row.some((cell) => toText(cell))
  );
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => toText(h));
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (!header) return;
      record[header] = toText(row[i]);
    });
    return record;
  });
}

function parseCsv(csvText: string) {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, unknown>[];
}

async function parseImportFile(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    return parseXlsx(Buffer.from(await file.arrayBuffer()));
  }

  return parseCsv(await file.text());
}

export async function POST(req: Request) {
  try {
    // 1) 認証確認
    const supabase = await supabaseServer();
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2) フォームからCSV/XLSXファイル取得
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            "file required ('multipart/form-data' with field name 'file')",
        },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "empty file" }, { status: 400 });
    }

    // 3) CSV/XLSXをパース
    const rows = (await parseImportFile(file)).map(normalizeImportRow);

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "no rows" }, { status: 400 });
    }

    // 4) tenant_id を取得（rpc と profiles の両取りで堅牢化）
    let tenant_id: string | null = null;

    // (a) RPC: current_tenant_id()（作成済み前提）
    try {
      const { data: ti } = await supabase.rpc("current_tenant_id");
      if (ti) tenant_id = ti as unknown as string;
    } catch {
      /* noop */
    }

    // (b) fallback: profiles から読む
    if (!tenant_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", userId)
        .maybeSingle<ProfileTenantRow>();
      tenant_id = prof?.tenant_id ?? null;
    }

    if (!tenant_id) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // 5) 正規化・重複排除
    const seen = new Set<string>();
    const payload: {
      tenant_id: string;
      email: string;
      name: string | null;
      company_name: string | null;
      region: string | null;
      job_type: string | null;
    }[] = [];
    let skipped = 0;

    for (const r of rows) {
      const email = String(r.email ?? "")
        .toLowerCase()
        .trim();
      if (!email || !isValidEmail(email)) {
        skipped++;
        continue;
      }
      if (seen.has(email)) {
        skipped++;
        continue;
      }
      seen.add(email);

      payload.push({
        tenant_id,
        email,
        name: r.name?.toString().trim() || null,
        company_name: r.company_name?.toString().trim() || null,
        region: r.region?.toString().trim() || null,
        job_type: r.job_type?.toString().trim() || null,
      });
    }

    if (payload.length === 0) {
      return NextResponse.json({ error: "no valid rows" }, { status: 400 });
    }

    // 6) upsert（テナント＋メールでユニーク）
    const { error } = await supabase
      .from("recipients")
      .upsert(payload, { onConflict: "tenant_id,email" });

    if (error) {
      // 代表的なDBエラーのヒント
      // - "Could not find the 'job_type'..." → recipients テーブルに job_type 列が無い（列追加 & pg_notify('pgrst','reload schema')）
      // - "Could not find the 'company_name'..." → recipients テーブルに company_name 列が無い
      // - "new row violates row-level security policy" → RLSポリシー不足
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, inserted: payload.length, skipped });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "internal error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
