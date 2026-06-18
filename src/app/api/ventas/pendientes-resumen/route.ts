import { NextRequest, NextResponse } from "next/server";
import { query, getSchema } from "@/lib/db";

/**
 * GET /api/ventas/pendientes-resumen?t=<tenant>
 * 
 * Contadores por estado para la barra de pendientes del listado.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";
  const schema = getSchema(tenant);

  if (!schema) {
    return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });
  }

  const rows = await query(
    `
    SELECT 
      COUNT(*) FILTER (WHERE estado = 'EN_CARGA'::tenant_template.venta_estado)::int AS en_carga,
      COUNT(*) FILTER (WHERE estado = 'CERRADA_PENDIENTE'::tenant_template.venta_estado)::int AS cerrada_pendiente,
      COUNT(*) FILTER (WHERE estado = 'CERRADA_CONFIRMADA'::tenant_template.venta_estado)::int AS cerrada_confirmada,
      COUNT(*) FILTER (WHERE estado = 'AUTORIZADA'::tenant_template.venta_estado)::int AS autorizada,
      COUNT(*) FILTER (WHERE estado IN ('RECHAZADA_COMERCIAL'::tenant_template.venta_estado, 'RECHAZADA_CONTABILIDAD'::tenant_template.venta_estado))::int AS rechazadas,
      COUNT(*) FILTER (WHERE estado = 'PENDIENTE_REINTEGRO'::tenant_template.venta_estado)::int AS pendiente_reintegro,
      COUNT(*) FILTER (WHERE estado = 'CERRADA_CONFIRMADA'::tenant_template.venta_estado AND requiere_aut_desc_fin = true)::int AS req_auth_desc_pendiente
    FROM ${schema}.ventas
    `
  );

  const r = (rows as any[])[0];
  return NextResponse.json({
    en_carga: r.en_carga,
    cerrada_pendiente: r.cerrada_pendiente,
    cerrada_confirmada: r.cerrada_confirmada,
    autorizada: r.autorizada,
    rechazadas: r.rechazadas,
    pendiente_reintegro: r.pendiente_reintegro,
    req_auth_desc_pendiente: r.req_auth_desc_pendiente,
  });
}
