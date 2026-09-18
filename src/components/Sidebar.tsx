"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Landmark,
  Tag,
  FileText,
  Receipt,
  Wallet,
  Handshake,
  Percent,
  LogOut,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tenant = { slug: string; nombre: string };
type Me = { username: string; nombre: string; rol: string };

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Fideicomisos", href: "/fideicomisos", icon: Landmark, global: true },
  { label: "Personas", href: "/personas", icon: Users },
  { label: "Proyectos", href: "/proyectos", icon: Building2 },
  { label: "Lotes", href: "/lotes", icon: Tag },
  { label: "Ventas", href: "/ventas", icon: FileText },
  { label: "Convenios", href: "/convenios", icon: Handshake },
  { label: "Cobranzas", href: "/cobranzas", icon: Receipt },
  { label: "Mora", href: "/mora", icon: AlertTriangle },
  { label: "Caja", href: "/caja/reintegros", icon: Wallet },
  { label: "Cuotas", href: "/cuotas", icon: Percent },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTenant = searchParams.get("t") || "jacaranda";
  const [tenantOpen, setTenantOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([
    { slug: "jacaranda", nombre: "Jacaranda" },
    { slug: "tipuana", nombre: "Tipuana" },
    { slug: "alisos", nombre: "Alisos" },
    { slug: "boulevard", nombre: "Boulevard" },
  ]);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tenants?.length) setTenants(data.tenants);
      })
      .catch(() => {});
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.usuario) setMe(data.usuario);
      })
      .catch(() => {});
  }, []);

  const tenantNombre =
    tenants.find((t) => t.slug === currentTenant)?.nombre || currentTenant;

  function changeTenant(slug: string) {
    const params = new URLSearchParams(searchParams);
    params.set("t", slug);
    ["q", "proy", "estado", "ajuste", "medio", "desde", "hasta", "huerf", "mora", "page"].forEach(
      (k) => params.delete(k)
    );
    router.push(`${pathname}?${params.toString()}`);
    setTenantOpen(false);
    onNavigate?.();
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
    <aside className="w-64 bg-white text-stone-800 min-h-screen flex flex-col border-r border-stone-200/80">
      <div className="p-6 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <div>
            <div className="font-semibold">ERP Agostini</div>
            <div className="text-xs text-stone-500">Grupo ADI</div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="text-xs uppercase tracking-wider text-stone-400 mb-2 px-2">
          Fideicomiso
        </div>
        <div className="relative">
          <button
            onClick={() => setTenantOpen(!tenantOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-cream-50 hover:bg-sage-50 rounded-xl text-sm transition border border-stone-200"
          >
            <span className="font-medium">{tenantNombre}</span>
            <ChevronDown size={16} className={cn("transition", tenantOpen && "rotate-180")} />
          </button>
          {tenantOpen && (
            <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-lg overflow-hidden z-10 border border-stone-200">
              {tenants.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => changeTenant(t.slug)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 hover:bg-cream-50 text-sm",
                    t.slug === currentTenant && "bg-sage-50 text-sage-800 font-medium"
                  )}
                >
                  {t.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const href = (item as { global?: boolean }).global
            ? item.href
            : `${item.href}?t=${currentTenant}`;
          return (
            <Link
              key={item.label}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition min-h-11",
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-stone-600 hover:bg-cream-50"
              )}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-stone-100 space-y-2">
        {me && (
          <div className="px-3 text-xs text-stone-500">
            <div className="font-medium text-stone-700">{me.nombre}</div>
            <div>{me.rol}</div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-stone-600 hover:bg-cream-50 transition min-h-11"
        >
          <LogOut size={18} />
          <span>Salir</span>
        </button>
      </div>
    </aside>
  );
}
