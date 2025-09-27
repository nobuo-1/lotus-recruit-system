import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { emailQueue } from '@/server/queue';

export async function POST() {
  // 認証ユーザー（ログイン必須）
  const supabase = await supabaseServer();
  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes?.user?.email;
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // デモジョブをキューへ
  await emailQueue.add('demo', {
    to: email,
    subject: 'Lotus: 配信テスト',
    html: `<p>これは Mailpit 経由の配信テストです。</p>
           <p>日時：${new Date().toLocaleString()}</p>`,
    text: `これは Mailpit 経由の配信テストです。 ${new Date().toLocaleString()}`
  });

  return NextResponse.json({ ok: true });
}
