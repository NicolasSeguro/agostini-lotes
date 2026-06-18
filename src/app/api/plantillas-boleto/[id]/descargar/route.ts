import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = req.nextUrl.searchParams.get("t") || "jacaranda";
  const schema = getSchema(tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT archivo_nombre, archivo_bytes FROM ${schema}.plantillas_boleto WHERE id = $1::uuid`,
      [id]
    );
    if (res.rows.length === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    const { archivo_nombre, archivo_bytes } = res.rows[0];
    return new NextResponse(archivo_bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${archivo_nombre}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
