import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney, formatDate, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, MapPin, Ruler, Droplets, Zap, Trash2, Flame } from "lucide-react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getLoteDetalle(tenantSlug: string, loteId: string) {
  const schema = getSchema(tenantSlug);

  const lotes = await query(
    `
    SELECT 
      l.*, 
      p.nombre AS proyecto_nombre,
      p.codigo AS proyecto_codigo,
      p.tipo_proyecto,
      p.provincia
    FROM ${schema}.lotes l
    JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    WHERE l.id = $1
    `,
    [loteId]
  );
  if (lotes.length === 0) return null;
  const lote = lotes[0] as any;

  const ventas = await query(
    `
    SELECT 
      v.id, v.legacy_id, v.fecha, v.estado,
      v.precio_total, v.cuota_base, v.cant_cuotas,
      v.indice_ajuste, v.sistema_amort,
      per.id AS persona_id, per.cuit, per.doc_numero,
      per.apellido, per.nombre AS persona_nombre, per.razon_social,
      vt.porcentaje,
      (SELECT COUNT(*)::int FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')) AS cuotas_pendientes,
      (SELECT COUNT(*)::int FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado = 'PAGA') AS cuotas_pagas
    FROM ${schema}.ventas v
    JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
    JOIN ${schema}.personas per ON per.id = vt.persona_id
    WHERE v.lote_id = $1
    ORDER BY v.fecha DESC, vt.orden
    `,
    [loteId]
  );

  return { lote, ventas: ventas as any[] };
}

function getEstadoStyle(estado: string) {
  const map: Record<string, { label: string; color: string }> = {
    DISPONIBLE: { label: "Disponible", color: "bg-green-100 text-green-700" },
    RESERVADO: { label: "Reservado", color: "bg-amber-100 text-amber-700" },
    VENDIDO: { label: "Vendido", color: "bg-blue-100 text-blue-700" },
    ESCRITURADO: { label: "Escriturado", color: "bg-purple-100 text-purple-700" },
    RESCINDIDO: { label: "Rescindido", color: "bg-slate-100 text-slate-600" },
  };
  return map[estado] || { label: estado, color: "bg-slate-100" };
}

