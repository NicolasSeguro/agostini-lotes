import { NextRequest, NextResponse } from "next/server";
import { createSession, COOKIE_NAME } from "@/lib/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";

type Usuario = {
  id: string;
  username: string;
  password_hash: string | null;
  nombre: string;
  rol: "ADMIN" | "ADMIN_B" | "VENDEDOR" | "CAJERO";
  activo: boolean;
};

/**
 * POST /api/auth/login
 *
 * Valida credenciales contra shared.usuarios.
 *  - Si el usuario no existe, esta inactivo o no tiene password_hash -> 401 generico.
 *  - Si el password no coincide -> 401 generico.
 *  - Si OK: crea sesion JWT con username + nombre + rol, actualiza ultimo_login.
 *
 * El 401 es generico (mismo mensaje para "no existe", "inactivo" y "password mal")
 * para no filtrar info a un atacante.
 */
export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido invalido" }, { status: 400 });
  }

  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Usuario y contrasena son obligatorios" },
      { status: 400 }
    );
  }

  // Mensaje generico (no filtrar si el usuario existe o no)
  const RESP_INVALIDO = NextResponse.json(
    { error: "Usuario o contrasena incorrectos" },
    { status: 401 }
  );

  // Buscar usuario en BD (insensible a mayusculas en username)
  let usuario: Usuario | null = null;
  try {
    const rows = await query<Usuario>(
      `SELECT id, username, password_hash, nombre, rol::text AS rol, activo
       FROM shared.usuarios
       WHERE lower(username) = lower($1)
       LIMIT 1`,
      [username]
    );
    usuario = rows[0] || null;
  } catch (err: any) {
    console.error("[auth/login] Error consulta BD:", err.message);
    return NextResponse.json(
      { error: "Error interno, intenta de nuevo" },
      { status: 500 }
    );
  }

  if (!usuario || !usuario.activo || !usuario.password_hash) {
    return RESP_INVALIDO;
  }

  // Comparar password con bcrypt
  let passwordOk = false;
  try {
    passwordOk = await bcrypt.compare(password, usuario.password_hash);
  } catch (err: any) {
    console.error("[auth/login] Error bcrypt:", err.message);
    return NextResponse.json(
      { error: "Error interno, intenta de nuevo" },
      { status: 500 }
    );
  }

  if (!passwordOk) {
    return RESP_INVALIDO;
  }

  // Actualizar ultimo_login (no bloqueante: si falla no rompe el login)
  try {
    await query(
      `UPDATE shared.usuarios SET ultimo_login = now() WHERE id = $1::uuid`,
      [usuario.id]
    );
  } catch (err: any) {
    console.error("[auth/login] Error update ultimo_login:", err.message);
  }

  // Crear sesion JWT
  const token = await createSession({
    username: usuario.username,
    nombre: usuario.nombre,
    rol: usuario.rol,
  });

  const res = NextResponse.json({
    ok: true,
    usuario: {
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
    },
  });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  return res;
}
