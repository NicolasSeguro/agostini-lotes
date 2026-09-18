import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { DetalleVentaActions } from "@/components/DetalleVentaActions";
import { GenerarBoletoBoton } from "@/components/GenerarBoletoBoton";
import { VentaTimeline } from "@/components/VentaTimeline";

export const dynamic = "force-dynamic";

async function getVentaDetalle(tenantSlug: string, ventaId: string) {
  const schema = getSchema(tenantSlug);

  const ventaRows = await query(
    `
    SELECT 
      v.id, v.nro, v.estado::text AS estado, v.fecha, v.precio_lista, v.precio_total,
      v.anticipo, v.descuento_comercial, v.descuento_financiero,
      v.cant_cuotas, v.sistema_amort::text AS sistema_amort,
      v.tasa_interes_mensual, v.fecha_primer_vto, v.cuota_base,
      v.alicuota_iva, v.capital_total_gr, v.capital_total_ex, v.iva_capital_total,
      v.fecha_boleto, v.requiere_aut_desc_fin, v.observaciones,
      v.fecha_cerrada_pendiente, v.fecha_cerrada_confirmada, v.fecha_autorizada, v.fecha_contabilizada,
      v.created_at,
      v.convenio_id, v.convenio_razon_social, v.convenio_tipo_beneficio, 
      v.convenio_valor_beneficio, v.descuento_convenio,
      l.id AS lote_id, l.numero AS lote_numero, l.manzana AS lote_manzana,
      l.numero_padron, l.superficie_m2,
      pr.id AS proyecto_id, pr.nombre AS proyecto_nombre
    FROM ${schema}.ventas v
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos pr ON pr.id = l.proyecto_id
    WHERE v.id = $1::uuid
    `,
    [ventaId]
  );
  if ((ventaRows as any[]).length === 0) return null;
  const venta = (ventaRows as any[])[0];

  const titulares = await query(
    `
    SELECT 
      vt.persona_id, vt.porcentaje, vt.orden,
      COALESCE(p.razon_social,
        TRIM(BOTH ', ' FROM COALESCE(p.apellido,'') || ', ' || COALESCE(p.nombre,''))
      ) AS nombre,
      p.cuit, p.doc_numero
    FROM ${schema}.venta_titulares vt
    JOIN ${schema}.personas p ON p.id = vt.persona_id
    WHERE vt.venta_id = $1::uuid
    ORDER BY vt.orden
    `,
    [ventaId]
  );

  const historial = await query(
    `
    SELECT estado_anterior, estado_nuevo, usuario_label, fecha, motivo
    FROM ${schema}.venta_historial
    WHERE venta_id = $1::uuid
    ORDER BY fecha DESC
    `,
    [ventaId]
  );

  // Cobranzas de anticipo
  const cobranzas = await query(
    `
    SELECT 
      id, nro_recibo, monto_total, estado::text AS estado, 
      medio_pago::text AS medio_pago, fecha, observaciones,
      banco_origen, numero_operacion, anulled_reason
    FROM ${schema}.cobranzas
    WHERE venta_id = $1::uuid AND es_anticipo_venta = true
    ORDER BY fecha ASC, created_at ASC
    `,
    [ventaId]
  );

  // Descuentos comerciales (off-books)
  const descuentos = await query(
    `
    SELECT id, monto, fecha, observaciones
    FROM ${schema}.descuentos_comerciales
    WHERE venta_id = $1::uuid
    ORDER BY fecha ASC
    `,
    [ventaId]
  );

  return { venta, titulares, historial, cobranzas, descuentos };
}

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: any): string {
  if (!d) return "â€”";
  try {
    return new Date(d).toLocaleDateString("es-AR");
  } catch {
    return "â€”";
  }
}

function formatDateTime(d: any): string {
  if (!d) return "â€”";
  try {
    return new Date(d).toLocaleString("es-AR");
  } catch {
    return "â€”";
  }
}

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  EN_CARGA:               { label: "En carga", color: "bg-slate-100 text-slate-700 border-slate-300" },
  CERRADA_PENDIENTE:      { label: "Esperando cobro de anticipo", color: "bg-blue-100 text-blue-700 border-blue-300" },
  CERRADA_CONFIRMADA:     { label: "Pendiente autorizaciÃ³n Comercial", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  AUTORIZADA:             { label: "Pendiente contabilizaciÃ³n", color: "bg-amber-100 text-amber-700 border-amber-300" },
  CONTABILIZADA:          { label: "Contabilizada", color: "bg-green-100 text-green-700 border-green-300" },
  RECHAZADA_COMERCIAL:    { label: "Rechazada (Comercial)", color: "bg-red-100 text-red-700 border-red-300" },
  RECHAZADA_CONTABILIDAD: { label: "Rechazada (Contabilidad)", color: "bg-red-100 text-red-700 border-red-300" },
  ANULADA:                { label: "Anulada", color: "bg-slate-100 text-slate-500 border-slate-300" },
};

