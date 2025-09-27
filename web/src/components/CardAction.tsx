// web/src/components/CardAction.tsx
import React from "react";
import Link from "next/link";
import type { ComponentType } from "react";
import { clsx } from "clsx";

// lucide-react のアイコンに合う最小の props 型
type IconProps = { className?: string; strokeWidth?: number };

type Props = {
  href: string;
  icon: ComponentType<IconProps>;
  title: string;
  desc?: string;
};

export default function CardAction({ href, icon: Icon, title, desc }: Props) {
  return (
    <Link
      href={href}
      className={clsx(
        "group block rounded-2xl border border-neutral-200 p-5 transition",
        "hover:bg-neutral-50 hover:shadow-sm"
      )}
    >
      <div className="flex items-center gap-4">
        <div className="rounded-xl border border-neutral-200 p-3">
          <Icon
            className="h-6 w-6 text-neutral-500 group-hover:text-neutral-700"
            strokeWidth={1.5}
          />
        </div>
        <div>
          <div className="text-base font-semibold text-neutral-900">
            {title}
          </div>
          {desc && <div className="text-sm text-neutral-500">{desc}</div>}
        </div>
      </div>
    </Link>
  );
}
