import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: Request) {
  const { access_token, refresh_token } = await req.json();

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'missing tokens' }, { status: 400 });
  }

  // サーバ側の Supabase クライアントに「このセッションを採用して」と伝える
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // setSession が Cookie を設定してくれる（sb-access-token / sb-refresh-token）
  return NextResponse.json({ ok: true }, { status: 200 });
}