export default async function LoteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const data = await getLoteDetalle(tenant, id);
  if (!data) notFound();

  const { lote, ventas } = data;
  const estStyle = getEstadoStyle(lote.estado);

  // Agrupar ventas: la primera (más reciente) es "actual", el resto "historial"
  const ventaActual = ventas[0] || null;
  const ventasHistoricas = ventas.slice(1);

  // Saldo del lote
  const saldoVentaActual = ventaActual
    ? parseFloat(ventaActual.cuota_base || 0) * (ventaActual.cuotas_pendientes || 0)
    : 0;

  const servicios = [
    { has: lote.tiene_agua, icon: Droplets, label: "Agua" },
    { has: lote.tiene_luz, icon: Zap, label: "Luz" },
    { has: lote.tiene_cloacas, icon: Trash2, label: "Cloacas" },
    { has: lote.tiene_gas, icon: Flame, label: "Gas" },
  ].filter((s) => s.has);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <Link
          href={`/lotes?t=${tenant}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver al listado
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-900">
                  Lote {lote.numero}
                </h1>
                <span className={`px-2 py-1 rounded text-xs font-medium ${estStyle.color}`}>
                  {estStyle.label}
                </span>
              </div>
              <div className="text-slate-600 flex items-center gap-2">
                <MapPin size={14} />
                <span>{lote.proyecto_nombre}</span>
                {lote.manzana && <span>· Manzana {lote.manzana}</span>}
                {lote.numero_padron && (
                  <span>· Padrón {lote.numero_padron}</span>
                )}
              </div>
            </div>
            {lote.tipo_proyecto === "HISTORICO" && (
              <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs">
                Histórico (legacy)
              </span>
            )}
          </div>

          {/* Servicios */}
          {servicios.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {servicios.map((s) => {
                const Icon = s.icon;
                return (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium"
                  >
                    <Icon size={14} />
                    {s.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Características */}
          {lote.caracteristicas && lote.caracteristicas.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {lote.caracteristicas.map((c: string, i: number) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Ficha técnica */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500 mb-1">Superficie</div>
              <div className="font-medium text-slate-900">
                {lote.superficie_m2 ? `${formatNumber(lote.superficie_m2)} m²` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Frente / Fondo</div>
              <div className="font-medium text-slate-900">
                {lote.frente_ml && lote.fondo_ml
                  ? `${lote.frente_ml} × ${lote.fondo_ml} m`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Zona</div>
              <div className="font-medium text-slate-900">{lote.zona || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Coeficiente</div>
              <div className="font-medium text-slate-900">
                {lote.coeficiente || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Precio lista</div>
              <div className="font-medium text-slate-900">
                {formatMoney(lote.precio_lista)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Precio x m²</div>
              <div className="font-medium text-slate-900">
                {formatMoney(lote.precio_x_m2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Fecha posesión</div>
              <div className="font-medium text-slate-900">
                {formatDate(lote.fecha_posesion)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Matrícula</div>
              <div className="font-medium text-slate-900">
                {lote.matricula || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Venta actual */}
        {ventaActual ? (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Venta actual</h2>
                <div className="text-sm text-slate-600 mt-1">
                  {formatDate(ventaActual.fecha)} · {ventaActual.sistema_amort}
                  {ventaActual.indice_ajuste !== "NINGUNO" &&
                    ` · Ajusta por ${ventaActual.indice_ajuste}`}
                </div>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-4 mb-4">
              <div className="text-xs text-slate-500 mb-1">Comprador</div>
              <Link
                href={`/personas/${ventaActual.persona_id}?t=${tenant}`}
                className="font-medium text-slate-900 hover:text-brand-700"
              >
                {ventaActual.razon_social ||
                  `${ventaActual.apellido || ""}, ${ventaActual.persona_nombre || ""}`
                    .trim()
                    .replace(/^,\s*|,\s*$/g, "")}
              </Link>
              <div className="text-xs text-slate-600 mt-0.5">
                {ventaActual.cuit || ventaActual.doc_numero}
                {ventaActual.porcentaje < 100 && ` · ${ventaActual.porcentaje}%`}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">Precio total</div>
                <div className="font-medium text-slate-900">
                  {formatMoney(ventaActual.precio_total)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Cuota actual</div>
                <div className="font-medium text-slate-900">
                  {formatMoney(ventaActual.cuota_base)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">
                  Cuotas (pagas / total)
                </div>
                <div className="font-medium text-slate-900">
                  {ventaActual.cuotas_pagas} / {ventaActual.cant_cuotas}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Saldo ajustado</div>
                <div className="font-bold text-brand-700">
                  {formatMoney(saldoVentaActual)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 mb-6 text-center text-slate-500">
            Este lote no tiene venta registrada
          </div>
        )}

        {/* Historial */}
        {ventasHistoricas.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">
                Historial ({ventasHistoricas.length} venta{ventasHistoricas.length === 1 ? "" : "s"} previa{ventasHistoricas.length === 1 ? "" : "s"})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {ventasHistoricas.map((v) => (
                <div key={v.id} className="px-6 py-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <Link
                        href={`/personas/${v.persona_id}?t=${tenant}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {v.razon_social ||
                          `${v.apellido || ""}, ${v.persona_nombre || ""}`
                            .trim()
                            .replace(/^,\s*|,\s*$/g, "")}
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatDate(v.fecha)} · {v.cuit || v.doc_numero}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      v.estado === "RESCINDIDA"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {v.estado}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    Precio: {formatMoney(v.precio_total)} · {v.cant_cuotas} cuotas
                    {v.indice_ajuste !== "NINGUNO" && ` · ${v.indice_ajuste}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
