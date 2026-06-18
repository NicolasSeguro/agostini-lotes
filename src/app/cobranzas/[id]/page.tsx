import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/utils";
import { BotonAnularCobranza } from "@/components/BotonAnularCobranza";
import Link from "next/link";
import { ArrowLeft, Receipt, Wallet, FileText, AlertCircle } from "lucide-react";
import { notFound } from "next/navigation";

async function getCobranzaDetalle(tenantSlug: string, cobranzaId: string) {
  const schema = getSchema(tenantSlug);

  const cobranzas = await query(
    `
    SELECT 
      c.*,
      COALESCE(per.razon_social,
        TRIM(BOTH ', ' FROM COALESCE(per.apellido,'') || ', ' || COALESCE(per.nombre,''))
      ) AS comprador,
      per.cuit, per.doc_numero, per.tipo AS persona_tipo,
      per.email, per.telefono
    FROM ${schema}.cobranzas c
    LEFT JOIN ${schema}.personas per ON per.id = c.persona_id
    WHERE c.id = $1
    `,
    [cobranzaId]
  );
  if (cobranzas.length === 0) return null;
  const cobranza = cobranzas[0] as any;

  const medios = await query(
    `
    SELECT 
      cm.id, cm.monto, cm.referencia, cm.observaciones, cm.orden,
      mc.codigo, mc.nombre, mc.tipo
    FROM ${schema}.cobranza_medios cm
    JOIN shared.medios_cobro mc ON mc.id = cm.medio_cobro_id
    WHERE cm.cobranza_id = $1
    ORDER BY cm.orden
    `,
    [cobranzaId]
  );

  const imputaciones = await query(
    `
    SELECT 
      ci.id, ci.modo, ci.monto_capital, ci.monto_iva, ci.monto_interes,
      ci.monto_ajuste, ci.monto_punitorios, ci.condonacion_punitorios, ci.monto_total, ci.orden,
      cu.numero AS cuota_numero, cu.fecha_vto, cu.estado AS cuota_estado,
      v.id AS venta_id, v.fecha AS venta_fecha,
      l.numero AS lote_numero,
      pr.nombre AS proyecto_nombre
    FROM ${schema}.cobranza_imputaciones ci
    JOIN ${schema}.cuotas cu ON cu.id = ci.cuota_id
    JOIN ${schema}.ventas v ON v.id = cu.venta_id
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos pr ON pr.id = l.proyecto_id
    WHERE ci.cobranza_id = $1
    ORDER BY ci.orden
    `,
    [cobranzaId]
  );

  return { cobranza, medios: medios as any[], imputaciones: imputaciones as any[] };
}

function getEstadoStyle(estado: string) {
  const map: Record<string, { label: string; color: string }> = {
    BORRADOR: { label: "Borrador", color: "bg-slate-100 text-slate-700" },
    CONFIRMADA: { label: "Confirmada", color: "bg-green-100 text-green-700" },
    ANULADA: { label: "Anulada", color: "bg-red-100 text-red-700" },
    RENDIDA: { label: "Rendida", color: "bg-blue-100 text-blue-700" },
  };
  return map[estado] || { label: estado, color: "bg-slate-100" };
}

