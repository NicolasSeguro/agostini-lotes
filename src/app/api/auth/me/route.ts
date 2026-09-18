import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole, ROLES, createSession, applySessionCookie } from "@/lib/auth";

export async function GET() {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  return NextResponse.json({
    usuario: {
      username: authz.session.username,
      nombre: authz.session.nombre,
      rol: authz.session.rol,
    },
  });
}

export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const token = await createSession(session);
  const res = NextResponse.json({
    ok: true,
    usuario: {
      username: session.username,
      nombre: session.nombre,
      rol: session.rol,
    },
  });
  applySessionCookie(res, token);
  return res;
}
