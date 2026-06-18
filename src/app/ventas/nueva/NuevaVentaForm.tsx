"use client";

import { useState, useMemo, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, UserPlus, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { ModalCrearPersona } from "@/components/ModalCrearPersona";
import { MoneyInput } from "@/components/MoneyInput";
import { calcularVenta, defaultFechaPrimerVto, previewPlan, porcentajesEquitativos, CondicionesVenta } from "@/lib/venta-calc";

type Proyecto = {
  id: string;
  nombre: string;
  nombre_abreviado: string | null;
  tope_desc_financiero_pct: number;
};

type Lote = {
  id: string;
  numero: string;
  manzana: string | null;
  numero_padron: string | null;
  superficie_m2: number | null;
  precio_lista: number | null;
  moneda: string;
};

type Persona = {
  id: string;
  nombre: string;
  cuit: string | null;
  doc_numero: string | null;
};

type Titular = {
  persona: Persona;
  porcentaje: number;
};

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

export function NuevaVentaForm({
  tenant,
  porcGravado,
  proyectos,
  ventaInicial,
  permitirCambiarLote,
}: {
  tenant: string;
  porcGravado: number;
  proyectos: Proyecto[];
  ventaInicial?: any;
  permitirCambiarLote?: boolean;
}) {
  const router = useRouter();
  const editando = !!ventaInicial;
  const ventaId = ventaInicial?.id;
  // Si estÃƒÂ¡ editando y NO se permite cambiar lote, queda fijo
  const lotInmutable = editando && !permitirCambiarLote;
  
  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Estado: Lote Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [proyectoId, setProyectoId] = useState<string>(ventaInicial?.lote_proyecto_id || proyectos[0]?.id || "");
  // Si permite cambiar lote, arranca con el lote actual pero el usuario puede limpiarlo
  const [lote, setLote] = useState<Lote | null>(ventaInicial?.lote || null);
  const [loteOriginal] = useState<Lote | null>(ventaInicial?.lote || null);
  const [lotesBusqueda, setLotesBusqueda] = useState<Lote[]>([]);
  const [loteSearch, setLoteSearch] = useState("");
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [showWarningCambioLote, setShowWarningCambioLote] = useState(false);
  const [loteCandidato, setLoteCandidato] = useState<Lote | null>(null);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Estado: Titulares Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [titulares, setTitulares] = useState<Titular[]>(ventaInicial?.titulares || []);
  const [tituSearch, setTituSearch] = useState("");
  const [tituResults, setTituResults] = useState<Persona[]>([]);
  const [loadingTitu, setLoadingTitu] = useState(false);
  const [showModalCrear, setShowModalCrear] = useState(false);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Estado: Convenio Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  type ConvenioOption = {
    id: string;
    razon_social: string;
    tipo_beneficio: "PORCENTAJE" | "MONTO_FIJO";
    valor_beneficio: string | number;
  };
  const [convenios, setConvenios] = useState<ConvenioOption[]>([]);
  const [convenioId, setConvenioId] = useState<string | null>(ventaInicial?.convenio_id || null);

  // Cargar convenios vigentes al montar
  useEffect(() => {
    fetch(`/api/convenios/vigentes?t=${tenant}`)
      .then(r => r.ok ? r.json() : { convenios: [] })
      .then(data => setConvenios(data.convenios || []))
      .catch(() => setConvenios([]));
  }, [tenant]);

  const convenioActual = convenioId 
    ? convenios.find(c => c.id === convenioId) 
    : (ventaInicial?.convenio_id && ventaInicial?.convenio_razon_social ? {
        id: ventaInicial.convenio_id,
        razon_social: ventaInicial.convenio_razon_social,
        tipo_beneficio: ventaInicial.convenio_tipo_beneficio,
        valor_beneficio: ventaInicial.convenio_valor_beneficio,
      } : null);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Estado: Condiciones Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [precioLista, setPrecioLista] = useState<number | "">(ventaInicial?.precio_lista ?? "");
  const [descFinanciero, setDescFinanciero] = useState<number | "">(ventaInicial?.descuento_financiero ?? "");
  const [anticipo, setAnticipo] = useState<number | "">(ventaInicial?.anticipo ?? "");
  const [cantCuotas, setCantCuotas] = useState<number>(ventaInicial?.cant_cuotas ?? 60);
  const [sistemaAmort, setSistemaAmort] = useState<"FRANCES" | "AJUSTABLE">(
    ventaInicial?.sistema_amort === "FRANCES" ? "FRANCES" : "AJUSTABLE"
  );
  const [tasaInteres, setTasaInteres] = useState<number | "">(ventaInicial?.tasa_interes_mensual ?? "");
  const [indiceAjuste, setIndiceAjuste] = useState<string>(
    ventaInicial?.indice_ajuste || "NINGUNO"
  );
  const [fechaPrimerVto, setFechaPrimerVto] = useState<string>(
    ventaInicial?.fecha_primer_vto || defaultFechaPrimerVto()
  );
  const [fechaBoleto, setFechaBoleto] = useState<string>(ventaInicial?.fecha_boleto || "");
  const [observaciones, setObservaciones] = useState(ventaInicial?.observaciones || "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlanPreview, setShowPlanPreview] = useState(false);

  const proyecto = useMemo(() => proyectos.find(p => p.id === proyectoId), [proyectos, proyectoId]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ BÃƒÂºsqueda de lotes Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  useEffect(() => {
    if (!proyectoId || lote) {
      // No buscar si ya hay un lote seleccionado
      if (lote) setLotesBusqueda([]);
      return;
    }
    setLoadingLotes(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/lotes/disponibles?t=${tenant}&proyecto=${proyectoId}&q=${encodeURIComponent(loteSearch)}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setLotesBusqueda(data.results || []);
        }
      } catch {} finally {
        setLoadingLotes(false);
      }
    }, 250);
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [tenant, proyectoId, loteSearch, lote]);

  function seleccionarLote(l: Lote) {
    // Si estÃƒÂ¡ editando con permiso de cambiar lote y el nuevo es distinto al original Ã¢â€ â€™ confirmar
    if (permitirCambiarLote && loteOriginal && l.id !== loteOriginal.id) {
      setLoteCandidato(l);
      setShowWarningCambioLote(true);
      return;
    }
    aplicarLote(l);
  }
  
  function aplicarLote(l: Lote) {
    setLote(l);
    if (l.precio_lista && !precioLista) {
      setPrecioLista(parseFloat(String(l.precio_lista)));
    }
    setShowWarningCambioLote(false);
    setLoteCandidato(null);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ BÃƒÂºsqueda de titulares Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  useEffect(() => {
    if (tituSearch.length < 2) {
      setTituResults([]);
      return;
    }
    setLoadingTitu(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/personas/buscar-titular?t=${tenant}&q=${encodeURIComponent(tituSearch)}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setTituResults(data.results || []);
        }
      } catch {} finally {
        setLoadingTitu(false);
      }
    }, 250);
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [tenant, tituSearch]);

  function agregarTitular(p: Persona) {
    if (titulares.find(t => t.persona.id === p.id)) {
      setError("Esa persona ya estÃƒÂ¡ en la lista de titulares");
      return;
    }
    setError(null);
    const nuevos = [...titulares, { persona: p, porcentaje: 0 }];
    const pcts = porcentajesEquitativos(nuevos.length);
    nuevos.forEach((t, i) => t.porcentaje = pcts[i]);
    setTitulares(nuevos);
    setTituSearch("");
    setTituResults([]);
  }

  function quitarTitular(idx: number) {
    const nuevos = titulares.filter((_, i) => i !== idx);
    if (nuevos.length > 0) {
      const pcts = porcentajesEquitativos(nuevos.length);
      nuevos.forEach((t, i) => t.porcentaje = pcts[i]);
    }
    setTitulares(nuevos);
  }

  function cambiarPorcentaje(idx: number, valor: number) {
    const nuevos = titulares.map((t, i) => i === idx ? { ...t, porcentaje: valor } : t);
    setTitulares(nuevos);
  }

  function repartirEquitativo() {
    if (titulares.length === 0) return;
    const pcts = porcentajesEquitativos(titulares.length);
    setTitulares(titulares.map((t, i) => ({ ...t, porcentaje: pcts[i] })));
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Descuento financiero: % y monto sincronizados Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const descPctActual = useMemo(() => {
    if (!precioLista || precioLista <= 0 || !descFinanciero) return 0;
    return (typeof descFinanciero === "number" ? descFinanciero : 0) / precioLista * 100;
  }, [precioLista, descFinanciero]);

  function cambiarDescPct(porcentaje: number | "") {
    if (porcentaje === "" || !precioLista || precioLista <= 0) {
      setDescFinanciero("");
      return;
    }
    const monto = Math.round((typeof precioLista === "number" ? precioLista : 0) * porcentaje / 100 * 100) / 100;
    setDescFinanciero(monto);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ CÃƒÂ¡lculos derivados Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const sumaPct = titulares.reduce((s, t) => s + t.porcentaje, 0);
  const sumaPctOk = Math.abs(sumaPct - 100) < 0.01 && titulares.length > 0;

  const calc = useMemo(() => {
    if (!precioLista || precioLista <= 0 || !cantCuotas || cantCuotas <= 0) return null;
    const cond: CondicionesVenta = {
      precio_lista: typeof precioLista === "number" ? precioLista : 0,
      desc_financiero: typeof descFinanciero === "number" ? descFinanciero : 0,
      desc_comercial: 0,
      anticipo: typeof anticipo === "number" ? anticipo : 0,
      cant_cuotas: cantCuotas,
      sistema_amort: sistemaAmort,
      tasa_interes_mensual: typeof tasaInteres === "number" ? tasaInteres : 0,
      fecha_primer_vto: fechaPrimerVto,
      convenio: convenioActual ? {
        tipo_beneficio: convenioActual.tipo_beneficio,
        valor_beneficio: parseFloat(String(convenioActual.valor_beneficio)),
      } : null,
    };
    return calcularVenta(cond, porcGravado, proyecto?.tope_desc_financiero_pct || 0.10);
  }, [precioLista, descFinanciero, anticipo, cantCuotas, sistemaAmort, tasaInteres, fechaPrimerVto, porcGravado, proyecto, convenioActual]);

  const planPreview = useMemo(() => {
    if (!calc || calc.cuota_base <= 0) return [];
    return previewPlan(cantCuotas, calc.cuota_base, fechaPrimerVto);
  }, [calc, cantCuotas, fechaPrimerVto]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ ValidaciÃƒÂ³n en vivo Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const errores: string[] = [];
  if (!lote) errores.push("Falta elegir lote");
  if (titulares.length === 0) errores.push("Falta al menos 1 titular");
  if (titulares.length > 0 && !sumaPctOk) errores.push(`Titulares deben sumar 100% (actual: ${sumaPct.toFixed(2)}%)`);
  if (!precioLista || precioLista <= 0) errores.push("Falta precio lista");
  if (!cantCuotas || cantCuotas <= 0) errores.push("Falta cantidad de cuotas");
  if (sistemaAmort === "FRANCES" && (!tasaInteres || tasaInteres <= 0)) errores.push("Sistema FrancÃƒÂ©s requiere tasa de interÃƒÂ©s");
  if (sistemaAmort === "AJUSTABLE" && (!indiceAjuste || indiceAjuste === "NINGUNO")) errores.push("Sistema Ajustable requiere ÃƒÂ­ndice de ajuste (CAC, CVS, UVA, IPC o USD Oficial)");
  if (calc && calc.monto_a_financiar < 0) errores.push("El anticipo no puede superar el precio boleto");

  const puedeCerrar = errores.length === 0;
  const puedeGuardarBorrador = lote && titulares.length > 0; // MÃƒÂ­nimo para guardar borrador

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Submit Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  async function handleSubmit(e: FormEvent, accion: "borrador" | "cerrar") {
    e.preventDefault();
    setError(null);

    if (accion === "cerrar" && !puedeCerrar) {
      setError(errores[0]);
      return;
    }
    if (accion === "borrador" && !puedeGuardarBorrador) {
      setError("Para guardar borrador necesitÃƒÂ¡s al menos un lote y un titular");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        tenant,
        lote_id: lote!.id,
        convenio_id: convenioId,
        titulares: titulares.map(t => ({
          persona_id: t.persona.id,
          porcentaje: t.porcentaje,
        })),
        precio_lista: typeof precioLista === "number" ? precioLista : 0,
        desc_financiero: typeof descFinanciero === "number" ? descFinanciero : 0,
        anticipo: typeof anticipo === "number" ? anticipo : 0,
        cant_cuotas: cantCuotas,
        sistema_amort: sistemaAmort,
        tasa_interes_mensual: typeof tasaInteres === "number" ? tasaInteres : 0,
        indice_ajuste: sistemaAmort === "AJUSTABLE" ? indiceAjuste : "NINGUNO",
        fecha_primer_vto: fechaPrimerVto,
        fecha_boleto: fechaBoleto || null,
        observaciones: observaciones.trim() || null,
      };

      let resultId = ventaId;
      if (editando) {
        const res = await fetch(`/api/ventas/${ventaId}/actualizar`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al actualizar venta");
          setSubmitting(false);
          return;
        }
      } else {
        const res = await fetch("/api/ventas/nueva", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al crear venta");
          setSubmitting(false);
          return;
        }
        resultId = data.venta_id;
      }

      if (accion === "cerrar") {
        const cerrarRes = await fetch(`/api/ventas/${resultId}/cerrar-pendiente`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant }),
        });
        if (!cerrarRes.ok) {
          const cd = await cerrarRes.json();
          setError(`Venta guardada pero no se pudo cerrar: ${cd.error}`);
          setSubmitting(false);
          return;
        }
      }

      router.push(`/ventas/${resultId}?t=${tenant}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexiÃƒÂ³n");
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6">
      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â SECCIÃƒâ€œN 1: LOTE Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">1. Lote a vender</h2>
          {permitirCambiarLote && (
            <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded font-medium">
              Modo cambio de lote habilitado
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Proyecto</label>
            <select
              value={proyectoId}
              onChange={(e) => { setProyectoId(e.target.value); setLote(null); }}
              disabled={lotInmutable}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
            >
              {proyectos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 relative">
            <label className="text-xs text-slate-600 mb-1 block">Buscar lote (M/L/padrÃƒÂ³n)</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={loteSearch}
                onChange={(e) => setLoteSearch(e.target.value)}
                placeholder="Ej: M52, L5, 12345..."
                disabled={!!lote || lotInmutable}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        {lote ? (
          <div className="border-2 border-brand-300 bg-brand-50/50 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-900">
                {lote.manzana ? `M${lote.manzana}-` : ""}L{lote.numero}
                {lote.numero_padron && <span className="text-slate-500 ml-2 text-sm">PadrÃƒÂ³n {lote.numero_padron}</span>}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {lote.superficie_m2 && `${lote.superficie_m2} mÃ‚Â² Ã‚Â· `}
                Precio lista: {lote.precio_lista ? formatMoney(parseFloat(String(lote.precio_lista))) : "(sin definir)"}
              </div>
            </div>
            {!lotInmutable && (
              <button
                type="button"
                onClick={() => setLote(null)}
                className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-white"
              >
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {loadingLotes && <div className="px-4 py-3 text-sm text-slate-500">Buscando...</div>}
            {!loadingLotes && lotesBusqueda.length === 0 && (
              <div className="px-4 py-3 text-sm text-slate-500">
                {loteSearch ? "Sin resultados" : "EmpezÃƒÂ¡ a escribir para buscar"}
              </div>
            )}
            {lotesBusqueda.map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => seleccionarLote(l)}
                className="w-full text-left px-4 py-2 hover:bg-slate-50 transition"
              >
                <div className="font-medium text-sm text-slate-900">
                  {l.manzana ? `M${l.manzana}-` : ""}L{l.numero}
                  {l.numero_padron && <span className="text-slate-500 ml-2 text-xs">PadrÃƒÂ³n {l.numero_padron}</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {l.superficie_m2 && `${l.superficie_m2} mÃ‚Â² Ã‚Â· `}
                  {l.precio_lista ? formatMoney(parseFloat(String(l.precio_lista))) : "(sin precio)"}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â SECCIÃƒâ€œN 2: TITULARES Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">2. Titulares</h2>
          {titulares.length > 1 && (
            <button
              type="button"
              onClick={repartirEquitativo}
              className="text-xs px-3 py-1 border border-slate-300 rounded hover:bg-slate-50"
            >
              Repartir equitativo
            </button>
          )}
        </div>

        {titulares.length > 0 && (
          <div className="space-y-2 mb-4">
            {titulares.map((t, idx) => (
              <div key={t.persona.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-slate-900 text-sm">{t.persona.nombre}</div>
                  <div className="text-xs text-slate-500">{t.persona.cuit || t.persona.doc_numero}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-0.5">% participaciÃƒÂ³n</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={t.porcentaje}
                    onChange={(e) => cambiarPorcentaje(idx, parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => quitarTitular(idx)}
                  className="text-slate-400 hover:text-red-600"
                  title="Quitar"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className={`text-xs px-2 py-1 rounded inline-block ${sumaPctOk ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
              Total participaciÃƒÂ³n: {sumaPct.toFixed(2)}% {sumaPctOk && "Ã¢Å“â€œ"}
            </div>
          </div>
        )}

        <div className="relative">
          <div className="flex gap-2 mb-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={tituSearch}
                onChange={(e) => setTituSearch(e.target.value)}
                placeholder="Buscar por nombre, CUIT o DNI..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowModalCrear(true)}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-brand-300 text-brand-700 rounded-lg hover:bg-brand-50"
            >
              <UserPlus size={14} />
              Crear
            </button>
          </div>

          {tituSearch.length >= 2 && (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {loadingTitu && <div className="px-3 py-2 text-sm text-slate-500">Buscando...</div>}
              {!loadingTitu && tituResults.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-500">Sin resultados</div>
              )}
              {tituResults.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarTitular(p)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 transition"
                >
                  <div className="text-sm font-medium text-slate-900">{p.nombre}</div>
                  <div className="text-xs text-slate-500">{p.cuit || p.doc_numero}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â SECCIÃƒâ€œN 3: CONVENIO (opcional) Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-slate-900">3. Convenio (opcional)</h2>
          {convenioActual && (
            <button
              type="button"
              onClick={() => setConvenioId(null)}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Quitar convenio
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Si el cliente accede a algÃƒÂºn convenio firmado con una entidad, se aplica el descuento antes del financiero.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600 mb-1 block">Convenio</label>
            <select
              value={convenioId || ""}
              onChange={(e) => setConvenioId(e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">-- Sin convenio --</option>
              {convenios.map(c => {
                const v = parseFloat(String(c.valor_beneficio));
                const label = c.tipo_beneficio === "PORCENTAJE" 
                  ? `${c.razon_social} (${v}%)`
                  : `${c.razon_social} (${formatMoney(v)})`;
                return <option key={c.id} value={c.id}>{label}</option>;
              })}
            </select>
            {convenios.length === 0 && (
              <div className="text-xs text-slate-400 mt-1">
                No hay convenios vigentes para este fideicomiso.
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Descuento aplicado</label>
            <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm">
              {calc && convenioActual ? (
                <span className="font-medium text-slate-900">
                  {formatMoney(calc.descuento_convenio)}
                </span>
              ) : (
                <span className="text-slate-400">Ã¢â‚¬â€</span>
              )}
            </div>
          </div>
        </div>

        {calc?.error_convenio_excede_lista && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 inline-flex items-start gap-1">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <span>El descuento del convenio ({formatMoney(calc.descuento_convenio)}) excede el precio lista. Revisar.</span>
          </div>
        )}
      </section>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â SECCIÃƒâ€œN 4: CONDICIONES FINANCIERAS Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">4. Condiciones financieras</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Precio lista</label>
            <MoneyInput
              value={precioLista}
              onChange={setPrecioLista}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">
              Desc. fin. (%) {proyecto && <span className="text-slate-400">tope {pct(proyecto.tope_desc_financiero_pct)}</span>}
            </label>
            <DescPctInput
              precioLista={typeof precioLista === "number" ? precioLista : 0}
              descFinanciero={typeof descFinanciero === "number" ? descFinanciero : 0}
              onChange={cambiarDescPct}
              excedeTope={!!calc?.excede_tope_desc}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Desc. fin. (monto)</label>
            <MoneyInput
              value={descFinanciero}
              onChange={setDescFinanciero}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                calc?.excede_tope_desc ? "border-amber-400 focus:ring-amber-500" : "border-slate-300 focus:ring-brand-500"
              }`}
            />
          </div>
          {calc?.excede_tope_desc && (
            <div className="md:col-span-3">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-flex items-center gap-1">
                <AlertTriangle size={12} />
                Descuento de {pct(calc.desc_financiero_pct)} excede el tope. RequerirÃƒÂ¡ autorizaciÃƒÂ³n del Gerente Comercial.
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Anticipo</label>
            <MoneyInput
              value={anticipo}
              onChange={setAnticipo}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Cantidad de cuotas</label>
            <input
              type="number"
              min="1"
              max="360"
              value={cantCuotas}
              onChange={(e) => setCantCuotas(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Sistema</label>
            <select
              value={sistemaAmort}
              onChange={(e) => setSistemaAmort(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="AJUSTABLE">Ajustable (sin interÃƒÂ©s)</option>
              <option value="FRANCES">FrancÃƒÂ©s (cuota constante)</option>
            </select>
          </div>
          {sistemaAmort === "FRANCES" && (
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Tasa interÃƒÂ©s mensual (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={tasaInteres}
                onChange={(e) => setTasaInteres(e.target.value === "" ? "" : parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
          {sistemaAmort === "AJUSTABLE" && (
            <div>
              <label className="text-xs text-slate-600 mb-1 block">
                ÃƒÂndice de ajuste <span className="text-red-500">*</span>
              </label>
              <select
                value={indiceAjuste}
                onChange={(e) => setIndiceAjuste(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                  indiceAjuste === "NINGUNO"
                    ? "border-red-400 bg-red-50 focus:ring-red-500 font-medium"
                    : "border-slate-300 bg-white focus:ring-brand-500"
                }`}
              >
                <option value="NINGUNO">Ã¢â‚¬â€ ELEGIR INDICE Ã¢â‚¬â€</option>
                <option value="CAC">CAC</option>
                <option value="CVS">CVS</option>
                <option value="UVA">UVA</option>
                <option value="IPC">IPC</option>
                <option value="USD_OFICIAL">USD Oficial</option>
              </select>
              {indiceAjuste === "NINGUNO" && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-red-800 leading-relaxed">
                    <strong>Falta seleccionar el indice.</strong> Las ventas con sistema Ajustable
                    requieren un indice (CAC, CVS, UVA, IPC o USD Oficial) para poder ajustarse mes a mes.
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Fecha 1er vto</label>
            <input
              type="date"
              value={fechaPrimerVto}
              onChange={(e) => setFechaPrimerVto(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Fecha boleto (opcional)</label>
            <input
              type="date"
              value={fechaBoleto}
              onChange={(e) => setFechaBoleto(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-slate-600 mb-1 block">Observaciones</label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </section>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â SECCIÃƒâ€œN 5: RESUMEN Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <section className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-brand-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">5. Resumen</h2>
        {calc ? (
          <>
            {/* Paso a paso del cÃƒÂ¡lculo */}
            <div className="bg-white/60 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Precio lista</span>
                <span className="font-medium">{formatMoney(typeof precioLista === "number" ? precioLista : 0)}</span>
              </div>
              {calc.descuento_convenio > 0 && (
                <div className="flex justify-between text-purple-700">
                  <span>Ã¢Ë†â€™ Descuento convenio {convenioActual?.razon_social ? `(${convenioActual.razon_social})` : ""}</span>
                  <span className="font-medium">Ã¢Ë†â€™ {formatMoney(calc.descuento_convenio)}</span>
                </div>
              )}
              {calc.descuento_convenio > 0 && (
                <div className="flex justify-between border-t border-slate-200 pt-1">
                  <span className="text-slate-600">Subtotal con convenio</span>
                  <span className="font-medium">{formatMoney(calc.subtotal_con_convenio)}</span>
                </div>
              )}
              {(typeof descFinanciero === "number" && descFinanciero > 0) && (
                <div className="flex justify-between text-blue-700">
                  <span>Ã¢Ë†â€™ Descuento financiero</span>
                  <span className="font-medium">Ã¢Ë†â€™ {formatMoney(descFinanciero)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold">
                <span>= Precio boleto</span>
                <span className="text-slate-900">{formatMoney(calc.precio_boleto)}</span>
              </div>
              {(typeof anticipo === "number" && anticipo > 0) && (
                <div className="flex justify-between text-amber-700">
                  <span>Ã¢Ë†â€™ Anticipo</span>
                  <span className="font-medium">Ã¢Ë†â€™ {formatMoney(anticipo)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-1">
                <span className="text-slate-600">= Monto a financiar</span>
                <span className="font-medium">{formatMoney(calc.monto_a_financiar)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 pl-3">
                <span>ÃƒÂ· {cantCuotas} cuotas {sistemaAmort === "FRANCES" && typeof tasaInteres === "number" && tasaInteres > 0 ? `(${tasaInteres}% mensual)` : ""}</span>
              </div>
              <div className="flex justify-between border-t border-brand-300 pt-1 text-lg font-bold">
                <span className="text-slate-900">= Cuota base</span>
                <span className="text-brand-700">{formatMoney(calc.cuota_base)}</span>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-0.5 mb-3 border-t border-brand-200 pt-3">
              <div>DescomposiciÃƒÂ³n IVA del precio boleto (porc gravado: {pct(porcGravado)}):</div>
              <div className="ml-3">Capital gravado: {formatMoney(calc.capital_gr_total)}</div>
              <div className="ml-3">Capital exento: {formatMoney(calc.capital_ex_total)}</div>
              <div className="ml-3">IVA capital: {formatMoney(calc.iva_capital_total)}</div>
            </div>

            {planPreview.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPlanPreview(!showPlanPreview)}
                  className="text-xs text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
                >
                  <ChevronDown size={12} className={showPlanPreview ? "" : "-rotate-90"} />
                  Ver plan de cuotas (preview, se generarÃƒÂ¡ al contabilizar)
                </button>
                {showPlanPreview && (
                  <div className="mt-2 max-h-48 overflow-y-auto bg-white rounded-lg border border-slate-200 p-2">
                    {planPreview.slice(0, 12).map(c => (
                      <div key={c.numero} className="flex justify-between text-xs py-0.5 border-b border-slate-50 last:border-0">
                        <span>Cuota {c.numero} Ã‚Â· {new Date(c.fecha_vto + "T00:00:00").toLocaleDateString("es-AR")}</span>
                        <span className="font-medium">{formatMoney(c.monto)}</span>
                      </div>
                    ))}
                    {planPreview.length > 12 && (
                      <div className="text-xs text-slate-400 text-center py-1">
                        ... y {planPreview.length - 12} cuotas mÃƒÂ¡s
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-500">CompletÃƒÂ¡ los campos para ver el resumen</div>
        )}
      </section>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â BOTONES Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}
        {errores.length > 0 && (
          <div className="mb-3 text-xs text-slate-500">
            Para cerrar la venta falta: {errores.join(" Ã‚Â· ")}
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Link
            href={editando ? `/ventas/${ventaId}?t=${tenant}` : `/ventas?t=${tenant}`}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, "borrador")}
            disabled={submitting || !puedeGuardarBorrador}
            className="px-4 py-2 text-sm border border-brand-300 text-brand-700 rounded-lg hover:bg-brand-50 disabled:opacity-50"
          >
            {submitting ? "Guardando..." : "Guardar borrador"}
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, "cerrar")}
            disabled={submitting || !puedeCerrar}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
            title={!puedeCerrar ? errores.join(" Ã‚Â· ") : ""}
          >
            <CheckCircle2 size={16} />
            {submitting ? "Procesando..." : "Cerrar venta (pasa a confirmar)"}
          </button>
        </div>
      </div>

      {showModalCrear && (
        <ModalCrearPersona
          tenant={tenant}
          onClose={() => setShowModalCrear(false)}
          onCreated={(p) => {
            agregarTitular(p);
            setShowModalCrear(false);
          }}
        />
      )}

      {showWarningCambioLote && loteCandidato && loteOriginal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Confirmar cambio de lote</h2>
            <div className="space-y-3 text-sm">
              <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
                <div className="font-medium text-amber-900">AtenciÃƒÂ³n:</div>
                <div>Ã¢â‚¬Â¢ Al guardar, el lote actual <strong>{loteOriginal.manzana ? `M${loteOriginal.manzana}-` : ""}L{loteOriginal.numero}</strong> volverÃƒÂ¡ a DISPONIBLE</div>
                <div>Ã¢â‚¬Â¢ El nuevo lote <strong>{loteCandidato.manzana ? `M${loteCandidato.manzana}-` : ""}L{loteCandidato.numero}</strong> quedarÃƒÂ¡ RESERVADO</div>
                <div>Ã¢â‚¬Â¢ El anticipo cobrado (si existe) se mantiene asociado a la venta</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="border border-slate-200 rounded p-2">
                  <div className="text-slate-500">Lote actual</div>
                  <div className="font-medium">{loteOriginal.manzana ? `M${loteOriginal.manzana}-` : ""}L{loteOriginal.numero}</div>
                  <div className="text-slate-500 mt-1">{loteOriginal.precio_lista ? formatMoney(parseFloat(String(loteOriginal.precio_lista))) : "Ã¢â‚¬â€"}</div>
                </div>
                <div className="border border-brand-300 bg-brand-50/50 rounded p-2">
                  <div className="text-slate-500">Nuevo lote</div>
                  <div className="font-medium">{loteCandidato.manzana ? `M${loteCandidato.manzana}-` : ""}L{loteCandidato.numero}</div>
                  <div className="text-slate-500 mt-1">{loteCandidato.precio_lista ? formatMoney(parseFloat(String(loteCandidato.precio_lista))) : "Ã¢â‚¬â€"}</div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => { setShowWarningCambioLote(false); setLoteCandidato(null); }}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => aplicarLote(loteCandidato)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg"
              >
                Confirmar cambio
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * Input de porcentaje con estado local.
 * El valor se sincroniza con el exterior solo al blur o cuando es claramente vÃƒÂ¡lido.
 * Esto permite tipear "10,5" sin que se reformatee mientras escribÃƒÂ­s.
 */
function DescPctInput({
  precioLista,
  descFinanciero,
  onChange,
  excedeTope,
}: {
  precioLista: number;
  descFinanciero: number;
  onChange: (pct: number | "") => void;
  excedeTope: boolean;
}) {
  const calcPct = (precioLista > 0 && descFinanciero > 0) ? (descFinanciero / precioLista) * 100 : 0;
  const [local, setLocal] = useState<string>(calcPct > 0 ? calcPct.toFixed(2).replace(".", ",") : "");
  const [focused, setFocused] = useState(false);
  
  // Sync cuando cambia desde afuera y no estÃƒÂ¡ focuseado
  useEffect(() => {
    if (!focused) {
      setLocal(calcPct > 0 ? calcPct.toFixed(2).replace(".", ",") : "");
    }
  }, [calcPct, focused]);
  
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Permitir solo dÃƒÂ­gitos y una coma o punto
    let cleaned = raw.replace(/[^\d.,]/g, "").replace(".", ",");
    // Si tiene mÃƒÂ¡s de una coma, quedarse con la primera
    const coma = cleaned.indexOf(",");
    if (coma !== -1) {
      cleaned = cleaned.substring(0, coma + 1) + cleaned.substring(coma + 1).replace(/,/g, "");
    }
    setLocal(cleaned);
    
    if (cleaned === "" || cleaned === ",") {
      onChange("");
      return;
    }
    const num = parseFloat(cleaned.replace(",", "."));
    if (!isNaN(num) && num >= 0 && num <= 100) {
      onChange(num);
    }
  }
  
  function handleBlur() {
    setFocused(false);
    // Reformatear: si hay valor, mostrar con coma decimal
    if (local && local !== ",") {
      const num = parseFloat(local.replace(",", "."));
      if (!isNaN(num)) {
        setLocal(num.toFixed(2).replace(".", ","));
      }
    }
  }
  
  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      placeholder="0,00"
      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
        excedeTope ? "border-amber-400 focus:ring-amber-500" : "border-slate-300 focus:ring-brand-500"
      }`}
    />
  );
}
