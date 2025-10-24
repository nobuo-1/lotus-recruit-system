// web/src/app/form-outreach/settings/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import Client from "./client";

export default function Page() {
  return (
    <>
      <AppHeader />
      <Suspense fallback={<div className="p-6">Loading...</div>}>
        <Client />
      </Suspense>
    </>
  );
}
