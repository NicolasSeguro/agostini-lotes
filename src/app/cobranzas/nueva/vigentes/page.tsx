import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { CobranzaVigentesForm } from "./CobranzaVigentesForm";
import { PickerCliente } from "../PickerCliente";
import { calcularSaldoCuota, esCuotaVigente, toDateString } from "@/lib/cobranza-calc";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

async function getMediosCobro() {
  return await query(`
    SELECT id, codigo, nombre, tipo
    FROM shared.medios_cobro
    WHERE habilitado = true
    ORDER BY orden
  `);
}

async function getPersona(tenantSlug: string, personaId: string) {
  const schema = getSchema(tenantSlug);
  const rows = await query(
    `
    SELECT 
      id,
      COALESCE(razon_social,
        TRIM(BOTH ', ' FROM COALESCE(apellido,'') || ', ' || COALESCE(nombre,''))
      ) AS nombre,
      cuit, doc_numero
    FROM ${schema}.personas
    WHERE id = $1
    `,
    [personaId]
  );
  if (rows.length === 0) return null;
  return rows[0] as any;
}

async function getCuotasVigentes(tenantSlug: string, personaId: string) {
  const schema = getSchema(tenantSlug);
  
  // Traer todas las cuotas pendientes (EMITIDA, MORA, PAGA_PARCIAL) del cliente
  const cuotasRaw = await query(
    `
    SELECT 
      c.id, c.numero, c.fecha_vto, c.estado,
      v.cuota_base AS cuota_base_actual,
      c.capital_gr_orig, c.capital_ex_orig, c.iva_capital_orig,
      c.interes_gr_orig, c.interes_ex_orig, c.iva_interes_orig,
      l.id AS lote_id,
      l.numero AS lote_numero,
      l.manzana AS lote_manzana,
      pr.nombre AS proyecto_nombre
    FROM ${schema}.cuotas c
    JOIN ${schema}.ventas v ON v.id = c.venta_id
    JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos pr ON pr.id = l.proyecto_id
    WHERE vt.persona_id = $1
      AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
    ORDER BY c.fecha_vto
    `,
    [personaId]
  ) as any[];

  // Filtrar solo las vigentes (vencidas o del mes corriente)
  const hoy = new Date();
  const cuotasVigentes = cuotasRaw.filter((c) => esCuotaVigente(c.fecha_vto, hoy));

  // Para cada cuota vigente, traer sus imputaciones previas
  const resultado = await Promise.all(
    cuotasVigentes.map(async (c) => {
      const previas = await query(
        `
        SELECT 
          co.fecha,
          ci.monto_capital, ci.monto_iva,
          ci.monto_interes, ci.monto_ajuste, ci.monto_punitorios,
          ci.condonacion_punitorios,
          COALESCE(ci.iva_capital, 0) AS iva_capital,
          COALESCE(ci.iva_interes, 0) AS iva_interes,
          COALESCE(ci.iva_ajuste, 0) AS iva_ajuste,
          COALESCE(ci.iva_punitorios, 0) AS iva_punitorios
        FROM ${schema}.cobranza_imputaciones ci
        JOIN ${schema}.cobranzas co ON co.id = ci.cobranza_id
        WHERE ci.cuota_id = $1
          AND co.estado = 'CONFIRMADA'
        `,
        [c.id]
      ) as any[];

      const saldo = calcularSaldoCuota(
        {
          id: c.id,
          numero: c.numero,
          fecha_vto: toDateString(c.fecha_vto),
          estado: c.estado,
          cuota_base_actual: parseFloat(c.cuota_base_actual || 0),
          capital_gr_orig: parseFloat(c.capital_gr_orig || 0),
          capital_ex_orig: parseFloat(c.capital_ex_orig || 0),
          iva_capital_orig: parseFloat(c.iva_capital_orig || 0),
          interes_gr_orig: parseFloat(c.interes_gr_orig || 0),
          interes_ex_orig: parseFloat(c.interes_ex_orig || 0),
          iva_interes_orig: parseFloat(c.iva_interes_orig || 0),
        },
        previas.map((p) => ({
          fecha: toDateString(p.fecha),
          monto_capital: parseFloat(p.monto_capital || 0),
          monto_iva: parseFloat(p.monto_iva || 0),
          monto_interes: parseFloat(p.monto_interes || 0),
          monto_ajuste: parseFloat(p.monto_ajuste || 0),
          monto_punitorios: parseFloat(p.monto_punitorios || 0),
          condonacion_punitorios: parseFloat(p.condonacion_punitorios || 0),
          iva_capital: parseFloat(p.iva_capital || 0),
          iva_interes: parseFloat(p.iva_interes || 0),
          iva_ajuste: parseFloat(p.iva_ajuste || 0),
          iva_punitorios: parseFloat(p.iva_punitorios || 0),
        }))
      );

      return {
        ...saldo,
        proyecto_nombre: c.proyecto_nombre,
        lote_id: c.lote_id,
        lote_numero: c.lote_numero,
        lote_manzana: c.lote_manzana,
      };
    })
  );

  return resultado;
}

export default async function VigentesPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; persona?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const personaId = params.persona || null;
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <Link
          href={`/cobranzas/nueva?t=${tenant}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Cobrar cuotas vigentes</h1>
          <p className="text-slate-500 mt-1">{tenantNombre} — Vencidas + del mes corriente</p>
        </div>

        {personaId ? (
          <ContenidoVigentes tenant={tenant} personaId={personaId} />
        ) : (
          <PickerCliente tenant={tenant} destino="vigentes" />
        )}
      </div>
    </AppShell>
  );
}

async function ContenidoVigentes({ tenant, personaId }: { tenant: string; personaId: string }) {
  const [persona, cuotas, medios] = await Promise.all([
    getPersona(tenant, personaId),
    getCuotasVigentes(tenant, personaId),
    getMediosCobro(),
  ]);

  if (!persona) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Cliente no encontrado.
      </div>
    );
  }

  return (
    <CobranzaVigentesForm
      tenant={tenant}
      persona={persona}
      cuotas={cuotas}
      medios={medios as any[]}
    />
  );
}
