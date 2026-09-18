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
          className="fixed inset-0 z-30 bg-stone-900/30 md:hidden"
          aria-label="Cerrar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div
        className={`fixed z-40 inset-y-0 left-0 transform transition md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Suspense fallback={<div className="w-64 min-h-screen bg-white" />}>
          <Sidebar onNavigate={() => setOpen(false)} />
        </Suspense>
      </div>
      <div className="flex-1 min-w-0">
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur border-b border-stone-200">
          <button
            type="button"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-stone-200"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={18} />
          </button>
          <span className="font-semibold text-stone-800">ERP Agostini</span>
        </div>
        <main className="overflow-auto">{children}</main>
      </div>
    </div>
  );
}
