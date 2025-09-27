import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue, type DirectEmailJob } from "@/server/queue";

export async function POST(_req: Request) {
  // 認証ユーザー（ログイン必須）
  const supabase = await supabaseServer();
  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // DirectEmailJob で必要なフィールドを構築（kind は必須）
  const job: DirectEmailJob = {
    kind: "direct_email",
    to: email,
    subject: "Lotus: 配信テスト",
    html: `<p>これは Mailpit 経由の配信テストです。</p>
           <p>日時：${new Date().toLocaleString()}</p>`,
    text: `これは Mailpit 経由の配信テストです。 ${new Date().toLocaleString()}`,
    // 以下は任意（テナントのブランド/差出人上書きが不要なら省略でOK）
    // tenantId: undefined,
    // fromOverride: undefined,
    // brandCompany: undefined,
    // brandAddress: undefined,
    // brandSupport: undefined,
    // unsubscribeToken: undefined,
  };

  // ワーカー側の実装に合わせて "direct_email" キュー名で投入
  await emailQueue.add("direct_email", job, {
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });

  return NextResponse.json({ ok: true });
}
