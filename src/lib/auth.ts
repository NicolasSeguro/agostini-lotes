import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[auth] JWT_SECRET no configurado. Definirlo en las variables de entorno."
      );
    }
    if (typeof process !== "undefined" && !process.env.__AUTH_WARNED__) {
      console.warn(
        "[auth] AVISO: JWT_SECRET no configurado, usando default inseguro (solo dev)."
      );
      process.env.__AUTH_WARNED__ = "1";
    }
    return new TextEncoder().encode("default-secret-change-me-please");
  }
  return new TextEncoder().encode(secret);
}

const SECRET = getSecret();
const COOKIE = "erp-session";
const SESSION_HOURS = 8;

export type Role = "ADMIN" | "ADMIN_B" | "VENDEDOR" | "CAJERO";

export type SessionPayload = {
  userId: string;
  username: string;
  nombre: string;
  rol: Role;
};

export const ROLES = {
  ALL: ["ADMIN", "ADMIN_B", "VENDEDOR", "CAJERO"] as Role[],
  GERENCIA: ["ADMIN"] as Role[],
  CONTABILIDAD: ["ADMIN", "ADMIN_B"] as Role[],
  CAJA: ["ADMIN", "ADMIN_B", "CAJERO"] as Role[],
  VENTAS: ["ADMIN", "ADMIN_B", "VENDEDOR"] as Role[],
  ADMIN_ONLY: ["ADMIN"] as Role[],
};

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT({
    userId: payload.userId,
    username: payload.username,
    nombre: payload.nombre,
    rol: payload.rol,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(SECRET);
  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      userId: (payload.userId as string) || "",
      username: payload.username as string,
      nombre: (payload.nombre as string) || (payload.username as string),
      rol: (payload.rol as Role) || "ADMIN",
    };
  } catch {
    return null;
  }
}

export async function requireRole(
  roles: Role[]
): Promise<
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  if (!roles.includes(session.rol)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No autorizado para esta operacion" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, session };
}

export function sessionLabel(session: SessionPayload): string {
  return session.nombre?.trim() || session.username;
}

export function applySessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_HOURS * 60 * 60,
    path: "/",
  });
  return res;
}

export const COOKIE_NAME = COOKIE;
export const SESSION_MAX_AGE = SESSION_HOURS * 60 * 60;
