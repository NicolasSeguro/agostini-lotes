"use client";

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Save, XCircle, AlertTriangle } from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";
import { validarCuit, formatearCuit } from "@/lib/cuit-validator";

const TENANTS = [
  { slug: "jacaranda", nombre: "Jacaranda" },
  { slug: "tipuana", nombre: "Tipuana" },
  { slug: "alisos", nombre: "Alisos" },
  { slug: "boulevard", nombre: "Boulevard" },
];

type Convenio = {
  id?: string;
  razon_social?: string;
  cuit?: string;
  fecha_inicio?: string | Date;
  fecha_fin?: string | Date;
  tipo_beneficio?: "PORCENTAJE" | "MONTO_FIJO";
  valor_beneficio?: number | string;
  tenants_aplicables?: string[];
  observaciones?: string | null;
  activo?: boolean;
};

// Convierte una fecha (que puede venir como Date o string ISO) al formato YYYY-MM-DD para inputs date
function toDateInputStr(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  // Fallback: intentar parsearlo
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ""; }
}

export function ConvenioForm({ 
  tenant, 
  convenio, 
  modo,
}: { 
  tenant: string; 
  convenio?: Convenio;
  modo: "nuevo" | "editar";
}) {
  const router = useRouter();
  const editando = modo === "editar";

  // Estado
  const [razonSocial, setRazonSocial] = useState(convenio?.razon_social || "");
  const [cuit, setCuit] = useState(convenio?.cuit || "");
  const [fechaInicio, setFechaInicio] = useState(
    convenio?.fecha_inicio ? toDateInputStr(convenio.fecha_inicio) : new Date().toISOString().slice(0, 10)
  );
  const [fechaFin, setFechaFin] = useState(
    convenio?.fecha_fin ? toDateInputStr(convenio.fecha_fin) : ""
  );
  const [tipoBeneficio, setTipoBeneficio] = useState<"PORCENTAJE" | "MONTO_FIJO">(
    convenio?.tipo_beneficio || "PORCENTAJE"
  );
  const [valorBeneficio, setValorBeneficio] = useState<number | "">(
    convenio?.valor_beneficio ? parseFloat(String(convenio.valor_beneficio)) : ""
  );
  const [tenantsAplicables, setTenantsAplicables] = useState<string[]>(
    convenio?.tenants_aplicables || ["jacaranda", "tipuana", "alisos", "boulevard"]
  );
  const [observaciones, setObservaciones] = useState(convenio?.observaciones || "");
  const [activo, setActivo] = useState(convenio?.activo !== false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validación CUIT en vivo (para feedback al usuario)
  const cuitVal = cuit ? validarCuit(cuit) : { valido: false, error: undefined };
  const cuitMostrado = cuit ? formatearCuit(cuit) : "";

  function toggleTenant(slug: string) {
    if (tenantsAplicables.includes(slug)) {
      setTenantsAplicables(tenantsAplicables.filter(t => t !== slug));
    } else {
      setTenantsAplicables([...tenantsAplicables, slug]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Validaciones cliente
    if (razonSocial.trim().length < 2) { setError("Razón social requerida"); return; }
    if (!cuitVal.valido) { setError(`CUIT inválido: ${cuitVal.error || "verificar"}`); return; }
    if (!fechaInicio || !fechaFin) { setError("Fechas requeridas"); return; }
    if (fechaFin < fechaInicio) { setError("Fecha fin debe ser >= fecha inicio"); return; }
    if (!valorBeneficio || (typeof valorBeneficio === "number" && valorBeneficio <= 0)) {
      setError("Valor del beneficio requerido y mayor a 0"); return;
    }
    if (tipoBeneficio === "PORCENTAJE" && typeof valorBeneficio === "number" && valorBeneficio > 100) {
      setError("Porcentaje no puede superar 100%"); return;
    }
    if (tenantsAplicables.length === 0) { setError("Seleccioná al menos un fideicomiso"); return; }

    setSubmitting(true);
    try {
      const payload = {
        razon_social: razonSocial.trim(),
        cuit: cuit,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        tipo_beneficio: tipoBeneficio,
        valor_beneficio: valorBeneficio,
        tenants_aplicables: tenantsAplicables,
        observaciones: observaciones.trim() || null,
        activo: editando ? activo : true,
      };

      const url = editando ? `/api/convenios/${convenio!.id}` : `/api/convenios`;
      const method = editando ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al guardar"); setSubmitting(false); return; }

      router.push(`/convenios?t=${tenant}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link
        href={`/convenios?t=${tenant}`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Volver al listado
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {editando ? "Editar Convenio" : "Nuevo Convenio"}
        </h1>
        <p className="text-slate-500 mt-1">
          {editando 
            ? "Los cambios no afectan ventas existentes que ya aplicaron este convenio." 
            : "Acuerdo con una entidad que da beneficio en el precio de venta."}
        </p>
      </div>

      {/* Entidad */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Entidad</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600 mb-1 block">Razón social *</label>
            <input
              type="text"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Ej: UTA Jujuy, Banco Macro..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">CUIT *</label>
            <input
              type="text"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              placeholder="20-12345678-9"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                cuit && !cuitVal.valido 
                  ? "border-red-300 focus:ring-red-500" 
                  : cuit && cuitVal.valido 
                    ? "border-green-300 focus:ring-green-500"
                    : "border-slate-300 focus:ring-brand-500"
              }`}
            />
            {cuit && cuitVal.valido && (
              <div className="text-xs text-green-700 mt-1">âœ“ Válido: {cuitMostrado}</div>
            )}
            {cuit && !cuitVal.valido && cuitVal.error && (
              <div className="text-xs text-red-700 mt-1">{cuitVal.error}</div>
            )}
          </div>
        </div>
      </section>

      {/* Vigencia */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Vigencia</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Fecha inicio *</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Fecha fin *</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              min={fechaInicio}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </section>

      {/* Beneficio */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Beneficio</h2>
        <div className="space-y-3">
          <div className="flex gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="tipo"
                value="PORCENTAJE"
                checked={tipoBeneficio === "PORCENTAJE"}
                onChange={() => setTipoBeneficio("PORCENTAJE")}
              />
              <span className="text-sm">% sobre precio lista</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="tipo"
                value="MONTO_FIJO"
                checked={tipoBeneficio === "MONTO_FIJO"}
                onChange={() => setTipoBeneficio("MONTO_FIJO")}
              />
              <span className="text-sm">Monto fijo</span>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">
                Valor del beneficio *
              </label>
              {tipoBeneficio === "PORCENTAJE" ? (
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={valorBeneficio === "" ? "" : valorBeneficio}
                    onChange={(e) => setValorBeneficio(e.target.value ? parseFloat(e.target.value) : "")}
                    placeholder="Ej: 5"
                    className="w-full pr-10 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="absolute right-3 top-2 text-slate-500 text-sm">%</span>
                </div>
              ) : (
                <MoneyInput
                  value={valorBeneficio}
                  onChange={setValorBeneficio}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tenants */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Fideicomisos donde aplica *</h2>
        <p className="text-xs text-slate-500 mb-3">
          Por defecto aplica a todos. Destildá los que NO aplican.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TENANTS.map(t => (
            <label key={t.slug} className="inline-flex items-center gap-2 cursor-pointer p-2 border border-slate-200 rounded hover:bg-slate-50">
              <input
                type="checkbox"
                checked={tenantsAplicables.includes(t.slug)}
                onChange={() => toggleTenant(t.slug)}
              />
              <span className="text-sm">{t.nombre}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Observaciones */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Observaciones (opcional)</h2>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={3}
          placeholder="Notas internas sobre el convenio..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </section>

      {/* Estado (solo en editar) */}
      {editando && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Estado</h2>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            <span className="text-sm">Activo (visible para nuevas ventas)</span>
          </label>
          {!activo && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2 inline-flex items-start gap-1">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>El convenio queda dado de baja. Ventas existentes no se afectan, pero no aparecerá para ventas nuevas.</span>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
          <XCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3">
        <Link
          href={`/convenios?t=${tenant}`}
          className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
        >
          <Save size={16} />
          {submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}
