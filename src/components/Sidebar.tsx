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

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  global?: boolean;
};

const PRIMARY: NavItem[] = [
  { label: "Hoy", href: "/", icon: LayoutDashboard },
  { label: "Ventas", href: "/ventas", icon: FileText },
  { label: "Atrasos", href: "/mora", icon: AlertTriangle },
  { label: "Cobrar", href: "/cobranzas", icon: Receipt },
  { label: "Lotes", href: "/lotes", icon: Tag },
  { label: "Personas", href: "/personas", icon: Users },
];

const MORE: NavItem[] = [
  { label: "Fideicomisos", href: "/fideicomisos", icon: Landmark, global: true },
  { label: "Proyectos", href: "/proyectos", icon: Building2 },
  { label: "Convenios", href: "/convenios", icon: Handshake },
  { label: "Cuotas", href: "/cuotas", icon: Percent },
  { label: "Caja", href: "/caja/reintegros", icon: Wallet },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTenant = searchParams.get("t") || "jacaranda";
  const [tenantOpen, setTenantOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
    if (href === "/") return pathname === "/" || pathname.startsWith("/asistente");
    if (href === "/personas") return pathname.startsWith("/personas");
    if (href.startsWith("/caja/")) return pathname.startsWith("/caja");
    return pathname.startsWith(href);
  }

  const moreActive = MORE.some((item) => isActive(item.href));

  const initials = (me?.nombre || "A")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  function NavLink({ item }: { item: NavItem }) {
    const Icon = item.icon;
    const active = isActive(item.href);
    const href = item.global ? item.href : `${item.href}?t=${currentTenant}`;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition min-h-10",
          active
            ? "bg-cream-50 text-ink"
            : "text-stone-400 hover:text-cream-50 hover:bg-white/5"
        )}
      >
        <Icon size={16} />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <aside className="w-[232px] bg-ink text-stone-300 min-h-screen flex flex-col">
      <div className="px-5 py-6">
        <div className="text-[11px] tracking-[0.28em] text-stone-500">GRUPO ADI</div>
        <div className="mt-1 font-serif text-[22px] text-cream-50 leading-none">
          Agostini<span className="text-brand-400">.</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={() => setTenantOpen(!tenantOpen)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-ink-muted hover:bg-white/5 rounded-xl text-sm transition border border-white/10"
        >
          <span className="font-medium text-cream-50">{tenantNombre}</span>
          <ChevronDown size={16} className={cn("transition", tenantOpen && "rotate-180")} />
        </button>
        {tenantOpen && (
          <div className="mt-1 bg-ink-muted rounded-xl overflow-hidden border border-white/10">
            {tenants.map((t) => (
              <button
                key={t.slug}
                onClick={() => changeTenant(t.slug)}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-white/5 text-sm",
                  t.slug === currentTenant && "text-cream-50 font-medium"
                )}
              >
                {t.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm min-h-10 mt-3",
            moreActive
              ? "text-cream-50"
              : "text-stone-500 hover:text-cream-50 hover:bg-white/5"
          )}
        >
          <span className="uppercase tracking-[0.16em] text-[10px]">Más</span>
          <ChevronDown size={14} className={cn("transition", moreOpen && "rotate-180")} />
        </button>
        {(moreOpen || moreActive) &&
          MORE.map((item) => <NavLink key={item.href} item={item} />)}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-2">
        {me && (
          <div className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm text-cream-50 truncate">{me.nombre}</div>
              <div className="text-[11px] text-stone-500">{me.rol}</div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-stone-400 hover:text-cream-50 hover:bg-white/5 transition min-h-10"
        >
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </div>
    </aside>
  );
}
