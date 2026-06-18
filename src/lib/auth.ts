import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

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

export type SessionPayload = {
  username: string;
  nombre: string;
  rol: "ADMIN" | "ADMIN_B" | "VENDEDOR" | "CAJERO";
};

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT({
    username: payload.username,
    nombre: payload.nombre,
    rol: payload.rol,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
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
      username: payload.username as string,
      nombre: (payload.nombre as string) || (payload.username as string),
      rol: (payload.rol as SessionPayload["rol"]) || "ADMIN",
    };
  } catch {
    return null;
  }
}

export const COOKIE_NAME = COOKIE;
