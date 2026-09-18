import { NextRequest, NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/auth";
import { getSchema } from "@/lib/db";
import { getOpsSnapshot } from "@/lib/ops-snapshot";
import { responderAsistente } from "@/lib/asistente";

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;

  let body: { message?: string; tenant?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido invalido" }, { status: 400 });
  }

  const tenant = body.tenant || "jacaranda";
  try {
    getSchema(tenant);
  } catch {
    return NextResponse.json({ error: "Fideicomiso invalido" }, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Escribi una pregunta" }, { status: 400 });
  }

  const snap = await getOpsSnapshot(tenant);
  const reply = responderAsistente(message, snap);
  return NextResponse.json({ reply, tenant });
}
