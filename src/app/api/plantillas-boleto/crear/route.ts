import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";

const MODALIDADES = ["CONTADO", "CUOTAS", "FINANCIADO"];
const INDICES = ["NINGUNO", "CAC", "CVS", "FIJO"];

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.ADMIN_ONLY);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  try {
    const formData = await req.formData();
    const tenant = String(formData.get("tenant") || "");
    const proyectoId = String(formData.get("proyecto_id") || "");
    const modalidad = String(formData.get("modalidad") || "");
    const conAnticipo = formData.get("con_anticipo") === "true";
    const indice = String(formData.get("indice") || "NINGUNO");
    const nombre = String(formData.get("nombre") || "").trim();
    const descripcion = String(formData.get("descripcion") || "").trim();
    const file = formData.get("archivo") as File | null;

    if (!tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
    if (!proyectoId) return NextResponse.json({ error: "Proyecto requerido" }, { status: 400 });
    if (!MODALIDADES.includes(modalidad)) return NextResponse.json({ error: "Modalidad inválida" }, { status: 400 });
    if (!INDICES.includes(indice)) return NextResponse.json({ error: "Índice inválido" }, { status: 400 });
    if (!nombre) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "Archivo .docx requerido" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Archivo demasiado grande (máx 10 MB)" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".docx")) return NextResponse.json({ error: "El archivo debe ser .docx" }, { status: 400 });

    // Validar combinación lógica (modalidad CONTADO no tiene índice ni anticipo)
    if (modalidad === "CONTADO" && (conAnticipo || indice !== "NINGUNO")) {
      return NextResponse.json({ error: "CONTADO no admite anticipo ni índice" }, { status: 400 });
    }
    if (modalidad === "FINANCIADO" && conAnticipo) {
      return NextResponse.json({ error: "FINANCIADO es 100% financiado, no admite anticipo" }, { status: 400 });
    }

    const schema = getSchema(tenant);
    if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    const pool = getPool();
    const client = await pool.connect();
    try {
      // Si ya existe una plantilla para la combinación, hacer upsert (reemplazar)
      const dup = await client.query(
        `SELECT id FROM ${schema}.plantillas_boleto 
         WHERE proyecto_id = $1::uuid AND modalidad = $2 AND con_anticipo = $3 AND indice = $4
         LIMIT 1`,
        [proyectoId, modalidad, conAnticipo, indice]
      );

      if (dup.rows.length > 0) {
        // Actualizar existente
        await client.query(
          `UPDATE ${schema}.plantillas_boleto SET
            nombre = $2, descripcion = $3, archivo_nombre = $4, archivo_bytes = $5, archivo_size = $6,
            activo = true, updated_at = NOW()
           WHERE id = $1::uuid`,
          [dup.rows[0].id, nombre, descripcion || null, file.name, buffer, buffer.length]
        );
        return NextResponse.json({ ok: true, id: dup.rows[0].id, reemplazada: true });
      }

      // Crear nueva
      const res = await client.query(
        `INSERT INTO ${schema}.plantillas_boleto
          (proyecto_id, modalidad, con_anticipo, indice, nombre, descripcion, archivo_nombre, archivo_bytes, archivo_size)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [proyectoId, modalidad, conAnticipo, indice, nombre, descripcion || null, file.name, buffer, buffer.length]
      );
      return NextResponse.json({ ok: true, id: res.rows[0].id, reemplazada: false });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[crear-plantilla] ERROR:", err.message);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  }
}
