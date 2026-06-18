import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";
import type { PoolClient } from "pg";

type Body = {
  tenant: string;
  motivo?: string;
};

/**
 * POST /api/ventas/[id]/revertir-reclasificacion
 *
 * Deshace TODOS los descuentos_comerciales de la venta y restaura el anticipo.
 * - Suma los montos de descuentos_comerciales
 * - Restaura cobranzas RECLASIFICADAS (devuelve montos a las cobranzas originales,
 *   elimina cobranzas "hermanas" generadas en reclasificaciÃ³n parcial)
 * - Recalcula precio_total, anticipo, descuento_comercial, descomposiciÃ³n IVA
 * - Borra los registros de descuentos_comerciales
 *
 * Estados origen permitidos:
 *   - AUTORIZADA (caso manual, Admin A se arrepiente)
 *   - cualquier estado si llamado internamente desde rechazar/anular (skipState=true en metadata)
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venta = await getVentaParaTransicion(client, schema, id, ["AUTORIZADA"]);
    
    const resultado = await revertirReclasificacionInterno(
      client, schema, body.tenant, id, venta, body.motivo || "ReversiÃ³n manual de Admin A"
    );

    if (!resultado.tenia_reclasificacion) {
      throw new Error("Esta venta no tiene reclasificaciÃ³n para revertir");
    }

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      monto_restaurado: resultado.monto_total,
      cobranzas_restauradas: resultado.cobranzas_restauradas,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error revertir reclasificaciÃ³n:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * FunciÃ³n reutilizable que ejecuta el revert.
 * Sirve tambiÃ©n para llamarse desde "rechazar" automÃ¡ticamente.
 * NO maneja BEGIN/COMMIT (debe estar dentro de una transacciÃ³n).
 *
 * Retorna info de lo que hizo.
 */
export async function revertirReclasificacionInterno(
  client: PoolClient,
  schema: string,
  tenant: string,
  ventaId: string,
  venta: any,
  motivo: string
): Promise<{
  tenia_reclasificacion: boolean;
  monto_total: number;
  cobranzas_restauradas: number;
}> {
  // 1) Obtener los descuentos_comerciales de la venta
  const descRes = await client.query(
    `SELECT id, monto, cobranza_original_id, observaciones
     FROM ${schema}.descuentos_comerciales
     WHERE venta_id = $1::uuid`,
    [ventaId]
  );
  
  if (descRes.rows.length === 0) {
    return { tenia_reclasificacion: false, monto_total: 0, cobranzas_restauradas: 0 };
  }

  const montoTotal = descRes.rows.reduce((s, d) => s + parseFloat(d.monto), 0);

  // 2) Restaurar cobranzas
  //    - Las RECLASIFICADAS que NO son "hermanas" (no tienen "[Reclasificada de cobranza" en obs):
  //      restaurar a BORRADOR
  //    - Las RECLASIFICADAS hermanas: BORRAR (eran ficticias creadas en reclasif parcial)
  //    - Las cobranzas activas reducidas: restaurar el monto original
  
  const cobrRes = await client.query(
    `SELECT id, monto_total, estado::text AS estado, observaciones
     FROM ${schema}.cobranzas
     WHERE venta_id = $1::uuid AND es_anticipo_venta = true`,
    [ventaId]
  );

  let cobranzasRestauradas = 0;
  
  for (const cob of cobrRes.rows) {
    const obs = cob.observaciones || "";
    
    if (cob.estado === "RECLASIFICADA") {
      // Si es una cobranza "hermana" (creada en reclasificaciÃ³n parcial)
      // la borramos directamente
      if (obs.includes("[Reclasificada de cobranza")) {
        await client.query(`DELETE FROM ${schema}.cobranzas WHERE id = $1::uuid`, [cob.id]);
        cobranzasRestauradas++;
        continue;
      }
      // ReclasificaciÃ³n total: restaurar estado original
      await client.query(
        `UPDATE ${schema}.cobranzas
         SET estado = 'BORRADOR'::tenant_template.cobranza_estado,
             observaciones = COALESCE(observaciones, '') || ' [ReclasificaciÃ³n revertida]'
         WHERE id = $1::uuid`,
        [cob.id]
      );
      cobranzasRestauradas++;
    } else if (obs.includes("[Reducida de $")) {
      // Restaurar monto original: extraerlo del texto de observaciones
      // "[Reducida de $1000000.00 por reclasificaciÃ³n parcial]"
      const match = obs.match(/\[Reducida de \$([\d.]+) por reclasificaciÃ³n parcial\]/);
      if (match) {
        const montoOriginal = parseFloat(match[1]);
        await client.query(
          `UPDATE ${schema}.cobranzas
           SET monto_total = $2,
               observaciones = REPLACE(observaciones, $3, '') || ' [Restaurada]'
           WHERE id = $1::uuid`,
          [cob.id, montoOriginal, match[0]]
        );
        cobranzasRestauradas++;
      }
    }
  }

  // 3) Borrar registros de descuentos_comerciales
  await client.query(
    `DELETE FROM ${schema}.descuentos_comerciales WHERE venta_id = $1::uuid`,
    [ventaId]
  );

  // 4) Recalcular venta: anticipo += montoTotal, desc_comercial -= montoTotal
  const precioLista = parseFloat(venta.precio_lista || 0);
  const descFin = parseFloat(venta.descuento_financiero || 0);
  const descComActual = parseFloat(venta.descuento_comercial || 0);
  const anticipoActual = parseFloat(venta.anticipo || 0);
  
  const nuevoDescCom = Math.max(0, descComActual - montoTotal);
  const nuevoAnticipo = anticipoActual + montoTotal;
  const nuevoPrecioTotal = precioLista - descFin - nuevoDescCom;

  // 5) Recalcular descomposiciÃ³n IVA
  const tenantConfig = await client.query(
    `SELECT COALESCE((config->>'porc_gravado')::numeric, 0) AS porc_gravado FROM shared.tenants WHERE slug = $1`,
    [tenant]
  );
  const porcGravado = parseFloat(tenantConfig.rows[0]?.porc_gravado || 0);
  const IVA_RATE = 0.21;
  const gravadoConIva = round(nuevoPrecioTotal * porcGravado);
  const capitalEx = round(nuevoPrecioTotal * (1 - porcGravado));
  const capitalGr = round(gravadoConIva / (1 + IVA_RATE));
  const ivaCapital = round(gravadoConIva - capitalGr);

  await client.query(
    `UPDATE ${schema}.ventas
     SET descuento_comercial = $2,
         anticipo = $3,
         precio_total = $4,
         capital_total_gr = $5,
         capital_total_ex = $6,
         iva_capital_total = $7,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [ventaId, nuevoDescCom, nuevoAnticipo, nuevoPrecioTotal, capitalGr, capitalEx, ivaCapital]
  );

  // 6) Historial (mantiene mismo estado de venta, solo registra el evento)
  await registrarHistorial(
    client, schema, ventaId,
    venta.estado, venta.estado,
    `ReversiÃ³n de reclasificaciÃ³n: ${motivo}. Monto restaurado al anticipo: $${montoTotal.toLocaleString("es-AR")}`,
    "admin",
    {
      monto_revertido: montoTotal,
      cobranzas_restauradas: cobranzasRestauradas,
      descuentos_borrados: descRes.rows.length,
      nuevo_anticipo: nuevoAnticipo,
      nuevo_desc_comercial: nuevoDescCom,
    }
  );

  return {
    tenia_reclasificacion: true,
    monto_total: montoTotal,
    cobranzas_restauradas: cobranzasRestauradas,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
