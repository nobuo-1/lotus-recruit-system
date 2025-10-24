// web/src/app/job-boards/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import Client from "./Client";

export default function Page() {
  return (
    <>
      <AppHeader />
      <Suspense fallback={<Skeleton />}>
        <Client />
      </Suspense>
    </>
  );
}

function Skeleton() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 h-6 w-64 animate-pulse rounded bg-neutral-200" />
      <div className="mb-3 h-8 w-full animate-pulse rounded bg-neutral-100" />
      <div className="mb-6 h-56 w-full animate-pulse rounded-xl border border-neutral-200 bg-neutral-50" />
      <div className="h-64 w-full animate-pulse rounded-xl border border-neutral-200 bg-neutral-50" />
    </main>
  );
}
