import { getPool } from "@/lib/db";

export async function expirarReservasVencidas(schema: string) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      UPDATE ${schema}.reservas_web
      SET estado = 'EXPIRADA'
      WHERE estado = 'BLOQUEADA'
        AND vence_at < NOW()
      `
    );
    await client.query(
      `
      UPDATE ${schema}.lotes l
      SET estado = 'DISPONIBLE'::tenant_template.lote_estado
      WHERE l.estado = 'RESERVADO'::tenant_template.lote_estado
        AND EXISTS (
          SELECT 1 FROM ${schema}.reservas_web r
          WHERE r.lote_id = l.id AND r.estado = 'EXPIRADA'
        )
        AND NOT EXISTS (
          SELECT 1 FROM ${schema}.reservas_web r
          WHERE r.lote_id = l.id
            AND r.estado = 'BLOQUEADA'
            AND r.vence_at > NOW()
        )
      `
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}
