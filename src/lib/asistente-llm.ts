import { env } from "node:process";
import { generateText, stepCountIs, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { query, getSchema } from "@/lib/db";
import { getOpsSnapshot, type OpsSnapshot } from "@/lib/ops-snapshot";

const SYSTEM = `Sos el asistente de Agostini Ops. Hablás con Laura, cajeros y vendedores: gente de operación, no de sistemas.

Reglas:
- Español rioplatense, frases cortas, sin jerga técnica.
- Usá las herramientas para leer datos reales. Nunca inventes montos, cuotas ni estados.
- Empezá por lo que hay que hacer hoy. Después el número.
- Si hay mora, decí a quién llamar primero y por qué (cuotas, días, saldo).
- NO podés autorizar ventas, contabilizar, anular, cobrar ni cambiar estados. Eso lo hace una persona en Ventas o Caja. Si te lo piden, indicá el botón / la pantalla.
- El cálculo de cuotas no se toca: vos solo leés la operación.
- Si no hay datos, decilo.
- Texto plano: sin markdown, sin asteriscos, sin títulos con #.`;

export function hasAnthropicKey() {
  return Boolean(String(env.ANTHROPIC_API_KEY || "").trim());
}

function modeloAnthropic() {
  return String(env.ANTHROPIC_MODEL || "").trim() || "claude-sonnet-5";
}

function clienteAnthropic() {
  return createAnthropic({ apiKey: String(env.ANTHROPIC_API_KEY || "") });
}

async function buscarPersonas(tenant: string, q: string) {
  const schema = getSchema(tenant);
  const term = `%${q.trim()}%`;
  return query<{
    id: string;
    nombre: string | null;
    apellido: string | null;
    razon_social: string | null;
    doc_numero: string | null;
    cuit: string | null;
    telefono: string | null;
  }>(
    `
    SELECT id, nombre, apellido, razon_social, doc_numero, cuit, telefono
    FROM ${schema}.personas
    WHERE UPPER(COALESCE(apellido,'')) LIKE UPPER($1)
       OR UPPER(COALESCE(nombre,'')) LIKE UPPER($1)
       OR UPPER(COALESCE(razon_social,'')) LIKE UPPER($1)
       OR REPLACE(COALESCE(cuit,''), '-', '') LIKE REPLACE($1, '-', '')
       OR COALESCE(doc_numero,'') LIKE $1
    ORDER BY apellido, nombre
    LIMIT 8
    `,
    [term]
  );
}

export async function responderConClaude(opts: {
  tenant: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  snap: OpsSnapshot;
}): Promise<string> {
  const { tenant, message, snap } = opts;
  const history = (opts.history || [])
    .filter((m) => m.content?.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!history.length || history[history.length - 1].content !== message) {
    history.push({ role: "user", content: message });
  }

  const result = await generateText({
    model: clienteAnthropic()(modeloAnthropic()),
    system: SYSTEM,
    stopWhen: stepCountIs(5),
    tools: {
      resumen_cartera: tool({
        description:
          "Resumen operativo del fideicomiso activo: stock, ventas, mora, cobrado del mes, pendientes.",
        inputSchema: z.object({
          motivo: z.string().optional().describe("Por qué consultás el resumen"),
        }),
        execute: async () => snap,
      }),
      cartera_mora: tool({
        description: "Clientes con cuotas vencidas y saldo estimado.",
        inputSchema: z.object({
          motivo: z.string().optional(),
        }),
        execute: async () => ({
          cuotasVencidas: snap.cuotasVencidas,
          saldoPendiente: snap.saldoPendiente,
          clientes: snap.moraClientes,
        }),
      }),
      stock_lotes: tool({
        description: "Stock de lotes disponibles y vendidos.",
        inputSchema: z.object({
          motivo: z.string().optional(),
        }),
        execute: async () => ({
          disponibles: snap.lotesDisponibles,
          vendidos: snap.lotesVendidos,
          nota: "El stock público de Rosario usa GET /api/public/lotes",
        }),
      }),
      ventas_pendientes: tool({
        description:
          "Ventas en espera: en carga, autorizadas, reintegros y rechazos.",
        inputSchema: z.object({
          motivo: z.string().optional(),
        }),
        execute: async () => ({
          enCarga: snap.enCarga,
          autorizadas: snap.autorizadas,
          reintegros: snap.reintegros,
          rechazadas: snap.rechazadas,
          ventas: snap.ventas,
        }),
      }),
      buscar_persona: tool({
        description: "Busca personas del fideicomiso por nombre, DNI o CUIT. Solo lectura.",
        inputSchema: z.object({
          q: z.string().min(2).describe("Nombre, apellido, DNI o CUIT"),
        }),
        execute: async ({ q }) => buscarPersonas(tenant, q),
      }),
    },
    messages: history,
  });

  const text = result.text?.trim();
  if (!text) {
    throw new Error("Claude devolvió vacío");
  }
  return text;
}