export default async function CobranzaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  const data = await getCobranzaDetalle(tenant, id);
  if (!data) notFound();

  const { cobranza, medios, imputaciones } = data;
  const estStyle = getEstadoStyle(cobranza.estado);

  const sumaMedios = medios.reduce((s, m) => s + parseFloat(m.monto), 0);
  const sumaImputaciones = imputaciones.reduce(
    (s, i) => s + parseFloat(i.monto_total),
    0
  );

  const esHuerfana = imputaciones.length === 0;

  // Se puede anular si: no es legacy, está confirmada, dentro del mes
  const fechaCob = new Date(cobranza.fecha);
  const hoy = new Date();
  const mismoMes =
    hoy.getFullYear() === fechaCob.getFullYear() &&
    hoy.getMonth() === fechaCob.getMonth();
  const puedeAnular =
    !cobranza.legacy_id && cobranza.estado === "CONFIRMADA" && mismoMes;

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/cobranzas?t=${tenant}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Volver al listado
          </Link>
          {puedeAnular && (
            <BotonAnularCobranza cobranzaId={cobranza.id} tenant={tenant} />
          )}
        </div>

        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Receipt size={28} className="text-brand-600" />
                  Recibo {cobranza.nro_recibo || "(sin número)"}
                </h1>
                <span className={`px-2 py-1 rounded text-xs font-medium ${estStyle.color}`}>
                  {estStyle.label}
                </span>
                {esHuerfana && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                    <AlertCircle size={12} />
                    Huérfana
                  </span>
                )}
                {cobranza.legacy_id ? (
                  <span className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-600">
                    Legacy #{cobranza.legacy_id}
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 font-medium">
                    ERP
                  </span>
                )}
              </div>
              <div className="text-slate-600 text-sm">
                {formatDate(cobranza.fecha)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Monto total</div>
              <div className="text-3xl font-bold text-brand-700">
                {formatMoney(cobranza.monto_total)}
              </div>
            </div>
          </div>

          {/* Cliente */}
          <div className="pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-500 mb-1">Cliente</div>
            {cobranza.persona_id ? (
              <Link
                href={`/personas/${cobranza.persona_id}?t=${tenant}`}
                className="font-medium text-slate-900 hover:text-brand-700"
              >
                {cobranza.comprador || "(sin nombre)"}
              </Link>
            ) : (
              <span className="text-slate-400">Sin cliente asociado</span>
            )}
            {(cobranza.cuit || cobranza.doc_numero) && (
              <div className="text-xs text-slate-500 mt-0.5">
                {cobranza.cuit || cobranza.doc_numero}
                {cobranza.persona_tipo === "JURIDICA" && " · Persona Jurídica"}
              </div>
            )}
          </div>

          {cobranza.estado === "ANULADA" && cobranza.anulled_reason && (
            <div className="pt-4 mt-4 border-t border-red-100 bg-red-50 -mx-6 -mb-6 px-6 py-3 rounded-b-xl">
              <div className="text-xs text-red-700 font-medium mb-1">
                Motivo de la anulación
              </div>
              <div className="text-sm text-red-900">{cobranza.anulled_reason}</div>
              {cobranza.anulled_at && (
                <div className="text-xs text-red-600 mt-1">
                  Anulada el {formatDate(cobranza.anulled_at.toString().split("T")[0])}
                </div>
              )}
            </div>
          )}

          {cobranza.observaciones && cobranza.estado !== "ANULADA" && (
            <div className="pt-4 mt-4 border-t border-slate-100">
              <div className="text-xs text-slate-500 mb-1">Observaciones</div>
              <div className="text-sm text-slate-700">{cobranza.observaciones}</div>
            </div>
          )}
        </div>

        {/* Medios de Pago */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Wallet size={18} className="text-slate-400" />
              Medios de Pago ({medios.length})
            </h2>
            <div className="text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">{formatMoney(sumaMedios)}</span>
            </div>
          </div>
          {medios.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              Sin medios de pago registrados
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {medios.map((m) => (
                <div key={m.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-700">
                      {m.codigo}
                    </span>
                    <div>
                      <div className="font-medium text-slate-900">{m.nombre}</div>
                      {(m.referencia || m.observaciones) && (
                        <div className="text-xs text-slate-500">
                          {m.referencia && <span>Ref: {m.referencia}</span>}
                          {m.referencia && m.observaciones && " · "}
                          {m.observaciones}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="font-semibold text-slate-900">
                    {formatMoney(m.monto)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Imputaciones a Cuotas */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText size={18} className="text-slate-400" />
              Imputación a Cuotas ({imputaciones.length})
            </h2>
            <div className="text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">{formatMoney(sumaImputaciones)}</span>
            </div>
          </div>
          {imputaciones.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <AlertCircle size={32} className="mx-auto text-amber-400 mb-2" />
              <div className="text-slate-700 font-medium">Cobranza sin imputación</div>
              <div className="text-sm text-slate-500 mt-1">
                Esta cobranza no está vinculada a cuotas específicas.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {imputaciones.map((imp) => (
                <Link
                  key={imp.id}
                  href={`/ventas/${imp.venta_id}?t=${tenant}`}
                  className="block px-6 py-4 hover:bg-slate-50 transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-slate-900">
                        Cuota {imp.cuota_numero} — {imp.proyecto_nombre} · Lote {imp.lote_numero}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Vto: {formatDate(imp.fecha_vto)} · Estado: {imp.cuota_estado}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">
                        {formatMoney(imp.monto_total)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs mt-2">
                    {parseFloat(imp.monto_capital) > 0 && (
                      <div className="bg-slate-50 px-2 py-1 rounded">
                        <span className="text-slate-500">Capital:</span>{" "}
                        <span className="font-medium">{formatMoney(imp.monto_capital)}</span>
                      </div>
                    )}
                    {parseFloat(imp.monto_iva) > 0 && (
                      <div className="bg-slate-50 px-2 py-1 rounded">
                        <span className="text-slate-500">IVA:</span>{" "}
                        <span className="font-medium">{formatMoney(imp.monto_iva)}</span>
                      </div>
                    )}
                    {parseFloat(imp.monto_interes) > 0 && (
                      <div className="bg-slate-50 px-2 py-1 rounded">
                        <span className="text-slate-500">Interés:</span>{" "}
                        <span className="font-medium">{formatMoney(imp.monto_interes)}</span>
                      </div>
                    )}
                    {parseFloat(imp.monto_ajuste) > 0 && (
                      <div className="bg-amber-50 px-2 py-1 rounded">
                        <span className="text-amber-700">Ajuste:</span>{" "}
                        <span className="font-medium text-amber-900">{formatMoney(imp.monto_ajuste)}</span>
                      </div>
                    )}
                    {parseFloat(imp.monto_punitorios) > 0 && (
                      <div className="bg-red-50 px-2 py-1 rounded">
                        <span className="text-red-700">Punitorios:</span>{" "}
                        <span className="font-medium text-red-900">{formatMoney(imp.monto_punitorios)}</span>
                      </div>
                    )}
                    {parseFloat(imp.condonacion_punitorios) > 0 && (
                      <div className="bg-emerald-50 px-2 py-1 rounded">
                        <span className="text-emerald-700">Condonado:</span>{" "}
                        <span className="font-medium text-emerald-900">{formatMoney(imp.condonacion_punitorios)}</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
