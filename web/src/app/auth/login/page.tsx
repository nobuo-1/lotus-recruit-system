// src/app/auth/login/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import LoginClient from "./LoginClient";

export default function Page() {
  // サーバー側では何もせず、クライアントに描画を委譲
  return <LoginClient />;
}
