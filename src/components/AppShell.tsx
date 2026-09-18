"use client";

import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-cream-50">
      {open && (
        <button
          className="fixed inset-0 z-30 bg-ink/40 md:hidden"
          aria-label="Cerrar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div
        className={`fixed z-40 inset-y-0 left-0 transform transition md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Suspense fallback={<div className="w-[248px] min-h-screen bg-ink" />}>
          <Sidebar onNavigate={() => setOpen(false)} />
        </Suspense>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 md:px-8 py-3 bg-cream-50/90 backdrop-blur border-b border-stone-200/70">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={18} />
            </button>
            <span className="font-semibold text-ink md:hidden">Agostini Ops</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-stone-500">
            <span className="hidden sm:inline">entorno · staging</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              en vivo
            </span>
            <span className="text-stone-400">v0.2 · vitrina</span>
          </div>
        </div>
        <main className="overflow-auto flex-1">{children}</main>
      </div>
    </div>
  );
}
