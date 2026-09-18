import { query, getSchema, loadTenants } from "@/lib/db";

export type OpsSnapshot = {
  tenant: string;
  personas: number;
  lotesDisponibles: number;
  lotesVendidos: number;
  ventas: number;
  enCarga: number;
  autorizadas: number;
  rechazadas: number;
  reintegros: number;
  cuotasVencidas: number;
  saldoPendiente: number;
  cobradoMes: number;
  moraClientes: { cliente: string; cuotas: number; dias: number; saldo: number }[];
};

export async function getOpsSnapshot(tenant: string): Promise<OpsSnapshot> {
  await loadTenants();
  const schema = getSchema(tenant);
  const [
    personas,
    lotes,
    ventas,
    workflow,
    cuotas,
    saldo,
    cobrado,
    mora,
  ] = await Promise.all([
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${schema}.personas`),
    query<{ disp: number; vend: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'DISPONIBLE')::int AS disp,
        COUNT(*) FILTER (WHERE estado IN ('VENDIDO','ESCRITURADO'))::int AS vend
      FROM ${schema}.lotes
    `),
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${schema}.ventas`),
    query<{
      en_carga: number;
      autorizada: number;
      rechazadas: number;
      reintegro: number;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'EN_CARGA')::int AS en_carga,
        COUNT(*) FILTER (WHERE estado = 'AUTORIZADA')::int AS autorizada,
        COUNT(*) FILTER (WHERE estado IN ('RECHAZADA_COMERCIAL','RECHAZADA_CONTABILIDAD'))::int AS rechazadas,
        COUNT(*) FILTER (WHERE estado = 'PENDIENTE_REINTEGRO')::int AS reintegro
      FROM ${schema}.ventas
    `),
    query<{ vencidas: number }>(`
      SELECT COUNT(*) FILTER (
        WHERE estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND fecha_vto < CURRENT_DATE
      )::int AS vencidas
      FROM ${schema}.cuotas
    `),
    query<{ saldo: number }>(`
      SELECT COALESCE(SUM(v.cuota_base) FILTER (
        WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
      ), 0)::numeric AS saldo
      FROM ${schema}.ventas v
      JOIN ${schema}.cuotas c ON c.venta_id = v.id
    `),
    query<{ monto: number }>(`
      SELECT COALESCE(SUM(monto_total), 0)::numeric AS monto
      FROM ${schema}.cobranzas
      WHERE fecha >= date_trunc('month', CURRENT_DATE)
        AND estado = 'CONFIRMADA'
    `),
    query<{ cliente: string; cuotas: number; dias: number; saldo: number }>(`
      SELECT
        COALESCE(per.razon_social, TRIM(CONCAT(per.apellido, ' ', per.nombre))) AS cliente,
        COUNT(*) FILTER (
          WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
        )::int AS cuotas,
        COALESCE(MAX(CURRENT_DATE - c.fecha_vto) FILTER (
          WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
        ), 0)::int AS dias,
        COALESCE(SUM(v.cuota_base) FILTER (
          WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
        ), 0)::numeric AS saldo
      FROM ${schema}.ventas v
      JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id AND vt.orden = 1
      JOIN ${schema}.personas per ON per.id = vt.persona_id
      JOIN ${schema}.cuotas c ON c.venta_id = v.id
      WHERE v.estado::text NOT IN ('ANULADA')
      GROUP BY per.razon_social, per.apellido, per.nombre
      HAVING COUNT(*) FILTER (
        WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
      ) > 0
      ORDER BY cuotas DESC
      LIMIT 5
    `),
  ]);

  return {
    tenant,
    personas: personas[0]?.total || 0,
    lotesDisponibles: lotes[0]?.disp || 0,
    lotesVendidos: lotes[0]?.vend || 0,
    ventas: ventas[0]?.total || 0,
    enCarga: workflow[0]?.en_carga || 0,
    autorizadas: workflow[0]?.autorizada || 0,
    rechazadas: workflow[0]?.rechazadas || 0,
    reintegros: workflow[0]?.reintegro || 0,
    cuotasVencidas: cuotas[0]?.vencidas || 0,
    saldoPendiente: Number(saldo[0]?.saldo || 0),
    cobradoMes: Number(cobrado[0]?.monto || 0),
    moraClientes: (mora || []).map((row) => ({
      ...row,
      saldo: Number(row.saldo),
    })),
  };
}
