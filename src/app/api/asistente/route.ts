import { NextRequest, NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/auth";
import { getSchema } from "@/lib/db";
import { getOpsSnapshot } from "@/lib/ops-snapshot";
import { responderAsistente } from "@/lib/asistente";
import { hasAnthropicKey, responderConClaude } from "@/lib/asistente-llm";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatTurn = { role?: string; content?: string };

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;

  let body: { message?: string; tenant?: string; messages?: ChatTurn[] };
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
  const conClaude = hasAnthropicKey();
  if (!conClaude) {
    return NextResponse.json({
      reply: responderAsistente(message, snap),
      tenant,
      motor: "heuristica",
    });
  }

  const history = (body.messages || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content || "").trim(),
    }))
    .filter((m) => m.content);

  try {
    const reply = await responderConClaude({
      tenant,
      message,
      history,
      snap,
    });
    return NextResponse.json({ reply, tenant, motor: "claude" });
  } catch (err: unknown) {
    const fallback = responderAsistente(message, snap);
    const hint =
      err instanceof Error ? err.message.slice(0, 180) : "Claude no respondio";
    return NextResponse.json({
      reply: `${fallback}\n\n(Sin Claude: ${hint})`,
      tenant,
      motor: "heuristica",
    });
  }
}
