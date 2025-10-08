// web/app/api/campaigns/send/route.ts
// App Router を web/app 側に公開するための橋渡し。
// 実装本体は既存の web/src/app/... をそのまま利用します。

export { POST, OPTIONS } from "../../../../src/app/api/campaigns/send/route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
