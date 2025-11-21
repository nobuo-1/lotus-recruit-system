// web/src/app/api/job-boards/mappings/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { SiteKey } from "@/server/job-boards/types";

export type JobBoardMappingRow = {
  id?: string;
  site_key: SiteKey;
  external_large_code: string | null;
  external_large_label: string | null;
  external_middle_code: string | null;
  external_middle_label: string | null;
  external_small_code: string | null;
  external_small_label: string | null;
  internal_large: string;
  internal_small: string;
  enabled: boolean;
  note: string | null;
  created_at?: string;
  updated_at?: string;
};

type PutBody = {
  rows: JobBoardMappingRow[];
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const site = url.searchParams.get("site") as SiteKey | null;
    const q = url.searchParams.get("q") ?? "";

    const sb = await supabaseServer();

    let query = sb
      .from("job_board_mappings")
      .select("*")
      .order("external_large_label", { ascending: true })
      .order("external_middle_label", { ascending: true })
      .order("external_small_label", { ascending: true });

    if (site) {
      query = query.eq("site_key", site);
    }

    if (q.trim()) {
      const keyword = `%${q.trim()}%`;
      // ラベル・自社カテゴリ名に対する簡易検索
      query = query.or(
        [
          `external_large_label.ilike.${keyword}`,
          `external_middle_label.ilike.${keyword}`,
          `external_small_label.ilike.${keyword}`,
          `internal_large.ilike.${keyword}`,
          `internal_small.ilike.${keyword}`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("job_board_mappings GET error", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      rows: (data ?? []) as JobBoardMappingRow[],
    });
  } catch (e: any) {
    console.error("job_board_mappings GET exception", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as PutBody;
    const rows = body?.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "更新対象の行がありません。" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();

    const updatedIds: string[] = [];

    for (const row of rows) {
      const payload = {
        site_key: row.site_key,
        external_large_code: row.external_large_code ?? null,
        external_large_label: row.external_large_label ?? null,
        external_middle_code: row.external_middle_code ?? null,
        external_middle_label: row.external_middle_label ?? null,
        external_small_code: row.external_small_code ?? null,
        external_small_label: row.external_small_label ?? null,
        internal_large: row.internal_large,
        internal_small: row.internal_small,
        enabled: row.enabled ?? true,
        note: row.note ?? null,
      };

      if (row.id) {
        const { error, data } = await sb
          .from("job_board_mappings")
          .update(payload)
          .eq("id", row.id)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("job_board_mappings UPDATE error", error, payload);
          return NextResponse.json(
            {
              ok: false,
              error: `更新に失敗しました: ${error.message}`,
            },
            { status: 500 }
          );
        }
        if (data?.id) updatedIds.push(data.id);
      } else {
        const { error, data } = await sb
          .from("job_board_mappings")
          .insert(payload)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("job_board_mappings INSERT error", error, payload);
          return NextResponse.json(
            {
              ok: false,
              error: `新規作成に失敗しました: ${error.message}`,
            },
            { status: 500 }
          );
        }
        if (data?.id) updatedIds.push(data.id);
      }
    }

    return NextResponse.json({
      ok: true,
      updatedIds,
      message: "マッピングを保存しました。",
    });
  } catch (e: any) {
    console.error("job_board_mappings PUT exception", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id が指定されていません。" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();
    const { error } = await sb.from("job_board_mappings").delete().eq("id", id);

    if (error) {
      console.error("job_board_mappings DELETE error", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("job_board_mappings DELETE exception", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
