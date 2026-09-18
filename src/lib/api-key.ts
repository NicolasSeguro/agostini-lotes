import { NextRequest, NextResponse } from "next/server";

export function requirePublicApiKey(req: NextRequest): NextResponse | null {
  const expected = process.env.PUBLIC_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: "API publica no configurada" },
      { status: 503 }
    );
  }
  const header =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!header || header !== expected) {
    return NextResponse.json({ error: "API key invalida" }, { status: 401 });
  }
  return null;
}
