// web/src/lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // ←必須（環境変数に設定）
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "email-admin" } },
  });
}
