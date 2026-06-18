"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Landmark,
  Tag,
  FileText,
  FileSignature,
  ScrollText,
  Receipt,
  Wallet,
  Handshake,
  Percent,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TENANTS = [
  { slug: "jacaranda", nombre: "Jacaranda" },
  { slug: "tipuana", nombre: "Tipuana" },
  { slug: "alisos", nombre: "Alisos" },
  { slug: "boulevard", nombre: "Boulevard" },
];

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Fideicomisos", href: "/fideicomisos", icon: Landmark, global: true },
  { label: "Personas", href: "/personas", icon: Users },
  { label: "Proyectos", href: "/proyectos", icon: Building2 },
  { label: "Lotes", href: "/lotes", icon: Tag },
  { label: "Ventas", href: "/ventas", icon: FileText },
  { label: "Convenios", href: "/convenios", icon: Handshake },
  // { label: "Boletos", href: "/boletos", icon: ScrollText },
  // { label: "Plantillas Boleto", href: "/plantillas-boleto", icon: FileSignature },
  { label: "Cobranzas", href: "/cobranzas", icon: Receipt },
  { label: "Caja", href: "/caja/reintegros", icon: Wallet },
  { label: "Cuotas", href: "/cuotas", icon: Percent },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTenant = searchParams.get("t") || "jacaranda";
  const [tenantOpen, setTenantOpen] = useState(false);

  const tenantNombre =
    TENANTS.find((t) => t.slug === currentTenant)?.nombre || "Jacaranda";

  function changeTenant(slug: string) {
    const params = new URLSearchParams(searchParams);
    params.set("t", slug);
    params.delete("q");
    params.delete("proy");
    params.delete("estado");
    params.delete("ajuste");
    params.delete("medio");
    params.delete("desde");
    params.delete("hasta");
    params.delete("huerf");
    params.delete("mora");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
    setTenantOpen(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/caja/")) return pathname.startsWith("/caja");
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 min-h-screen flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <div>
            <div className="font-semibold">ERP Agostini</div>
            <div className="text-xs text-slate-400">Grupo ADI</div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-2 px-2">
          Fideicomiso
        </div>
        <div className="relative">
          <button
            onClick={() => setTenantOpen(!tenantOpen)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition"
          >
            <span className="font-medium">{tenantNombre}</span>
            <ChevronDown size={16} className={cn("transition", tenantOpen && "rotate-180")} />
          </button>
          {tenantOpen && (
            <div className="absolute left-0 right-0 mt-1 bg-slate-800 rounded-lg shadow-lg overflow-hidden z-10">
              {TENANTS.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => changeTenant(t.slug)}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-slate-700 text-sm",
                    t.slug === currentTenant && "bg-slate-700 text-brand-400"
                  )}
                >
                  {t.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          if ((item as any).disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 cursor-not-allowed"
              >
                <Icon size={18} />
                <span>{item.label}</span>
                <span className="text-xs ml-auto opacity-60">prÃƒÂ³ximo</span>
              </div>
            );
          }
          const href = (item as any).global ? item.href : `${item.href}?t=${currentTenant}`;
          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                active
                  ? "bg-brand-600 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition"
        >
          <LogOut size={18} />
          <span>Salir</span>
        </button>
      </div>
    </aside>
  );
}
