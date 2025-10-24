// web/src/app/form-outreach/runs/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import RunsInner from "./Client";

export default function Page() {
  return (
    <>
      <AppHeader />
      <Suspense fallback={<PageSkeleton />}>
        <RunsInner />
      </Suspense>
    </>
  );
}

function PageSkeleton() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 h-6 w-60 animate-pulse rounded bg-neutral-200" />
      <div className="mb-3 h-8 w-full animate-pulse rounded bg-neutral-100" />
      <div className="h-64 w-full animate-pulse rounded-lg border border-neutral-200 bg-neutral-50" />
    </main>
  );
}
