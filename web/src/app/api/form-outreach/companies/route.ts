// web/src/app/api/form-outreach/companies/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/** 安全に dir を解決 */
function dirOf(s?: string | null): "asc" | "desc" {
  return s === "asc" || s === "desc" ? s : "desc";
}

/** テーブルごとの許可ソートキー（安全のためホワイトリスト） */
const SORTABLE = {
  prospects: new Set([
    "company_name",
    "website",
    "contact_email",
    "contact_form_url",
    "industry",
    "company_size",
    "job_site_source",
    "capital",
    "established_on",
    "corporate_number",
    "hq_address",
    "created_at",
    "updated_at",
  ]),
  rejected: new Set([
    "company_name",
    "website",
    "contact_email",
    "phone",
    "industry_large",
    "industry_small",
    "company_size",
    "company_size_extracted",
    "capital",
    "established_on",
    "source_site",
    "created_at",
    "updated_at",
  ]),
  similar: new Set([
    "target_company_name",
    "found_company_name",
    "found_website",
    "contact_email",
    "contact_form_url",
    "phone",
    "matched_addr",
    "matched_company_ratio",
    "source_site",
    "created_at",
    "updated_at",
  ]),
} as const;

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const table = (url.searchParams.get("table") || "prospects") as
      | "prospects"
      | "rejected"
      | "similar";

    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") || 10), 1),
      100
    );
    const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
    const offset = (page - 1) * limit;

    const q = (url.searchParams.get("q") || "").trim();
    const email = url.searchParams.get("email"); // has | none | null
    const form = url.searchParams.get("form"); // has | none | null
    const prefectures = (url.searchParams.get("prefectures") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const industryQ = (url.searchParams.get("industry") || "").trim();
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";

    const matchedAddr = url.searchParams.get("matched_addr"); // 'true'|'false' for similar
    const sort = url.searchParams.get("sort") || "created_at";
    const dir = dirOf(url.searchParams.get("dir"));

    const sb = await supabaseServer();

    // ---- テーブル別 SELECT 列 ----
    let from = null as any;
    let selectCols = "";
    let defaultSort = "created_at";

    if (table === "prospects") {
      from = sb.from("form_prospects");
      selectCols = [
        "id",
        "tenant_id",
        "company_name",
        "website",
        "contact_form_url",
        "contact_email",
        "industry",
        "company_size",
        "job_site_source",
        "created_at",
        "updated_at",
        "prefectures",
        "corporate_number",
        "hq_address",
        "capital",
        "established_on",
        "phone_number",
        "phone",
      ].join(",");
    } else if (table === "rejected") {
      from = sb.from("form_prospects_rejected");
      selectCols = [
        "id",
        "tenant_id",
        "corporate_number",
        "company_name",
        "website",
        "contact_email",
        "phone",
        "contact_form_url",
        "industry_large",
        "industry_small",
        "company_size",
        "company_size_extracted",
        "prefectures",
        "hq_address",
        "capital",
        "established_on",
        "source_site",
        "reject_reasons",
        "created_at",
        "updated_at",
      ].join(",");
    } else {
      // similar
      from = sb.from("form_similar_sites");
      selectCols = [
        "id",
        "tenant_id",
        "target_corporate_number",
        "target_company_name",
        "target_hq_address",
        "found_company_name",
        "found_website",
        "source_site",
        "matched_addr",
        "matched_company_ratio",
        "contact_form_url",
        "contact_email",
        "phone",
        "reasons",
        "created_at",
        "updated_at",
      ].join(",");
    }

    // ---- ベースクエリ（COUNT と DATA の2本に同じフィルタを適用） ----
    const qCount = from
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    const qData = from.select(selectCols).eq("tenant_id", tenantId);

    // ---- フィルタ適用（共通） ----
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      if (table === "prospects") {
        qCount.or(
          `company_name.ilike.${like},website.ilike.${like},contact_email.ilike.${like},corporate_number.ilike.${like}`
        );
        qData.or(
          `company_name.ilike.${like},website.ilike.${like},contact_email.ilike.${like},corporate_number.ilike.${like}`
        );
      } else if (table === "rejected") {
        qCount.or(
          `company_name.ilike.${like},website.ilike.${like},contact_email.ilike.${like},industry_large.ilike.${like},industry_small.ilike.${like}`
        );
        qData.or(
          `company_name.ilike.${like},website.ilike.${like},contact_email.ilike.${like},industry_large.ilike.${like},industry_small.ilike.${like}`
        );
      } else {
        // similar
        qCount.or(
          `target_company_name.ilike.${like},found_company_name.ilike.${like},found_website.ilike.${like},contact_email.ilike.${like}`
        );
        qData.or(
          `target_company_name.ilike.${like},found_company_name.ilike.${like},found_website.ilike.${like},contact_email.ilike.${like}`
        );
      }
    }

    if (email === "has") {
      qCount.not("contact_email", "is", null).neq("contact_email", "");
      qData.not("contact_email", "is", null).neq("contact_email", "");
    } else if (email === "none") {
      qCount.or("contact_email.is.null,contact_email.eq.");
      qData.or("contact_email.is.null,contact_email.eq.");
    }

    if (form === "has") {
      qCount.not("contact_form_url", "is", null).neq("contact_form_url", "");
      qData.not("contact_form_url", "is", null).neq("contact_form_url", "");
    } else if (form === "none") {
      qCount.or("contact_form_url.is.null,contact_form_url.eq.");
      qData.or("contact_form_url.is.null,contact_form_url.eq.");
    }

    if (prefectures.length) {
      // text[] に対して overlaps
      qCount.overlaps("prefectures", prefectures as any);
      qData.overlaps("prefectures", prefectures as any);
    }

    if (industryQ) {
      const like = `%${industryQ.replace(/[%_]/g, "")}%`;
      if (table === "prospects") {
        qCount.ilike("industry", like);
        qData.ilike("industry", like);
      } else if (table === "rejected") {
        qCount.or(`industry_large.ilike.${like},industry_small.ilike.${like}`);
        qData.or(`industry_large.ilike.${like},industry_small.ilike.${like}`);
      }
    }

    if (dateFrom) {
      qCount.gte("created_at", dateFrom);
      qData.gte("created_at", dateFrom);
    }
    if (dateTo) {
      // その日の終端まで
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      qCount.lte("created_at", end.toISOString());
      qData.lte("created_at", end.toISOString());
    }

    if (
      table === "similar" &&
      (matchedAddr === "true" || matchedAddr === "false")
    ) {
      const val = matchedAddr === "true";
      qCount.eq("matched_addr", val);
      qData.eq("matched_addr", val);
    }

    // ---- ソート（許可カラムに限定） ----
    const ok = SORTABLE[table].has(sort) ? sort : defaultSort;
    qData.order(ok, { ascending: dir === "asc", nullsFirst: false });

    // ---- 取得（count → data） ----
    const { count, error: e1 } = await qCount;
    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }

    const { data, error: e2 } = await qData.range(offset, offset + limit - 1);
    if (e2) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
