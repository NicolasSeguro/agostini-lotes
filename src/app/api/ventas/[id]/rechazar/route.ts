import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";
import { revertirReclasificacionInterno } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  motivo: string;
  rol: "COMERCIAL" | "CONTABILIDAD";
};

/**
 * POST /api/ventas/[id]/rechazar
 *
 * Rechaza venta:
 *   - CERRADA_CONFIRMADA â†’ RECHAZADA_COMERCIAL  (Gerente Comercial)
 *   - AUTORIZADA         â†’ RECHAZADA_CONTABILIDAD (Admin A)
 *
 * Las cobranzas NO se anulan (se mantienen vivas para que el vendedor
 * decida quÃ© hacer).
 *
 * CRÃTICO: Si Admin A rechaza una venta que tenÃ­a reclasificaciÃ³n de anticipo
 * a descuento comercial, se REVIERTE automÃ¡ticamente antes de cambiar el estado.
 * AsÃ­ el vendedor recibe la venta como la cargÃ³ (con anticipo, sin descuento
 * comercial). Esto se aplica solo en CONTABILIDAD porque Comercial no puede
 * haber reclasificado (eso solo lo hace Admin A en estado AUTORIZADA).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.motivo || body.motivo.trim().length < 3) {
    return NextResponse.json({ error: "Motivo obligatorio (mÃ­nimo 3 caracteres)" }, { status: 400 });
  }
  if (!["COMERCIAL", "CONTABILIDAD"].includes(body.rol)) {
    return NextResponse.json({ error: "Rol invÃ¡lido" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const estadosPermitidos = body.rol === "COMERCIAL"
      ? ["CERRADA_CONFIRMADA"]
      : ["AUTORIZADA"];

    const venta = await getVentaParaTransicion(client, schema, id, estadosPermitidos);

    const estadoRechazo = body.rol === "COMERCIAL"
      ? "RECHAZADA_COMERCIAL"
      : "RECHAZADA_CONTABILIDAD";

    // Si es Admin A y la venta tiene reclasificaciÃ³n â†’ revertir primero
    let infoReversion: any = null;
    if (body.rol === "CONTABILIDAD") {
      const reversion = await revertirReclasificacionInterno(
        client, schema, body.tenant, id, venta,
        `ReversiÃ³n automÃ¡tica por rechazo de Admin A: ${body.motivo.trim()}`
      );
      if (reversion.tenia_reclasificacion) {
        infoReversion = {
          monto_revertido: reversion.monto_total,
          cobranzas_restauradas: reversion.cobranzas_restauradas,
        };
        // Re-leer la venta porque sus valores cambiaron
        const refresh = await client.query(
          `SELECT * FROM ${schema}.ventas WHERE id = $1::uuid FOR UPDATE`,
          [id]
        );
        Object.assign(venta, refresh.rows[0]);
      }
    }

    // Cambiar estado de venta (cobranzas se mantienen vivas, no se tocan)
    await client.query(
      `UPDATE ${schema}.ventas
       SET estado = $2::tenant_template.venta_estado,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id, estadoRechazo]
    );

    const motivoHistorial = infoReversion
      ? `Rechazo (${body.rol}): ${body.motivo.trim()}. Se revirtiÃ³ reclasificaciÃ³n de $${infoReversion.monto_revertido.toLocaleString("es-AR")}`
      : `Rechazo (${body.rol}): ${body.motivo.trim()}`;

    await registrarHistorial(
      client, schema, id,
      venta.estado, estadoRechazo,
      motivoHistorial,
      "admin",
      { rol: body.rol, motivo: body.motivo.trim(), reversion: infoReversion }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      nuevo_estado: estadoRechazo,
      reclasificacion_revertida: !!infoReversion,
      info_reversion: infoReversion,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error rechazar venta:", err);
    return NextResponse.json({ error: err.message || "Error al rechazar" }, { status: 500 });
  } finally {
    client.release();
  }
}
