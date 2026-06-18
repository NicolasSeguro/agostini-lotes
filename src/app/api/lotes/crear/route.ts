import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";

type Body = {
  tenant: string;
  proyecto_id: string;
  numero: string;
  manzana?: string | null;
  numero_padron?: string | null;
  superficie_m2?: number | null;
  frente_ml?: number | null;
  fondo_ml?: number | null;
  zona?: string | null;
  precio_lista?: number | null;
  precio_x_m2?: number | null;
  coeficiente?: number | null;
  moneda?: string;
  estado?: string;
  matricula?: string | null;
  tiene_agua?: boolean;
  tiene_luz?: boolean;
  tiene_cloacas?: boolean;
  tiene_gas?: boolean;
  geom_json?: any | null;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.proyecto_id) return NextResponse.json({ error: "Proyecto requerido" }, { status: 400 });
  if (!body.numero || !body.numero.trim()) return NextResponse.json({ error: "NÃºmero de lote requerido" }, { status: 400 });

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Validar que no exista otro lote con mismo proyecto+manzana+numero
    const dup = await client.query(
      `SELECT id FROM ${schema}.lotes 
       WHERE proyecto_id = $1::uuid AND numero = $2 
       AND COALESCE(manzana,'') = COALESCE($3,'') LIMIT 1`,
      [body.proyecto_id, body.numero.trim(), body.manzana?.trim() || null]
    );
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "Ya existe un lote con esa manzana y nÃºmero en el proyecto" }, { status: 409 });
    }

    const res = await client.query(
      `
      INSERT INTO ${schema}.lotes
        (proyecto_id, numero, manzana, numero_padron, superficie_m2, frente_ml, fondo_ml,
         zona, precio_lista, precio_x_m2, coeficiente, moneda, estado, matricula,
         tiene_agua, tiene_luz, tiene_cloacas, tiene_gas, geom_json)
      VALUES
        ($1::uuid, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, COALESCE($12,'ARS'), COALESCE($13,'DISPONIBLE')::tenant_template.lote_estado, $14,
         $15, $16, $17, $18, $19::jsonb)
      RETURNING id
      `,
      [
        body.proyecto_id, body.numero.trim(), body.manzana?.trim() || null, body.numero_padron?.trim() || null,
        body.superficie_m2 || null, body.frente_ml || null, body.fondo_ml || null,
        body.zona?.trim() || null, body.precio_lista || null, body.precio_x_m2 || null, body.coeficiente || null,
        body.moneda || "ARS", body.estado || "DISPONIBLE", body.matricula?.trim() || null,
        body.tiene_agua || false, body.tiene_luz || false, body.tiene_cloacas || false, body.tiene_gas || false,
        body.geom_json ? JSON.stringify(body.geom_json) : null,
      ]
    );
    return NextResponse.json({ ok: true, id: res.rows[0].id });
  } catch (err: any) {
    console.error("[crear-lote] ERROR:", err.message);
    return NextResponse.json({ error: err.message || "Error al crear lote" }, { status: 500 });
  } finally {
    client.release();
  }
}
