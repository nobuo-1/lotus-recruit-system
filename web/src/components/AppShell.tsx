"use client";

import { usePathname } from "next/navigation";
import AppNavigation from "@/components/AppNavigation";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideNavigation = pathname.startsWith("/auth");

  if (hideNavigation) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-neutral-950 md:flex">
      <AppNavigation />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
