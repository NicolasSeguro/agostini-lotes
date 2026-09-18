import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";

const CAMPOS_VALIDOS = new Set([
  "superficie_m2", "frente_ml", "fondo_ml",
  "zona", "precio_lista", "coeficiente", "moneda", "matricula",
  "tiene_agua", "tiene_luz", "tiene_cloacas", "tiene_gas",
]);

type CambioInput = {
  id: string;
  cambios: { campo: string; valor_nuevo: any }[];
};

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.CONTABILIDAD);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  let body: { tenant: string; cambios: CambioInput[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!Array.isArray(body.cambios) || body.cambios.length === 0) {
    return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let aplicados = 0;
    let omitidos = 0;
    const detalleOmitidos: { id: string; motivo: string }[] = [];

    for (const item of body.cambios) {
      // ValidaciÃ³n defensiva: revalidamos estado DISPONIBLE dentro de la transacciÃ³n
      const r = await client.query(
        `SELECT estado::text AS estado, precio_lista, superficie_m2 
         FROM ${schema}.lotes WHERE id = $1::uuid FOR UPDATE`,
        [item.id]
      );
      if (r.rows.length === 0) {
        omitidos++; detalleOmitidos.push({ id: item.id, motivo: "no_existe" }); continue;
      }
      if (r.rows[0].estado !== "DISPONIBLE") {
        omitidos++;
        detalleOmitidos.push({ id: item.id, motivo: `estado=${r.rows[0].estado}` });
        continue;
      }

      // Armar SET dinÃ¡mico
      const sets: string[] = [];
      const params: any[] = [item.id];
      let idx = 2;
      const valoresAplicados: any = {};

      for (const c of item.cambios) {
        if (!CAMPOS_VALIDOS.has(c.campo)) continue;
        sets.push(`${c.campo} = $${idx++}`);
        params.push(c.valor_nuevo);
        valoresAplicados[c.campo] = c.valor_nuevo;
      }

      if (sets.length === 0) continue;

      // Recalcular precio_x_m2 si cambiÃ³ precio_lista o superficie_m2
      const precioNuevo = valoresAplicados.precio_lista !== undefined
        ? Number(valoresAplicados.precio_lista)
        : Number(r.rows[0].precio_lista);
      const supNueva = valoresAplicados.superficie_m2 !== undefined
        ? Number(valoresAplicados.superficie_m2)
        : Number(r.rows[0].superficie_m2);
      if (precioNuevo > 0 && supNueva > 0) {
        sets.push(`precio_x_m2 = $${idx++}`);
        params.push(Math.round((precioNuevo / supNueva) * 100) / 100);
      }

      sets.push(`updated_at = NOW()`);

      await client.query(
        `UPDATE ${schema}.lotes SET ${sets.join(", ")} WHERE id = $1::uuid`,
        params
      );
      aplicados++;
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      aplicados,
      omitidos,
      detalle_omitidos: detalleOmitidos,
    });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[importar/aplicar] ERROR:", err);
    return NextResponse.json({ error: err.message || "Error al aplicar cambios" }, { status: 500 });
  } finally {
    client.release();
  }
}
