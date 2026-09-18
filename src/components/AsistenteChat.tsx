"use client";

import { FormEvent, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGERIDAS = [
  "¿Qué está en espera?",
  "¿Quién está en mora?",
  "¿Cuántos lotes hay disponibles?",
  "Resumen del día",
];

type Msg = { role: "user" | "assistant"; text: string };

export function AsistenteChat({
  tenant,
  saludo,
}: {
  tenant: string;
  saludo: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: saludo },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", text: trimmed }];
    setMsgs(next);
    setLoading(true);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          tenant,
          messages: next.slice(-10).map((m) => ({
            role: m.role,
            content: m.text,
          })),
        }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply || data.error || "No pude responder.",
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: "Error de conexion. Proba de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex flex-col h-full min-h-[420px]">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-2xl rounded-br-md bg-ink text-cream-50 px-4 py-3 text-sm whitespace-pre-wrap"
                : "mr-8 rounded-2xl rounded-bl-md bg-white border border-stone-200/80 px-4 py-3 text-sm text-stone-800 whitespace-pre-wrap"
            }
          >
            {m.role === "assistant" && (
              <div className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mb-1">
                Asistente
              </div>
            )}
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="text-xs text-stone-400 px-1">Pensando con datos reales…</div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {SUGERIDAS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            className="text-xs px-3 py-1.5 rounded-full border border-stone-200 bg-white hover:bg-cream-50 text-stone-600"
          >
            {s}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntale a la operación…"
          className="flex-1 min-h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        />
        <Button type="submit" disabled={loading || !input.trim()} className="px-3">
          <ArrowUp size={16} />
        </Button>
      </form>
    </div>
  );
}
