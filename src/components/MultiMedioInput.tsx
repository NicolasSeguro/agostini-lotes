"use client";

import { useEffect } from "react";
import { Plus, X } from "lucide-react";

export type MedioRow = {
  medio_cobro_id: string;
  monto: number | "";
  referencia: string;
};

export type Medio = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
};

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function MultiMedioInput({
  medios,
  rows,
  onChange,
  totalEsperado,
}: {
  medios: Medio[];
  rows: MedioRow[];
  onChange: (rows: MedioRow[]) => void;
  totalEsperado: number;
}) {
  // Inicializar primer row si está vacío
  useEffect(() => {
    if (rows.length === 0 && medios.length > 0) {
      onChange([{ medio_cobro_id: medios[0].id, monto: "", referencia: "" }]);
    }
  }, [rows.length, medios, onChange]);

  function updateRow(idx: number, partial: Partial<MedioRow>) {
    const newRows = rows.map((r, i) => (i === idx ? { ...r, ...partial } : r));
    onChange(newRows);
  }

  function addRow() {
    const usados = new Set(rows.map((r) => r.medio_cobro_id));
    const disponible = medios.find((m) => !usados.has(m.id)) || medios[0];
    onChange([...rows, { medio_cobro_id: disponible.id, monto: "", referencia: "" }]);
  }

  function removeRow(idx: number) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== idx));
  }

  function autoCompletarUltimo() {
    if (rows.length === 0) return;
    const sumaActual = rows.slice(0, -1).reduce(
      (s, r) => s + (typeof r.monto === "number" ? r.monto : 0),
      0
    );
    const restante = totalEsperado - sumaActual;
    if (restante > 0) {
      updateRow(rows.length - 1, { monto: Math.round(restante * 100) / 100 });
    }
  }

  const sumaTotal = rows.reduce(
    (s, r) => s + (typeof r.monto === "number" ? r.monto : 0),
    0
  );
  const diff = totalEsperado - sumaTotal;
  const balanceado = Math.abs(diff) < 0.01;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">Medios de pago</h3>
        <div className="flex gap-2">
          {!balanceado && rows.length > 0 && (
            <button
              type="button"
              onClick={autoCompletarUltimo}
              className="text-xs px-2 py-1 border border-brand-300 text-brand-700 rounded hover:bg-brand-50"
            >
              Auto-completar último
            </button>
          )}
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= medios.length}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus size={12} />
            Agregar medio
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-5">
              <select
                value={row.medio_cobro_id}
                onChange={(e) => updateRow(idx, { medio_cobro_id: e.target.value })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {medios.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.monto}
                onChange={(e) =>
                  updateRow(idx, {
                    monto: e.target.value === "" ? "" : parseFloat(e.target.value),
                  })
                }
                placeholder="Monto"
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-3">
              <input
                type="text"
                value={row.referencia}
                onChange={(e) => updateRow(idx, { referencia: e.target.value })}
                placeholder="Ref. (opc)"
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-1">
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-slate-400 hover:text-red-600"
                  title="Quitar"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between text-xs pt-2 border-t border-slate-100">
        <span className="text-slate-500">Total medios: {formatMoney(sumaTotal)}</span>
        <span className={balanceado ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          {balanceado ? "✓ Balanceado" : `Diferencia: ${formatMoney(diff)}`}
        </span>
      </div>
    </div>
  );
}