const ESTADO_COBRANZA: Record<string, { label: string; color: string }> = {
  BORRADOR:      { label: "Provisorio", color: "bg-amber-100 text-amber-700" },
  CONFIRMADA:    { label: "Confirmada", color: "bg-green-100 text-green-700" },
  ANULADA:       { label: "Anulada", color: "bg-red-100 text-red-700" },
  RECLASIFICADA: { label: "Reclasificada", color: "bg-purple-100 text-purple-700" },
  RENDIDA:       { label: "Rendida", color: "bg-blue-100 text-blue-700" },
};

export default async function VentaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  
  const data = await getVentaDetalle(tenant, id);
  if (!data) notFound();
  
  const { venta, titulares, historial, cobranzas, descuentos } = data;
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";
  const estadoInfo = ESTADO_INFO[venta.estado] || ESTADO_INFO.EN_CARGA;
  
  const anticipoEsperado = parseFloat(venta.anticipo || 0);
  const cobranzasActivas = (cobranzas as any[]).filter((c: any) => 
    c.estado === "BORRADOR" || c.estado === "CONFIRMADA"
  );
  const totalCobradoAnticipo = cobranzasActivas.reduce((s: number, c: any) => s + parseFloat(c.monto_total), 0);
  const restanteAnticipo = Math.max(0, anticipoEsperado - totalCobradoAnticipo);
  const totalDescComOff = (descuentos as any[]).reduce((s: number, d: any) => s + parseFloat(d.monto), 0);

  return (
    <AppShell>
      <div className="p-8 max-w-6xl">
        <Link
          href={`/ventas?t=${tenant}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver al listado
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">Venta #{venta.nro || "(sin nro)"}</h1>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${estadoInfo.color}`}>
                  {estadoInfo.label}
                </span>
                {venta.requiere_aut_desc_fin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                    <AlertTriangle size={12} />
                    Requiere autorizaciÃ³n descuento
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-600">
                {tenantNombre} Â· {venta.proyecto_nombre} Â·{" "}
                {venta.lote_manzana ? `M${venta.lote_manzana}-` : ""}L{venta.lote_numero}
                {venta.numero_padron && ` (PadrÃ³n ${venta.numero_padron})`}
              </div>
            </div>
            <GenerarBoletoBoton tenant={tenant} ventaId={venta.id} estado={venta.estado} />
          </div>
        </div>

        {/* Acciones contextuales segÃºn estado */}
        <DetalleVentaActions
          tenant={tenant}
          venta={{
            id: venta.id,
            estado: venta.estado,
            nro: venta.nro,
            anticipo: anticipoEsperado,
            anticipo_cobrado: totalCobradoAnticipo,
            anticipo_restante: restanteAnticipo,
            precio_total: parseFloat(venta.precio_total || 0),
            precio_lista: parseFloat(venta.precio_lista || 0),
            descuento_financiero: parseFloat(venta.descuento_financiero || 0),
            descuento_comercial: parseFloat(venta.descuento_comercial || 0),
            cant_cuotas: venta.cant_cuotas,
            cuota_base: parseFloat(venta.cuota_base || 0),
            sistema_amort: venta.sistema_amort,
            fecha_primer_vto: venta.fecha_primer_vto 
              ? new Date(venta.fecha_primer_vto).toISOString().slice(0, 10) 
              : "",
            requiere_aut_desc_fin: venta.requiere_aut_desc_fin,
            total_descuentos_off_books: totalDescComOff,
          }}
        />

        {/* Resumen econÃ³mico */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Precio boleto</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{formatMoney(parseFloat(venta.precio_total || 0))}</div>
            <div className="text-xs text-slate-400 mt-1">Lista: {formatMoney(parseFloat(venta.precio_lista || 0))}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Anticipo</div>
            <div className="text-xl font-bold text-slate-700 mt-1">{formatMoney(anticipoEsperado)}</div>
            {anticipoEsperado > 0 && (
              <div className="text-xs text-slate-400 mt-1">
                Cobrado: {formatMoney(totalCobradoAnticipo)}
                {restanteAnticipo > 0 && ` (falta ${formatMoney(restanteAnticipo)})`}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Cuotas</div>
            <div className="text-xl font-bold text-slate-700 mt-1">{venta.cant_cuotas}</div>
            <div className="text-xs text-slate-400 mt-1">{venta.sistema_amort}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Cuota base</div>
            <div className="text-xl font-bold text-brand-700 mt-1">{formatMoney(parseFloat(venta.cuota_base || 0))}</div>
            <div className="text-xs text-slate-400 mt-1">desde {formatDate(venta.fecha_primer_vto)}</div>
          </div>
        </div>

        {/* Convenio aplicado (si existe) */}
        {venta.convenio_id && parseFloat(venta.descuento_convenio || 0) > 0 && (
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-5 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs text-purple-700 uppercase tracking-wider font-medium">Convenio aplicado</div>
                <div className="font-semibold text-purple-900 mt-1">{venta.convenio_razon_social}</div>
                <div className="text-xs text-purple-700 mt-1">
                  {venta.convenio_tipo_beneficio === "PORCENTAJE" 
                    ? `${parseFloat(venta.convenio_valor_beneficio)}% sobre precio lista` 
                    : `Monto fijo: ${formatMoney(parseFloat(venta.convenio_valor_beneficio))}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-purple-700">Descuento aplicado</div>
                <div className="text-2xl font-bold text-purple-900">
                  âˆ’ {formatMoney(parseFloat(venta.descuento_convenio))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cobranzas de anticipo */}
        {(cobranzas as any[]).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h2 className="font-semibold text-slate-900 mb-3">Cobranzas del anticipo</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Recibo</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Medio</th>
                    <th className="py-2 pr-3 text-right">Monto</th>
                    <th className="py-2 pr-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(cobranzas as any[]).map((c: any) => {
                    const est = ESTADO_COBRANZA[c.estado] || { label: c.estado, color: "bg-slate-100" };
                    return (
                      <tr key={c.id}>
                        <td className="py-2 pr-3 font-mono text-xs">{c.nro_recibo}</td>
                        <td className="py-2 pr-3">{formatDate(c.fecha)}</td>
                        <td className="py-2 pr-3">{c.medio_pago}</td>
                        <td className="py-2 pr-3 text-right font-medium">{formatMoney(parseFloat(c.monto_total))}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${est.color}`}>
                            {est.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Descuentos comerciales off-books */}
        {(descuentos as any[]).length > 0 && (
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-6 mb-6">
            <h2 className="font-semibold text-purple-900 mb-3">Descuentos comerciales (off-books)</h2>
            <div className="space-y-2">
              {(descuentos as any[]).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between text-sm bg-white rounded-lg p-3 border border-purple-100">
                  <div>
                    <div className="font-medium text-purple-900">{formatMoney(parseFloat(d.monto))}</div>
                    <div className="text-xs text-purple-700">{d.observaciones || "Sin observaciones"}</div>
                  </div>
                  <div className="text-xs text-purple-600">{formatDateTime(d.fecha)}</div>
                </div>
              ))}
              <div className="text-xs text-purple-700 pt-2 border-t border-purple-200">
                Total off-books: <span className="font-bold">{formatMoney(totalDescComOff)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Titulares */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-3">Titulares</h2>
          <div className="space-y-2">
            {(titulares as any[]).map((t: any) => (
              <div key={t.persona_id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                <div>
                  <div className="font-medium text-slate-900 text-sm">{t.nombre}</div>
                  <div className="text-xs text-slate-500">{t.cuit || t.doc_numero}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-slate-900">{parseFloat(t.porcentaje || 0).toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* DescomposiciÃ³n fiscal */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-3">DescomposiciÃ³n fiscal</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">Capital gravado</div>
              <div className="font-medium text-slate-900">{formatMoney(parseFloat(venta.capital_total_gr || 0))}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Capital exento</div>
              <div className="font-medium text-slate-900">{formatMoney(parseFloat(venta.capital_total_ex || 0))}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">IVA capital</div>
              <div className="font-medium text-slate-900">{formatMoney(parseFloat(venta.iva_capital_total || 0))}</div>
            </div>
          </div>
        </div>

        {(historial as any[]).length > 0 && (
          <div className="mb-6">
            <VentaTimeline eventos={historial as any[]} />
          </div>
        )}

        {/* Observaciones */}
        {venta.observaciones && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-2">Observaciones</h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{venta.observaciones}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
