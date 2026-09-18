"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" }));
        setError(data.error || "Error al iniciar sesion");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Error de conexion. Verifica tu internet.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-[1.1fr_0.9fr]">
      <div className="hidden md:flex flex-col justify-between bg-ink text-cream-50 p-10">
        <div>
          <div className="text-[11px] tracking-[0.28em] text-stone-500">GRUPO ADI</div>
          <div className="font-serif text-5xl mt-3 leading-none">
            Agostini<span className="text-brand-400">.</span>
          </div>
          <div className="text-[12px] tracking-[0.32em] text-stone-500 mt-2">OPS</div>
        </div>
        <p className="max-w-sm text-stone-400 text-sm leading-relaxed">
          Panel de operaciones para lotes financiados. El motor de cuotas no se
          reescribe: acá se ve, se decide y se conversa con la cartera.
        </p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-stone-600">
          entorno · staging
        </p>
      </div>

      <div className="flex items-center justify-center bg-cream-50 px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
              Entrar
            </p>
            <h1 className="font-serif text-3xl text-ink mt-1">Buen día</h1>
            <p className="text-sm text-stone-500 mt-1">
              Usá tu usuario de Agostini Ops.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Usuario
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Contraseña
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full bg-ink hover:bg-ink-muted">
            {loading ? "Ingresando..." : (
              <>
                Continuar <ArrowRight size={16} />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
