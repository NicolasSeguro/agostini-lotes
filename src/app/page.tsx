import { AppShell } from "@/components/AppShell";
import { AsistenteChat } from "@/components/AsistenteChat";
import { getSession } from "@/lib/auth";
import { query, getSchema, TENANTS, loadTenants } from "@/lib/db";
import { getOpsSnapshot } from "@/lib/ops-snapshot";
import { responderAsistente } from "@/lib/asistente";
import { formatMoney, formatNumber } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

function saludoHora(nombre: string) {
  const h = new Date().getHours();
  const first = nombre.split(" ")[0] || "";
  if (h < 12) return `Buen día, ${first}`;
  if (h < 19) return `Buenas tardes, ${first}`;
  return `Buenas noches, ${first}`;
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
  const tareas = [
    snap.enCarga > 0 && {
      label: `Autorizar ${snap.enCarga} venta${snap.enCarga === 1 ? "" : "s"} en carga`,
      href: `/ventas?t=${tenant}&estado=EN_CARGA`,
      tag: "Urgente",
    },
    snap.autorizadas > 0 && {
      label: `Contabilizar ${snap.autorizadas} autorizada${snap.autorizadas === 1 ? "" : "s"}`,
      href: `/ventas?t=${tenant}&estado=AUTORIZADA`,
      tag: "Hoy",
    },
    snap.cuotasVencidas > 0 && {
      label: `Revisar ${snap.cuotasVencidas} cuotas vencidas`,
      href: `/mora?t=${tenant}`,
      tag: "Urgente",
    },
    snap.reintegros > 0 && {
      label: `Procesar ${snap.reintegros} reintegro${snap.reintegros === 1 ? "" : "s"}`,
      href: `/caja/reintegros?t=${tenant}`,
      tag: "Caja",
    },
  ].filter(Boolean) as { label: string; href: string; tag: string }[];

  const kpis = [
    {
      label: "Saldo vencido",
      value: formatMoney(snap.saldoPendiente),
      hint: `${formatNumber(snap.cuotasVencidas)} cuotas`,
    },
    {
      label: "Cobrado · mes",
      value: formatMoney(snap.cobradoMes),
      hint: "Cobranzas confirmadas",
    },
    {
      label: "Lotes disponibles",
      value: formatNumber(snap.lotesDisponibles),
      hint: `${formatNumber(snap.lotesVendidos)} vendidos`,
    },
    {
      label: "En espera",
      value: formatNumber(snap.enCarga + snap.autorizadas + snap.reintegros),
      hint: "Carga · contabilidad · reintegro",
    },
  ];

  const briefing = responderAsistente("resumen del dia", snap);
  const nombre = session?.nombre || "equipo";

  let loteos = 0;
  try {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM ${schema}.proyectos WHERE activo = true`
    );
    loteos = rows[0]?.c || 0;
  } catch {
    loteos = 0;
  }

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
              {tenantNombre} · {loteos} proyecto{loteos === 1 ? "" : "s"}
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-ink mt-1 uppercase tracking-tight">
              {saludoHora(nombre)}
            </h1>
            <p className="text-stone-500 mt-2 max-w-xl">
              {snap.enCarga + snap.autorizadas + snap.reintegros} decisiones abiertas y{" "}
              {snap.cuotasVencidas} cuotas en mora. El asistente ya leyó la cartera.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/asistente?t=${tenant}`}
              className="min-h-11 px-4 rounded-xl bg-ink text-cream-50 text-sm inline-flex items-center"
            >
              Preguntar al asistente
            </Link>
            <Link
              href={`/ventas?t=${tenant}`}
              className="min-h-11 px-4 rounded-xl border border-stone-200 bg-white text-sm inline-flex items-center"
            >
              Ver ventas
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-stone-200/80 bg-white/80 p-5"
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
                {k.label}
              </div>
              <div className="font-serif text-3xl text-ink mt-2">{k.value}</div>
              <div className="text-xs text-stone-500 mt-1">{k.hint}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-4 mt-6">
          <div className="rounded-3xl border border-stone-200/80 bg-white/80 p-5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
              Asistente operativo
            </div>
            <AsistenteChat tenant={tenant} saludo={briefing} />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-stone-200/80 bg-white/80 p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
                Alertas
              </div>
              <div className="mt-3 space-y-3">
                {snap.moraClientes[0] && (
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {snap.moraClientes[0].cliente} — {snap.moraClientes[0].cuotas} cuotas
                    </div>
                    <div className="text-xs text-stone-500">
                      {formatMoney(snap.moraClientes[0].saldo)} vencido
                    </div>
                    <Link href={`/mora?t=${tenant}`} className="text-xs text-brand-700 mt-1 inline-block">
                      Ver cartera en mora
                    </Link>
                  </div>
                )}
                {snap.enCarga > 0 && (
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {snap.enCarga} venta{snap.enCarga === 1 ? "" : "s"} en carga
                    </div>
                    <div className="text-xs text-stone-500">
                      Esperan autorización comercial
                    </div>
                  </div>
                )}
                {!snap.moraClientes.length && snap.enCarga === 0 && (
                  <p className="text-sm text-stone-500">Sin alertas activas.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-stone-200/80 bg-white/80 p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
                Tareas del día
              </div>
              <ul className="mt-3 space-y-2">
                {tareas.length === 0 && (
                  <li className="text-sm text-stone-500">Nada urgente en este fideicomiso.</li>
                )}
                {tareas.map((t) => (
                  <li key={t.href} className="flex items-center justify-between gap-2">
                    <Link href={t.href} className="text-sm text-ink hover:underline">
                      {t.label}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wider text-stone-400">
                      {t.tag}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
