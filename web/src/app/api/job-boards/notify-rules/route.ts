// web/src/app/api/job-boards/notify-rules/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Supabase REST 設定
 * - ここでは pg を使わず REST 経由で CRUD します
 * - RLS を通る前提ですが、SERVICE_ROLE_KEY があればそちらを優先（RLS をバイパス）
 */
const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const DEFAULT_TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

function sbHeaders(json = true) {
  const base: Record<string, string> = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
  };
  if (json) {
    base["Content-Type"] = "application/json";
    base["Prefer"] = "return=representation";
  }
  return base;
}

function getTenantId(req: Request) {
  return req.headers.get("x-tenant-id") || DEFAULT_TENANT_ID;
}

/**
 * GET /api/job-boards/notify-rules
 * ルール一覧（destination 関連も同梱）
 */
export async function GET(req: Request) {
  try {
    const tenantId = getTenantId(req);

    // ルール本体
    const resRules = await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rules?select=*&tenant_id=eq.${encodeURIComponent(
        tenantId
      )}&order=created_at.desc`,
      { headers: sbHeaders(false), cache: "no-store" }
    );
    if (!resRules.ok) throw new Error(await resRules.text());
    const rules = (await resRules.json()) as any[];

    if (rules.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const ruleIds = rules.map((r) => r.id).join(",");
    // 中間テーブル
    const resLinks = await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rule_destinations?select=rule_id,destination_id&rule_id=in.(${ruleIds})`,
      { headers: sbHeaders(false), cache: "no-store" }
    );
    const links = resLinks.ok ? ((await resLinks.json()) as any[]) : [];

    // destination 本体
    const destIds = Array.from(new Set(links.map((l) => l.destination_id)));
    let dests: any[] = [];
    if (destIds.length) {
      const resD = await fetch(
        `${SB_URL}/rest/v1/job_board_destinations?select=*&id=in.(${destIds.join(
          ","
        )})`,
        { headers: sbHeaders(false), cache: "no-store" }
      );
      if (resD.ok) dests = await resD.json();
    }

    const linkMap = new Map<string, string[]>();
    for (const l of links) {
      const arr = linkMap.get(l.rule_id) || [];
      arr.push(l.destination_id);
      linkMap.set(l.rule_id, arr);
    }

    const destMap = new Map<string, any>();
    for (const d of dests) destMap.set(d.id, d);

    const rows = rules.map((r) => {
      const ids = linkMap.get(r.id) || [];
      const details = ids.map((id) => destMap.get(id)).filter(Boolean);
      return { ...r, destination_ids: ids, destinations: details };
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/job-boards/notify-rules
 * ルール新規作成（destination_ids を渡すと中間テーブルにも登録）
 * Body 例:
 * {
 *   "name":"A",
 *   "email":"to@example.com",
 *   "sites":["mynavi","doda"],
 *   "age_bands":[], "employment_types":[], "salary_bands":[],
 *   "large":[], "small":[],
 *   "enabled":true,
 *   "schedule_type":"weekly", "schedule_time":"09:00", "schedule_days":[1], "timezone":"Asia/Tokyo",
 *   "destination_ids":["...","..."]
 * }
 */
export async function POST(req: Request) {
  try {
    const tenantId = getTenantId(req);
    const body = (await req.json()) as any;

    // テナントIDを強制付与（null で落ちないように）
    const rulePayload = {
      tenant_id: tenantId,
      name: body.name ?? null,
      email: body.email ?? null,
      sites: body.sites ?? [],
      age_bands: body.age_bands ?? [],
      employment_types: body.employment_types ?? [],
      salary_bands: body.salary_bands ?? [],
      // 任意：グラフ用のカテゴリ保存（必要ならテーブルに列を追加して使用）
      large: body.large ?? null,
      small: body.small ?? null,
      enabled: body.enabled ?? true,
      schedule_type: body.schedule_type ?? "weekly",
      schedule_time: body.schedule_time ?? "09:00",
      schedule_days:
        body.schedule_type === "weekly" ? body.schedule_days ?? [1] : null,
      timezone: body.timezone ?? "Asia/Tokyo",
    };

    const resIns = await fetch(`${SB_URL}/rest/v1/job_board_notify_rules`, {
      method: "POST",
      headers: sbHeaders(true),
      body: JSON.stringify(rulePayload),
    });
    if (!resIns.ok) throw new Error(await resIns.text());
    const [inserted] = (await resIns.json()) as any[];
    const ruleId = inserted?.id as string;

    // 送り先（任意）
    const destIds: string[] = Array.isArray(body.destination_ids)
      ? body.destination_ids
      : [];
    if (ruleId && destIds.length) {
      const linkRows = destIds.map((d) => ({
        rule_id: ruleId,
        destination_id: d,
      }));
      const resLink = await fetch(
        `${SB_URL}/rest/v1/job_board_notify_rule_destinations`,
        {
          method: "POST",
          headers: sbHeaders(true),
          body: JSON.stringify(linkRows),
        }
      );
      if (!resLink.ok) throw new Error(await resLink.text());
    }

    return NextResponse.json({ row: inserted });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/job-boards/notify-rules
 * ルールの部分更新（destination_ids を渡すと差し替え）
 * Body 例: { "id":"...", "enabled":false, "destination_ids":[...] }
 */
export async function PATCH(req: Request) {
  try {
    const _tenantId = getTenantId(req); // 参照のみ（更新時に特に使わない）
    const body = (await req.json()) as any;
    const { id, destination_ids, ...patch } = body || {};
    if (!id)
      return NextResponse.json({ error: "id is required" }, { status: 400 });

    // ルール本体更新
    if (Object.keys(patch).length) {
      const res = await fetch(
        `${SB_URL}/rest/v1/job_board_notify_rules?id=eq.${encodeURIComponent(
          id
        )}`,
        {
          method: "PATCH",
          headers: sbHeaders(true),
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) throw new Error(await res.text());
    }

    // 送り先差し替え
    if (Array.isArray(destination_ids)) {
      // 既存リンク削除
      await fetch(
        `${SB_URL}/rest/v1/job_board_notify_rule_destinations?rule_id=eq.${encodeURIComponent(
          id
        )}`,
        { method: "DELETE", headers: sbHeaders(false) }
      );
      if (destination_ids.length) {
        const rows = destination_ids.map((d: string) => ({
          rule_id: id,
          destination_id: d,
        }));
        const resLink = await fetch(
          `${SB_URL}/rest/v1/job_board_notify_rule_destinations`,
          {
            method: "POST",
            headers: sbHeaders(true),
            body: JSON.stringify(rows),
          }
        );
        if (!resLink.ok) throw new Error(await resLink.text());
      }
    }

    // 更新後の 1 行を返す
    const resOne = await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rules?select=*&id=eq.${encodeURIComponent(
        id
      )}`,
      { headers: sbHeaders(false) }
    );
    const rows = resOne.ok ? await resOne.json() : [];
    return NextResponse.json({ row: rows?.[0] ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/job-boards/notify-rules?id=...
 * ルール削除（中間テーブルも削除）
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id is required" }, { status: 400 });

    // リンク削除
    await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rule_destinations?rule_id=eq.${encodeURIComponent(
        id
      )}`,
      { method: "DELETE", headers: sbHeaders(false) }
    );

    // ルール削除
    const res = await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rules?id=eq.${encodeURIComponent(
        id
      )}`,
      { method: "DELETE", headers: sbHeaders(false) }
    );
    if (!res.ok) throw new Error(await res.text());

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
