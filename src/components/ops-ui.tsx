import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker ? (
          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
            {kicker}
          </p>
        ) : null}
        <h1 className="font-serif text-4xl text-ink mt-1 tracking-tight">{title}</h1>
        {description ? (
          <p className="text-stone-500 mt-2 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export const opsPrimaryBtn = cn(
  "inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-ink text-cream-50 text-sm font-medium hover:bg-ink/90"
);

export const opsOutlineBtn = cn(
  "inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border border-stone-200 bg-white text-sm text-stone-700 hover:bg-cream-50"
);

export const opsPanel =
  "rounded-2xl border border-stone-200/80 bg-white/80 p-4 mb-6";

export const opsTableWrap =
  "rounded-2xl border border-stone-200/80 bg-white/80 overflow-hidden";
