"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
          Operación
        </p>
        <h1 className="font-serif text-3xl text-ink mt-2">
          Esta pantalla no pudo cargar
        </h1>
        <p className="text-sm text-stone-500 mt-3">
          Suele ser un dato que todavía no está en staging. El resto del panel
          sigue disponible.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 px-4 rounded-xl bg-ink text-cream-50 text-sm"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="min-h-11 px-4 rounded-xl border border-stone-200 text-sm inline-flex items-center"
          >
            Ir al resumen
          </Link>
        </div>
      </div>
    </div>
  );
}
