import Link from "next/link";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

type HeroAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

export function PageMain({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={clsx("mx-auto max-w-7xl px-5 py-6 md:px-8 md:py-8", className)}>
      {children}
    </main>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  accent = "blue",
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: HeroAction[];
  accent?: "blue" | "gold" | "green" | "rose";
  className?: string;
}) {
  const accentClass =
    accent === "gold"
      ? "from-[#fff6dc] via-[#fffaf0] to-white"
      : accent === "green"
        ? "from-[#e9f9ef] via-[#f6fcf8] to-white"
        : accent === "rose"
          ? "from-[#fde9e6] via-[#fff7f6] to-white"
          : "from-[#e8f0ff] via-[#f7f9ff] to-white";

  return (
    <section
      className={clsx(
        "relative overflow-hidden rounded-[32px] border border-white/70 bg-gradient-to-br px-6 py-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] md:px-8 md:py-8",
        accentClass,
        className
      )}
    >
      <div className="absolute right-[-48px] top-[-48px] h-40 w-40 rounded-full bg-white/65 blur-2xl" />
      <div className="absolute bottom-[-56px] left-[-24px] h-32 w-32 rounded-full bg-white/70 blur-2xl" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          {eyebrow && (
            <div className="inline-flex rounded-full border border-neutral-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
              {eyebrow}
            </div>
          )}
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950 md:text-[2.4rem] md:leading-[1.1]">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600 md:text-base">
            {description}
          </p>
        </div>

        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={`${action.href}:${action.label}`}
                href={action.href}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  action.variant === "secondary"
                    ? "border border-neutral-200 bg-white/80 text-neutral-800 hover:bg-white"
                    : "bg-neutral-950 text-white hover:bg-neutral-800"
                )}
              >
                {action.label}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function SurfaceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)] backdrop-blur",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-neutral-950 md:text-2xl">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ActionGrid({
  items,
  columns = "three",
}: {
  items: Array<{
    href: string;
    title: string;
    description: string;
    icon: LucideIcon;
  }>;
  columns?: "two" | "three" | "four";
}) {
  const gridClass =
    columns === "two"
      ? "md:grid-cols-2"
      : columns === "four"
        ? "md:grid-cols-2 xl:grid-cols-4"
        : "md:grid-cols-3";

  return (
    <div className={clsx("grid grid-cols-1 gap-4", gridClass)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={`${item.href}:${item.title}`}
            href={item.href}
            className="group rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,252,0.95))] p-5 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="rounded-2xl bg-neutral-950 p-3 text-white shadow-sm">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-neutral-400 transition group-hover:text-neutral-700" />
            </div>
            <div className="mt-5 text-base font-semibold text-neutral-950">
              {item.title}
            </div>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {item.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export function DataTableCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-[28px] border border-white/80 bg-white/94 shadow-[0_14px_40px_rgba(15,23,42,0.05)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatChip({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/85 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-neutral-950">{value}</div>
    </div>
  );
}
