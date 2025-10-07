// web/src/server/senderConfig.ts
import { supabaseServer } from "@/lib/supabaseServer";

export type SenderConfig = {
  fromOverride?: string;
  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;
};

/**
 * ログインユーザーの /email/settings に保存された設定を読み出す。
 * テーブル名/カラム名は以下を想定：
 *   table: email_settings
 *   columns: user_id, tenant_id, from_address, brand_company, brand_address, brand_support
 * 片方しか無い場合は存在するキーで検索します。
 */
export async function loadSenderConfig(): Promise<SenderConfig> {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user) return {};

  // user_id で探し、無ければ tenant_id で探す（両対応）
  let q = sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();

  let { data, error } = await q;
  if (!data) {
    // tenant_id が profile 等にあれば使う（無ければスキップ）
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (prof?.tenant_id) {
      const r2 = await sb
        .from("email_settings")
        .select("from_address,brand_company,brand_address,brand_support")
        .eq("tenant_id", prof.tenant_id)
        .maybeSingle();
      data = r2.data ?? null;
    }
  }

  return {
    fromOverride: data?.from_address || undefined,
    brandCompany: data?.brand_company || undefined,
    brandAddress: data?.brand_address || undefined,
    brandSupport: data?.brand_support || undefined,
  };
}
