import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { AdelantoForm } from "./AdelantoForm";
import { PickerCliente } from "../PickerCliente";
import { esCuotaVigente, toDateString } from "@/lib/cobranza-calc";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

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
    FROM ${schema}.personas WHERE id = $1
    `,
    [personaId]
  );
  if (rows.length === 0) return null;
  return rows[0] as any;
}

async function getCuotasParaAdelanto(tenantSlug: string, personaId: string) {
  const schema = getSchema(tenantSlug);
  
  const cuotasRaw = await query(
    `
    SELECT 
      c.id AS cuota_id, c.numero, c.fecha_vto, c.estado,
      v.cuota_base AS monto_cuota,
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
    ORDER BY c.numero
    `,
    [personaId]
  ) as any[];

  const hoy = new Date();
  
  // Separar vigentes vs futuras
  const vigentes = cuotasRaw.filter((c) => esCuotaVigente(toDateString(c.fecha_vto), hoy));
  const futuras = cuotasRaw.filter((c) => !esCuotaVigente(toDateString(c.fecha_vto), hoy));

  // Ordenar futuras DESC (de la última a la próxima)
  futuras.sort((a, b) => b.numero - a.numero);

  return {
    vigentes_count: vigentes.length,
    futuras: futuras.map((c) => {
      // cuota_base es el VALOR TOTAL FINAL de la cuota (todo incluido)
      const monto_cuota = parseFloat(c.monto_cuota || 0);
      
      // Descomposición para visualización (no afecta el cobro)
      const capital_gr = parseFloat(c.capital_gr_orig || 0);
      const capital_ex = parseFloat(c.capital_ex_orig || 0);
      const capital = capital_gr + capital_ex;
      const iva_capital = parseFloat(c.iva_capital_orig || 0);
      const interes = parseFloat(c.interes_gr_orig || 0) + parseFloat(c.interes_ex_orig || 0);
      const iva_interes = parseFloat(c.iva_interes_orig || 0);
      
      // Ajuste y su IVA: descomponemos lo que sobra de cuota_base
      const total_cap = capital_gr + capital_ex;
      const prop_gravada = total_cap > 0 ? capital_gr / total_cap : 1;
      const nominal_con_iva = capital + iva_capital + interes + iva_interes;
      const ajuste_con_iva = Math.max(0, monto_cuota - nominal_con_iva);
      const factor = 1 + prop_gravada * 0.21;
      const ajuste = factor > 0 ? Math.round((ajuste_con_iva / factor) * 100) / 100 : 0;
      const iva_ajuste = Math.round((ajuste * prop_gravada * 0.21) * 100) / 100;
      
      return {
        cuota_id: c.cuota_id,
        numero: c.numero,
        fecha_vto: toDateString(c.fecha_vto),
        proyecto_nombre: c.proyecto_nombre,
        lote_id: c.lote_id,
        lote_numero: c.lote_numero,
        lote_manzana: c.lote_manzana,
        monto_cuota: monto_cuota, // cuota_base es el valor total final
        capital,
        iva_capital,
        interes,
        iva_interes,
        ajuste,
        iva_ajuste,
      };
    }),
  };
}

export default async function AdelantoPage({
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
          <h1 className="text-3xl font-bold text-slate-900">Adelantar cuotas</h1>
          <p className="text-slate-500 mt-1">{tenantNombre} — Cuotas futuras (no vencidas)</p>
        </div>

        {personaId ? (
          <ContenidoAdelanto tenant={tenant} personaId={personaId} />
        ) : (
          <PickerCliente tenant={tenant} destino="adelanto" />
        )}
      </div>
    </AppShell>
  );
}

async function ContenidoAdelanto({ tenant, personaId }: { tenant: string; personaId: string }) {
  const [persona, datosCuotas, medios] = await Promise.all([
    getPersona(tenant, personaId),
    getCuotasParaAdelanto(tenant, personaId),
    getMediosCobro(),
  ]);

  if (!persona) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Cliente no encontrado.
      </div>
    );
  }

  // Bloqueo: si hay cuotas vigentes pendientes, redirigir a Vigentes
  if (datosCuotas.vigentes_count > 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex gap-3 mb-4">
          <AlertTriangle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-red-900 mb-1">
              No se puede adelantar
            </h2>
            <p className="text-sm text-red-800">
              Este cliente tiene <strong>{datosCuotas.vigentes_count} cuota{datosCuotas.vigentes_count === 1 ? "" : "s"}</strong>{" "}
              vigente{datosCuotas.vigentes_count === 1 ? "" : "s"} (vencidas o del mes corriente).
              Para poder adelantar tiene que estar al día primero.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/cobranzas/nueva/vigentes?t=${tenant}&persona=${personaId}`}
            className="inline-block px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
          >
            Cobrar pendientes primero
          </Link>
          <Link
            href={`/personas/${personaId}?t=${tenant}`}
            className="inline-block px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50"
          >
            Ver perfil del cliente
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AdelantoForm
      tenant={tenant}
      persona={persona}
      cuotas={datosCuotas.futuras}
      medios={medios as any[]}
    />
  );
}
