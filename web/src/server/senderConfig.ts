// web/src/server/senderConfig.ts
import { supabaseServer } from "@/lib/supabaseServer";

export type SenderConfig = {
  fromOverride?: string;
  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;
};

export async function loadSenderConfig(): Promise<SenderConfig> {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user) return {};

  // tenantId 取得
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  let from_address: string | undefined,
    brand_company: string | undefined,
    brand_address: string | undefined,
    brand_support: string | undefined;

  // 1) email_settings by user_id
  {
    const { data } = await sb
      .from("email_settings")
      .select("from_address,brand_company,brand_address,brand_support")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      from_address = data.from_address || from_address;
      brand_company = data.brand_company || brand_company;
      brand_address = data.brand_address || brand_address;
      brand_support = data.brand_support || brand_support;
    }
  }

  // 2) email_settings by tenant_id
  if (tenantId) {
    const { data } = await sb
      .from("email_settings")
      .select("from_address,brand_company,brand_address,brand_support")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data) {
      from_address ||= data.from_address || undefined;
      brand_company ||= data.brand_company || undefined;
      brand_address ||= data.brand_address || undefined;
      brand_support ||= data.brand_support || undefined;
    }
  }

  // 3) tenants 補完
  if (tenantId) {
    const { data: t } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (t) {
      from_address ||= (t as any).from_email || undefined;
      brand_company ||= (t as any).company_name || undefined;
      brand_address ||= (t as any).company_address || undefined;
      brand_support ||= (t as any).support_email || undefined;
    }
  }

  return {
    fromOverride: from_address || undefined,
    brandCompany: brand_company || undefined,
    brandAddress: brand_address || undefined,
    brandSupport: brand_support || undefined,
  };
}
