"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import Logo from "@/components/Logo";
import LogoutButton from "@/components/LogoutButton";
import { ChevronRight } from "lucide-react";
import {
  APP_NAV_ITEMS,
  type AppNavItem,
} from "@/components/appNavigationConfig";

function normalizePath(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function isExactPathMatch(pathname: string, href: string) {
  return normalizePath(pathname) === normalizePath(href);
}

function NavTree({
  items,
  pathname,
  expandedItems,
  onToggle,
  isSidebarExpanded,
  depth = 0,
}: {
  items: AppNavItem[];
  pathname: string;
  expandedItems: Set<string>;
  onToggle: (href: string) => void;
  isSidebarExpanded: boolean;
  depth?: number;
}) {
  return (
    <div
      className={clsx(
        "space-y-1",
        depth > 0 && "mt-2 border-l border-neutral-200 pl-3"
      )}
    >
      {items.map((item) => {
        const hasChildren = Boolean(item.children?.length);
        const isExpanded = expandedItems.has(item.href);
        const exactActive = isExactPathMatch(pathname, item.href);

        return (
          <div key={item.href} className="space-y-1">
            {hasChildren ? (
              <button
                type="button"
                title={item.title}
                onClick={() => onToggle(item.href)}
                className={clsx(
                  "group flex w-full gap-3 rounded-2xl px-3 py-3 text-left text-sm transition",
                  depth === 0 && "font-semibold",
                  depth > 0 && "font-medium",
                  isExpanded
                    ? "bg-neutral-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                  isSidebarExpanded ? "items-start" : "md:items-center md:justify-center md:px-2"
                )}
              >
                {item.icon && (
                  <span
                    className={clsx(
                      "mt-0.5 rounded-xl p-2",
                      isExpanded
                        ? "bg-white/14 text-white"
                        : "bg-neutral-100 text-neutral-500 group-hover:bg-white group-hover:text-neutral-900"
                    )}
                  >
                    <item.icon className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                )}

                <span
                  className={clsx(
                    "min-w-0 flex-1 transition-all duration-200",
                    !isSidebarExpanded &&
                      "md:pointer-events-none md:max-h-0 md:max-w-0 md:overflow-hidden md:opacity-0"
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate">{item.title}</span>
                    <ChevronRight
                      className={clsx(
                        "h-4 w-4 shrink-0 transition",
                        isExpanded && "rotate-90"
                      )}
                    />
                  </span>
                  {depth === 0 && item.description && (
                    <span
                      className={clsx(
                        "mt-1 block text-xs leading-5",
                        isExpanded ? "text-white/75" : "text-neutral-400"
                      )}
                    >
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            ) : (
              <Link
                href={item.href}
                title={item.title}
                className={clsx(
                  "group flex gap-3 rounded-2xl px-3 py-3 text-sm transition",
                  depth === 0 && "font-semibold",
                  depth > 0 && "font-medium",
                  exactActive
                    ? "bg-neutral-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                  isSidebarExpanded ? "items-start" : "md:items-center md:justify-center md:px-2"
                )}
              >
                {item.icon && (
                  <span
                    className={clsx(
                      "mt-0.5 rounded-xl p-2",
                      exactActive
                        ? "bg-white/14 text-white"
                        : "bg-neutral-100 text-neutral-500 group-hover:bg-white group-hover:text-neutral-900"
                    )}
                  >
                    <item.icon className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                )}

                <span
                  className={clsx(
                    "min-w-0 flex-1 transition-all duration-200",
                    !isSidebarExpanded &&
                      "md:pointer-events-none md:max-h-0 md:max-w-0 md:overflow-hidden md:opacity-0"
                  )}
                >
                  <span className="truncate">{item.title}</span>
                  {depth === 0 && item.description && (
                    <span
                      className={clsx(
                        "mt-1 block text-xs leading-5",
                        exactActive ? "text-white/75" : "text-neutral-400"
                      )}
                    >
                      {item.description}
                    </span>
                  )}
                </span>
              </Link>
            )}

            {hasChildren && isExpanded && isSidebarExpanded && (
              <div>
                <NavTree
                  items={item.children ?? []}
                  pathname={pathname}
                  expandedItems={expandedItems}
                  onToggle={onToggle}
                  isSidebarExpanded={isSidebarExpanded}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AppNavigation() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const isSidebarExpanded = hovered;

  const toggleItem = (href: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={clsx(
        "shrink-0 border-b border-neutral-200 bg-[linear-gradient(180deg,#fdfefe_0%,#f5f7fb_100%)] transition-[width] duration-200 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r",
        isSidebarExpanded ? "md:w-[340px]" : "md:w-[88px]"
      )}
    >
      <div className="flex h-full flex-col">
        <div
          className={clsx(
            "border-b border-neutral-200 py-5",
            isSidebarExpanded ? "px-5" : "px-3"
          )}
        >
          <Logo compact={!isSidebarExpanded} />
        </div>

        <div className="border-b border-neutral-200 px-5 py-4 md:hidden">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Menu
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            各機能ページと配下の画面をまとめています。
          </p>
        </div>

        <nav
          className={clsx(
            "flex-1 overflow-y-auto py-5",
            isSidebarExpanded ? "px-4" : "px-2"
          )}
        >
          <div
            className={clsx(
              "mb-4 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400 transition-all duration-200",
              !isSidebarExpanded &&
                "md:pointer-events-none md:max-h-0 md:overflow-hidden md:opacity-0"
            )}
          >
            Workspace
          </div>
          <NavTree
            items={APP_NAV_ITEMS}
            pathname={pathname}
            expandedItems={expandedItems}
            onToggle={toggleItem}
            isSidebarExpanded={isSidebarExpanded}
          />
        </nav>

        <div
          className={clsx(
            "border-t border-neutral-200 py-4",
            isSidebarExpanded ? "px-5" : "px-3"
          )}
        >
          <LogoutButton compact={!isSidebarExpanded} />
        </div>
      </div>
    </aside>
  );
}
