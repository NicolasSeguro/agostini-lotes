import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney, formatNumber } from "@/lib/utils";
import { Users, Tag, FileText, TrendingUp, AlertCircle, Building2, Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

async function getStats(tenantSlug: string) {
  const schema = getSchema(tenantSlug);

  const [personas, lotes, ventas, cuotas, saldos, cobranzas] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM ${schema}.personas`),
    query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado = 'DISPONIBLE')::int AS disponibles,
        COUNT(*) FILTER (WHERE estado IN ('VENDIDO','ESCRITURADO'))::int AS vendidos,
        COUNT(*) FILTER (WHERE estado = 'RESCINDIDO')::int AS rescindidos
      FROM ${schema}.lotes
    `),
    query(`SELECT COUNT(*)::int AS total FROM ${schema}.ventas`),
    query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado IN ('EMITIDA','MORA','PAGA_PARCIAL'))::int AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'PAGA')::int AS pagas,
        COUNT(*) FILTER (WHERE estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND fecha_vto < CURRENT_DATE)::int AS vencidas
      FROM ${schema}.cuotas
    `),
    query(`
      SELECT 
        COALESCE(SUM(v.cuota_base *
          (SELECT COUNT(*) FROM ${schema}.cuotas c
           WHERE c.venta_id = v.id AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL'))
        ), 0)::numeric AS saldo_pendiente_ajustado,
        COALESCE(SUM(v.precio_total), 0)::numeric AS cartera_total_nominal
      FROM ${schema}.ventas v
      WHERE v.cuota_base IS NOT NULL AND v.cuota_base > 0
    `),
    query(`
      SELECT 
        COUNT(*)::int AS total,
        COALESCE(SUM(monto_total), 0)::numeric AS monto_total
      FROM ${schema}.cobranzas
    `),
  ]);

  return {
    personas: personas[0].total,
    lotes: lotes[0],
    ventas: ventas[0].total,
    cuotas: cuotas[0],
    saldo: saldos[0],
    cobranzas: cobranzas[0],
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const stats = await getStats(tenant);

  const cards = [
    {
      label: "Saldo pendiente ajustado",
      value: formatMoney(stats.saldo.saldo_pendiente_ajustado),
      icon: TrendingUp,
      highlight: true,
      desc: "Valor actualizado a hoy de cuotas no pagas",
    },
    {
      label: "Cobranzas históricas",
      value: formatMoney(stats.cobranzas.monto_total),
      icon: Receipt,
      cobranzas: true,
      desc: `${formatNumber(stats.cobranzas.total)} recibos registrados`,
    },
    {
      label: "Cuotas vencidas",
      value: formatNumber(stats.cuotas.vencidas),
      icon: AlertCircle,
      alert: true,
      desc: "Con fecha de vencimiento pasada",
    },
    {
      label: "Lotes disponibles",
      value: formatNumber(stats.lotes.disponibles),
      icon: Tag,
      desc: `${stats.lotes.vendidos} vendidos · ${stats.lotes.rescindidos} rescindidos`,
    },
    {
      label: "Personas",
      value: formatNumber(stats.personas),
      icon: Users,
      desc: "Total de personas en el sistema",
    },
    {
      label: "Ventas activas",
      value: formatNumber(stats.ventas),
      icon: FileText,
      desc: "Operaciones registradas",
    },
    {
      label: "Cuotas",
      value: `${formatNumber(stats.cuotas.pagas)} / ${formatNumber(stats.cuotas.total)}`,
      icon: Building2,
      desc: `${formatNumber(stats.cuotas.pendientes)} pendientes`,
    },
  ];

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Fideicomiso <span className="font-semibold">{tenantNombre}</span> —
            datos a la fecha
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`bg-white rounded-xl border p-6 ${
                  card.highlight
                    ? "border-brand-200 bg-gradient-to-br from-orange-50 to-amber-50"
                    : card.cobranzas
                    ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50"
                    : card.alert
                    ? "border-red-200"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={`p-2 rounded-lg ${
                      card.highlight
                        ? "bg-brand-600 text-white"
                        : card.cobranzas
                        ? "bg-emerald-600 text-white"
                        : card.alert
                        ? "bg-red-100 text-red-600"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                </div>
                <div className="text-sm text-slate-600 mb-1">{card.label}</div>
                <div className={`text-2xl font-bold mb-1 ${card.cobranzas ? "text-emerald-700" : "text-slate-900"}`}>
                  {card.value}
                </div>
                {card.desc && (
                  <div className="text-xs text-slate-500">{card.desc}</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold mb-3">Estado del sistema</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Tenés disponibles los módulos de <strong>Personas</strong>, <strong>Lotes</strong>,{" "}
            <strong>Ventas</strong> y <strong>Cobranzas</strong> sobre los 4 fideicomisos
            del grupo. Usá el selector de fideicomiso a la izquierda para cambiar entre
            Jacaranda, Tipuana, Alisos y Boulevard.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
