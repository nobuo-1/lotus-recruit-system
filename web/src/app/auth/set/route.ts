// web/src/app/api/auth/set/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

type Body = {
  access_token?: string;
  refresh_token?: string;
};

export async function POST(req: Request) {
  try {
    const { access_token, refresh_token } = (await req.json()) as Body;
    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: "access_token / refresh_token required" },
        { status: 400 }
      );
    }

    const sb = await supabaseRoute();
    const { error } = await sb.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // setSession 成功時、@supabase/ssr の cookies.set が呼ばれ、
    // sb-access-token / sb-refresh-token が HttpOnly で発行されます。
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
