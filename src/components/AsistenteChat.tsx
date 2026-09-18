"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

const SUGERIDAS = [
  { q: "¿A quién llamo primero por mora?", hint: "Prioridad de atrasos" },
  { q: "¿Qué está esperando decisión?", hint: "Carga, autorización, caja" },
  { q: "¿Cuántos lotes quedan?", hint: "Stock del fideicomiso" },
  { q: "Resumen de hoy", hint: "Todo en una mirada" },
];

type Msg = { role: "user" | "assistant"; text: string; motor?: string };

export function AsistenteChat({
  tenant,
  variant = "panel",
  title,
  subtitle,
}: {
  tenant: string;
  variant?: "hero" | "panel";
  title?: string;
  subtitle?: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, loading]);

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
          motor: data.motor,
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: "No pude conectar. Probá de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  const empty = msgs.length === 0 && !loading;
  const composer = (
    <form
      onSubmit={onSubmit}
      className="rounded-[28px] border border-stone-200/90 bg-white shadow-[0_12px_40px_-24px_rgba(22,20,31,0.45)] px-4 py-3 flex items-end gap-2"
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send(input);
          }
        }}
        rows={1}
        placeholder="Preguntá por mora, una venta, un lote o un cliente…"
        className="flex-1 resize-none bg-transparent text-[15px] leading-6 py-2 outline-none min-h-[44px] max-h-32"
      />
      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="w-11 h-11 rounded-full bg-ink text-cream-50 inline-flex items-center justify-center disabled:opacity-30"
        aria-label="Enviar"
      >
        <ArrowUp size={18} />
      </button>
    </form>
  );

  if (variant === "hero" && empty) {
    return (
      <div className="flex flex-col items-center text-center pt-6 md:pt-10">
        <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
          Agostini · operación
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-ink mt-3 tracking-tight">
          {title || "¿En qué te ayudo?"}
        </h1>
        <p className="text-stone-500 mt-3 max-w-md">
          {subtitle ||
            "Preguntá en castellano. Leo mora, ventas y stock de este fideicomiso."}
        </p>
        <div className="w-full max-w-2xl mt-8">{composer}</div>
        <ul className="w-full max-w-2xl mt-6 text-left divide-y divide-stone-200/80">
          {SUGERIDAS.map((s) => (
            <li key={s.q}>
              <button
                type="button"
                onClick={() => send(s.q)}
                className="w-full flex items-center justify-between gap-3 py-3.5 px-1 text-sm hover:text-ink text-stone-600"
              >
                <span>{s.q}</span>
                <span className="text-[11px] text-stone-400 hidden sm:inline">
                  {s.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[420px]">
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto pr-1">
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
                {m.motor === "claude" ? "Agostini · Claude" : "Agostini"}
              </div>
            )}
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="text-xs text-stone-400 px-1">Leyendo la cartera…</div>
        )}
      </div>
      <div className="mt-4">{composer}</div>
    </div>
  );
}
