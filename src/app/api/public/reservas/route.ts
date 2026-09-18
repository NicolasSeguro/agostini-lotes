import { NextRequest, NextResponse } from "next/server";
import { requirePublicApiKey } from "@/lib/api-key";
import { getSchema, getPool, loadTenants } from "@/lib/db";
import { expirarReservasVencidas } from "@/lib/reservas-web";

type Body = {
  desarrollo: string;
  lote_id: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono?: string;
  email?: string;
  ttl_horas?: number;
};

export async function POST(req: NextRequest) {
  const denied = requirePublicApiKey(req);
  if (denied) return denied;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.desarrollo || !body.lote_id || !body.nombre || !body.apellido || !body.dni) {
    return NextResponse.json({ error: "Faltan datos minimos" }, { status: 400 });
  }

  await loadTenants();
  let schema: string;
  try {
    schema = getSchema(body.desarrollo);
  } catch {
    return NextResponse.json({ error: "desarrollo invalido" }, { status: 400 });
  }

  await expirarReservasVencidas(schema);

  const ttl = Math.min(Math.max(body.ttl_horas || 48, 1), 168);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const lote = await client.query(
      `SELECT id, estado::text AS estado FROM ${schema}.lotes WHERE id = $1::uuid FOR UPDATE`,
      [body.lote_id]
    );
    if (!lote.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
    }
    if (lote.rows[0].estado !== "DISPONIBLE") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Lote no disponible" }, { status: 409 });
    }

    const personas = await client.query(
      `SELECT id FROM ${schema}.personas
       WHERE REPLACE(COALESCE(cuit,''), '-', '') = REPLACE($1, '-', '')
          OR doc_numero = $1
       LIMIT 1`,
      [body.dni]
    );
    let personaId = personas.rows[0]?.id as string | undefined;
    if (!personaId) {
      const created = await client.query(
        `INSERT INTO ${schema}.personas (nombre, apellido, doc_numero, telefono, email)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [body.nombre, body.apellido, body.dni, body.telefono || null, body.email || null]
      );
      personaId = created.rows[0].id;
    }

    await client.query(
      `UPDATE ${schema}.lotes
       SET estado = 'RESERVADO'::tenant_template.lote_estado
       WHERE id = $1::uuid`,
      [body.lote_id]
    );

    let reservaId: string | null = null;
    try {
      const reserva = await client.query(
        `INSERT INTO ${schema}.reservas_web
           (lote_id, persona_id, origen, vence_at, estado, payload)
         VALUES ($1::uuid, $2::uuid, 'WEB_360', NOW() + ($3 || ' hours')::interval, 'BLOQUEADA', $4::jsonb)
         RETURNING id`,
        [
          body.lote_id,
          personaId,
          String(ttl),
          JSON.stringify({
            nombre: body.nombre,
            apellido: body.apellido,
            dni: body.dni,
            telefono: body.telefono,
            email: body.email,
          }),
        ]
      );
      reservaId = reserva.rows[0].id;
    } catch {
      // Tabla reservas_web puede no existir hasta aplicar migracion.
    }

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      reserva_id: reservaId,
      persona_id: personaId,
      ttl_horas: ttl,
      lote_estado: "RESERVADO",
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err.message || "No se pudo crear la reserva" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
