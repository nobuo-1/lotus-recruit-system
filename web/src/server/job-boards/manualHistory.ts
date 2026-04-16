import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

export type ManualHistoryActionType = "jobs" | "candidates";
export type ManualHistoryStatus = "success" | "partial" | "failed";

export type ManualHistoryParams = {
  action_type: ManualHistoryActionType;
  status: ManualHistoryStatus;
  sites?: string[];
  large?: string[];
  small?: string[];
  pref?: string[];
  total_jobs?: number;
  fetched_count?: number;
  success_count?: number;
  failure_count?: number;
  preview_count?: number;
  note?: string | null;
  debug_logs?: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function isValidUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function resolveTenantIdForManualHistory(
  req: Request,
  body?: unknown
): Promise<string | null> {
  const h = (req.headers.get("x-tenant-id") || "").trim();
  if (isValidUuid(h)) return h;

  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i);
  if (m) {
    const decoded = decodeURIComponent(m[2]);
    if (isValidUuid(decoded)) return decoded;
  }

  if (isRecord(body) && isValidUuid(body.tenant_id)) {
    return String(body.tenant_id);
  }

  try {
    const sb = await supabaseServer();
    const { data: userRes } = await sb.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return null;

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();

    return isValidUuid(profile?.tenant_id) ? profile.tenant_id : null;
  } catch {
    return null;
  }
}

export async function saveJobBoardManualHistory(input: {
  req: Request;
  body?: unknown;
  params: ManualHistoryParams;
  results: unknown[];
  resultCount?: number;
}) {
  const tenantId = await resolveTenantIdForManualHistory(input.req, input.body);
  if (!tenantId) {
    throw new Error("tenant_id is required to save manual history.");
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const safeResultCount = Number.isFinite(input.resultCount)
    ? Math.max(0, Math.floor(input.resultCount as number))
    : input.results.length;

  const trimmedParams: ManualHistoryParams = {
    ...input.params,
    debug_logs: Array.isArray(input.params.debug_logs)
      ? input.params.debug_logs.slice(0, 200)
      : undefined,
  };

  const { data, error } = await admin
    .from("job_board_manual_runs")
    .insert({
      tenant_id: tenantId,
      params: trimmedParams,
      results: input.results,
      result_count: safeResultCount,
    })
    .select("id")
    .single();

  if (error) throw error;

  return {
    id: (data?.id as string | undefined) ?? null,
    tenantId,
  };
}
