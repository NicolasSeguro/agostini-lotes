import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { VentaExpandible } from "@/components/VentaExpandible";
import { esCuotaVigente, toDateString } from "@/lib/cobranza-calc";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, AlertCircle, Receipt, Calendar } from "lucide-react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getPersonaDetalle(tenantSlug: string, personaId: string) {
  const schema = getSchema(tenantSlug);

  const personas = await query(
    `SELECT * FROM ${schema}.personas WHERE id = $1`,
    [personaId]
  );
  if (personas.length === 0) return null;
  const persona = personas[0] as any;

  const roles = await query(
    `SELECT rol FROM ${schema}.persona_roles WHERE persona_id = $1`,
    [personaId]
  );

  const ventas = await query(
    `
    SELECT 
      v.id, v.fecha, v.estado, v.precio_total, v.cant_cuotas,
      v.cuota_base, v.indice_ajuste, v.sistema_amort,
      l.numero AS lote_numero,
      pr.nombre AS proyecto_nombre,
      (SELECT COUNT(*) FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL'))::int AS cuotas_pendientes,
      (SELECT COUNT(*) FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado = 'PAGA')::int AS cuotas_pagas,
      (SELECT COUNT(*) FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE)::int AS cuotas_vencidas
    FROM ${schema}.ventas v
    JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos pr ON pr.id = l.proyecto_id
    WHERE vt.persona_id = $1
    ORDER BY v.fecha DESC
    `,
    [personaId]
  );

  const ventasConCuotas = await Promise.all(
    (ventas as any[]).map(async (v) => {
      const cuotas = await query(
        `
        SELECT 
          id, numero, fecha_vto, estado,
          capital_gr_orig, capital_ex_orig, iva_capital_orig,
          interes_gr_orig, interes_ex_orig, iva_interes_orig,
          fecha_pago
        FROM ${schema}.cuotas WHERE venta_id = $1 ORDER BY numero
        `,
        [v.id]
      );
      return { ...v, cuotas };
    })
  );

  // Detectar si tiene cuotas vigentes (vencidas o del mes)
  const todasCuotasPend = await query(
    `
    SELECT c.fecha_vto
    FROM ${schema}.cuotas c
    JOIN ${schema}.venta_titulares vt ON vt.venta_id = c.venta_id
    WHERE vt.persona_id = $1 AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
    `,
    [personaId]
  ) as any[];
  
  const hoy = new Date();
  const tieneVigentes = todasCuotasPend.some(c => 
    esCuotaVigente(toDateString(c.fecha_vto), hoy)
  );
  const tieneFuturas = todasCuotasPend.some(c => 
    !esCuotaVigente(toDateString(c.fecha_vto), hoy)
  );

  return {
    persona,
    roles: (roles as any[]).map((r) => r.rol),
    ventas: ventasConCuotas,
    tieneVigentes,
    tieneFuturas,
  };
}

export default async function PersonaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  const data = await getPersonaDetalle(tenant, id);
  if (!data) notFound();

  const { persona, roles, ventas, tieneVigentes, tieneFuturas } = data;

  const nombreCompleto =
    persona.razon_social ||
    `${persona.apellido || ""}, ${persona.nombre || ""}`.trim().replace(/^,\s*|,\s*$/g, "") ||
    "Sin nombre";

  const saldoAjustado = ventas.reduce(
    (sum, v) => sum + (parseFloat(String(v.cuota_base || 0)) * (v.cuotas_pendientes || 0)),
    0
  );

  const tieneMora = ventas.some((v) => v.cuotas_vencidas > 0);
  const totalCuotasVencidas = ventas.reduce((s, v) => s + (v.cuotas_vencidas || 0), 0);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <Link
            href={`/personas?t=${tenant}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Volver al listado
          </Link>
          <div className="flex gap-2 flex-wrap">
            {tieneVigentes && (
              <Link
                href={`/cobranzas/nueva/vigentes?t=${tenant}&persona=${persona.id}`}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm"
              >
                <Receipt size={18} />
                Cobrar vigentes
              </Link>
            )}
            {tieneFuturas && (
              tieneVigentes ? (
                <span
                  className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                  title="Primero cobrá las cuotas vigentes"
                >
                  <Calendar size={18} />
                  Adelantar cuotas
                </span>
              ) : (
                <Link
                  href={`/cobranzas/nueva/adelanto?t=${tenant}&persona=${persona.id}`}
                  className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                >
                  <Calendar size={18} />
                  Adelantar cuotas
                </Link>
              )
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">{nombreCompleto}</h1>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  persona.tipo === "JURIDICA" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                }`}>
                  {persona.tipo === "JURIDICA" ? "Persona Jurídica" : "Persona Física"}
                </span>
                {tieneMora && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                    <AlertCircle size={12} />
                    {totalCuotasVencidas} cuota{totalCuotasVencidas === 1 ? "" : "s"} en mora
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-600">
                {persona.doc_tipo}: <span className="font-mono">{persona.cuit || persona.doc_numero}</span>
                {persona.cond_iva && (
                  <span className="ml-3">Condición IVA: <span className="font-medium">{persona.cond_iva}</span></span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {roles.map((rol) => (
              <span key={rol} className="px-2 py-1 bg-brand-50 text-brand-700 rounded text-xs font-medium">
                {rol}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {persona.email && (
              <div className="flex items-center gap-2 text-slate-600">
                <Mail size={16} className="text-slate-400" />
                <span>{persona.email}</span>
              </div>
            )}
            {persona.telefono && (
              <div className="flex items-center gap-2 text-slate-600">
                <Phone size={16} className="text-slate-400" />
                <span>{persona.telefono}</span>
              </div>
            )}
            {persona.telefono_alt && (
              <div className="flex items-center gap-2 text-slate-600">
                <Phone size={16} className="text-slate-400" />
                <span>{persona.telefono_alt}</span>
              </div>
            )}
          </div>
        </div>

        {ventas.length > 0 && (
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-brand-200 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-slate-600 mb-1">Ventas activas</div>
                <div className="text-3xl font-bold text-slate-900">{ventas.length}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Saldo pendiente ajustado</div>
                <div className="text-3xl font-bold text-brand-700">{formatMoney(saldoAjustado)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Cuotas pendientes</div>
                <div className="text-3xl font-bold text-slate-900">
                  {ventas.reduce((s, v) => s + (v.cuotas_pendientes || 0), 0)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Ventas ({ventas.length})</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click en una venta para ver el plan de cuotas
            </p>
          </div>
          {ventas.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              No tiene ventas registradas en este fideicomiso
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {ventas.map((v) => (
                <VentaExpandible key={v.id} venta={v} tenant={tenant} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
