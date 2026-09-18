import { AppShell } from "@/components/AppShell";
import { AsistenteChat } from "@/components/AsistenteChat";
import { getSession } from "@/lib/auth";
import { query, getSchema, TENANTS, loadTenants } from "@/lib/db";
import { getOpsSnapshot } from "@/lib/ops-snapshot";
import { formatMoney, formatNumber } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const session = await getSession();
  const tenants = await loadTenants();
  const tenantNombre =
    tenants.find((t) => t.slug === tenant)?.nombre ||
    TENANTS.find((t) => t.slug === tenant)?.nombre ||
    tenant;

  const snap = await getOpsSnapshot(tenant);
  const schema = getSchema(tenant);
  const first = session?.nombre?.split(" ")[0] || "";

  let loteos = 0;
  try {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM ${schema}.proyectos WHERE activo = true`
    );
    loteos = rows[0]?.c || 0;
  } catch {
    loteos = 0;
  }

  const pasos = [
    {
      label: "Autorizar",
      n: snap.enCarga,
      href: `/ventas?t=${tenant}&estado=EN_CARGA`,
      hint: "Laura",
    },
    {
      label: "Contabilizar",
      n: snap.autorizadas,
      href: `/ventas?t=${tenant}&estado=AUTORIZADA`,
      hint: "Admin",
    },
    {
      label: "Reintegro",
      n: snap.reintegros,
      href: `/caja/reintegros?t=${tenant}`,
      hint: "Caja",
    },
  ];

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-3xl mx-auto">
        <AsistenteChat
          tenant={tenant}
          variant="hero"
          title={first ? `Hola, ${first}` : "¿En qué te ayudo?"}
          subtitle={`Estoy en ${tenantNombre}. ${formatNumber(snap.cuotasVencidas)} cuotas atrasadas y ${formatNumber(snap.lotesDisponibles)} lotes libres.`}
        />

        <div className="mt-10 space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400 mb-3">
              Hoy en {tenantNombre} · {loteos} proyecto{loteos === 1 ? "" : "s"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {pasos.map((p) => (
                <Link
                  key={p.label}
                  href={p.href}
                  className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 hover:border-stone-300"
                >
                  <div className="font-serif text-3xl text-ink">{p.n}</div>
                  <div className="text-sm text-ink mt-1">{p.label}</div>
                  <div className="text-[11px] text-stone-400">{p.hint}</div>
                </Link>
              ))}
            </div>
          </div>

          {snap.moraClientes.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                  Llamar primero
                </p>
                <Link href={`/mora?t=${tenant}`} className="text-xs text-brand-700">
                  Ver atrasos
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {snap.moraClientes.slice(0, 4).map((c) => (
                  <Link
                    key={c.cliente}
                    href={`/mora?t=${tenant}`}
                    className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 flex gap-3 items-start"
                  >
                    <div className="w-10 h-10 rounded-full bg-ink text-cream-50 text-xs flex items-center justify-center shrink-0">
                      {iniciales(c.cliente)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink truncate">
                        {c.cliente}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {c.cuotas} cuotas · {c.dias} días
                      </div>
                      <div className="text-sm text-ink mt-1">
                        {formatMoney(c.saldo)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
