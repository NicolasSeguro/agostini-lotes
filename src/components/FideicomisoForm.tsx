"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, XCircle } from "lucide-react";

const COND_IVA = [
  { v: "RI", l: "Responsable Inscripto" },
  { v: "MONO", l: "Monotributista" },
  { v: "EXENTO", l: "Exento" },
  { v: "CF", l: "Consumidor Final" },
  { v: "NO_RESPONSABLE", l: "No Responsable" },
];

const CARACTER_IVA = ["", "Responsable Inscripto", "Exento", "Monotributo", "No Responsable", "Consumidor Final"];
const CARACTER_GANANCIAS = ["", "Inscripto", "Exento", "No Inscripto"];
const TIPOS_BANCO = ["", "Caja de ahorro", "Cuenta corriente", "Otro"];
const MESES = [
  { v: 1, l: "Enero" }, { v: 2, l: "Febrero" }, { v: 3, l: "Marzo" },
  { v: 4, l: "Abril" }, { v: 5, l: "Mayo" }, { v: 6, l: "Junio" },
  { v: 7, l: "Julio" }, { v: 8, l: "Agosto" }, { v: 9, l: "Septiembre" },
  { v: 10, l: "Octubre" }, { v: 11, l: "Noviembre" }, { v: 12, l: "Diciembre" },
];

export function FideicomisoForm({ fideicomiso }: { fideicomiso: any }) {
  const router = useRouter();

  const df = fideicomiso.datos_fiscales || {};
  const dom = fideicomiso.domicilio_fiscal || {};

  const [tab, setTab] = useState<"datos" | "info">("datos");

  // Pestaña Datos
  const [razonSocial, setRazonSocial] = useState(fideicomiso.razon_social || "");
  const [nombreFantasia, setNombreFantasia] = useState(fideicomiso.nombre_fantasia || "");
  const [cuit, setCuit] = useState(fideicomiso.cuit || "");
  const [condIva, setCondIva] = useState(fideicomiso.cond_iva || "RI");
  const [inicioActividad, setInicioActividad] = useState(fideicomiso.inicio_actividad || "");
  const [domCalle, setDomCalle] = useState(dom.calle || "");
  const [domNumero, setDomNumero] = useState(dom.numero || "");
  const [domLocalidad, setDomLocalidad] = useState(dom.localidad || "");
  const [domCp, setDomCp] = useState(dom.cp || "");
  const [domProvincia, setDomProvincia] = useState(dom.provincia || "Jujuy");
  const [telefono, setTelefono] = useState(df.telefono || "");
  const [email, setEmail] = useState(df.email || "");

  // Pestaña Información
  const ri = df.reg_inmobiliario || {};
  const [ri_circ, setRiCirc] = useState(ri.circunscripcion || "");
  const [ri_seccion, setRiSeccion] = useState(ri.seccion || "");
  const [ri_parcela, setRiParcela] = useState(ri.parcela || "");
  const [ri_padron, setRiPadron] = useState(ri.padron || "");
  const [ri_matricula, setRiMatricula] = useState(ri.matricula || "");

  const esc = df.escritura || {};
  const [esc_numero, setEscNumero] = useState(esc.numero || "");
  const [esc_fecha, setEscFecha] = useState(esc.fecha || "");
  const [esc_escribano, setEscEscribano] = useState(esc.escribano || "");

  const f1 = df.fiscalia_1 || {};
  const [f1_folio, setF1Folio] = useState(f1.folio || "");
  const [f1_acta, setF1Acta] = useState(f1.acta || "");
  const [f1_libro, setF1Libro] = useState(f1.libro || "");
  const [f1_fecha, setF1Fecha] = useState(f1.fecha || "");

  const f2 = df.fiscalia_2 || {};
  const [f2_asiento, setF2Asiento] = useState(f2.asiento || "");
  const [f2_folio, setF2Folio] = useState(f2.folio || "");
  const [f2_legajo, setF2Legajo] = useState(f2.legajo || "");
  const [f2_reg_mercantil, setF2RegMerc] = useState(f2.reg_mercantil || "");
  const [f2_fecha, setF2Fecha] = useState(f2.fecha || "");

  const [caracterIva, setCaracterIva] = useState(df.caracter_iva || "");
  const [caracterGanancias, setCaracterGanancias] = useState(df.caracter_ganancias || "");
  const [ingresosBrutos, setIngresosBrutos] = useState(df.ingresos_brutos || "");
  const [mesCierre, setMesCierre] = useState<number | "">(df.mes_cierre_ejercicio || "");

  const banco = df.banco || {};
  const [bcoNombre, setBcoNombre] = useState(banco.nombre || "");
  const [bcoSucursal, setBcoSucursal] = useState(banco.sucursal || "");
  const [bcoTipo, setBcoTipo] = useState(banco.tipo || "");
  const [bcoCbu, setBcoCbu] = useState(banco.cbu || "");
  const [bcoAlias, setBcoAlias] = useState(banco.alias || "");

  const [observacion, setObservacion] = useState(df.observacion || "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!razonSocial.trim()) { setError("Razón social obligatoria"); setTab("datos"); return; }
    if (!cuit.trim()) { setError("CUIT obligatorio"); setTab("datos"); return; }

    setSubmitting(true);
    try {
      const payload = {
        razon_social: razonSocial.trim(),
        nombre_fantasia: nombreFantasia.trim() || null,
        cuit: cuit.trim(),
        cond_iva: condIva,
        inicio_actividad: inicioActividad || null,
        domicilio: { calle: domCalle, numero: domNumero, localidad: domLocalidad, cp: domCp, provincia: domProvincia },
        telefono, email,
        reg_inm: { circunscripcion: ri_circ, seccion: ri_seccion, parcela: ri_parcela, padron: ri_padron, matricula: ri_matricula },
        escritura: { numero: esc_numero, fecha: esc_fecha || null, escribano: esc_escribano },
        fiscalia_1: { folio: f1_folio, acta: f1_acta, libro: f1_libro, fecha: f1_fecha || null },
        fiscalia_2: { asiento: f2_asiento, folio: f2_folio, legajo: f2_legajo, reg_mercantil: f2_reg_mercantil, fecha: f2_fecha || null },
        caracter_iva: caracterIva, caracter_ganancias: caracterGanancias,
        ingresos_brutos: ingresosBrutos,
        mes_cierre_ejercicio: mesCierre === "" ? null : mesCierre,
        banco: { nombre: bcoNombre, sucursal: bcoSucursal, tipo: bcoTipo, cbu: bcoCbu, alias: bcoAlias },
        observacion,
      };
      const res = await fetch(`/api/fideicomisos/${fideicomiso.slug}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al guardar"); setSubmitting(false); return; }
      router.push("/fideicomisos");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-xs text-slate-600 mb-1 block";

  return (
    <div className="space-y-6">
      <Link href="/fideicomisos" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft size={16} /> Volver al listado
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">{fideicomiso.razon_social}</h1>
        <p className="text-slate-500 mt-1">Slug: <span className="font-mono">{fideicomiso.slug}</span></p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("datos")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === "datos" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Datos
        </button>
        <button
          onClick={() => setTab("info")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === "info" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Información
        </button>
      </div>

      {/* Pestaña Datos */}
      {tab === "datos" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Datos principales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Razón social *</label>
              <input className={inputCls} value={razonSocial} onChange={e => setRazonSocial(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>CUIT *</label>
              <input className={inputCls} value={cuit} onChange={e => setCuit(e.target.value)} placeholder="00-00000000-0" />
            </div>
            <div>
              <label className={labelCls}>Nombre fantasía</label>
              <input className={inputCls} value={nombreFantasia} onChange={e => setNombreFantasia(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Condición IVA</label>
              <select className={inputCls + " bg-white"} value={condIva} onChange={e => setCondIva(e.target.value)}>
                {COND_IVA.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Inicio de actividades</label>
              <input type="date" className={inputCls} value={inicioActividad} onChange={e => setInicioActividad(e.target.value)} />
            </div>
            <div></div>
            <div className="md:col-span-2"><h3 className="text-sm font-semibold text-slate-700 mt-2">Domicilio legal</h3></div>
            <div><label className={labelCls}>Calle</label><input className={inputCls} value={domCalle} onChange={e => setDomCalle(e.target.value)} /></div>
            <div><label className={labelCls}>Número</label><input className={inputCls} value={domNumero} onChange={e => setDomNumero(e.target.value)} /></div>
            <div><label className={labelCls}>Localidad</label><input className={inputCls} value={domLocalidad} onChange={e => setDomLocalidad(e.target.value)} /></div>
            <div><label className={labelCls}>CP</label><input className={inputCls} value={domCp} onChange={e => setDomCp(e.target.value)} /></div>
            <div><label className={labelCls}>Provincia</label><input className={inputCls} value={domProvincia} onChange={e => setDomProvincia(e.target.value)} /></div>
            <div></div>
            <div><label className={labelCls}>Teléfono</label><input className={inputCls} value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="(000)-0000000" /></div>
            <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
        </div>
      )}

      {/* Pestaña Información */}
      {tab === "info" && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">Datos fiscales y financieros</h2>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Reg. Inmobiliario</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Circunscripción</label><input className={inputCls} value={ri_circ} onChange={e => setRiCirc(e.target.value)} /></div>
              <div><label className={labelCls}>Sección</label><input className={inputCls} value={ri_seccion} onChange={e => setRiSeccion(e.target.value)} /></div>
              <div><label className={labelCls}>Parcela</label><input className={inputCls} value={ri_parcela} onChange={e => setRiParcela(e.target.value)} /></div>
              <div><label className={labelCls}>Padrón</label><input className={inputCls} value={ri_padron} onChange={e => setRiPadron(e.target.value)} /></div>
              <div><label className={labelCls}>Matrícula</label><input className={inputCls} value={ri_matricula} onChange={e => setRiMatricula(e.target.value)} /></div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Escritura</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Número</label><input className={inputCls} value={esc_numero} onChange={e => setEscNumero(e.target.value)} /></div>
              <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={esc_fecha} onChange={e => setEscFecha(e.target.value)} /></div>
              <div className="md:col-span-2"><label className={labelCls}>Escribano</label><input className={inputCls} value={esc_escribano} onChange={e => setEscEscribano(e.target.value)} /></div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Fiscalía 1</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Folio</label><input className={inputCls} value={f1_folio} onChange={e => setF1Folio(e.target.value)} /></div>
              <div><label className={labelCls}>Acta</label><input className={inputCls} value={f1_acta} onChange={e => setF1Acta(e.target.value)} /></div>
              <div><label className={labelCls}>Libro</label><input className={inputCls} value={f1_libro} onChange={e => setF1Libro(e.target.value)} /></div>
              <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={f1_fecha} onChange={e => setF1Fecha(e.target.value)} /></div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Fiscalía 2</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Asiento</label><input className={inputCls} value={f2_asiento} onChange={e => setF2Asiento(e.target.value)} /></div>
              <div><label className={labelCls}>Folio</label><input className={inputCls} value={f2_folio} onChange={e => setF2Folio(e.target.value)} /></div>
              <div><label className={labelCls}>Legajo</label><input className={inputCls} value={f2_legajo} onChange={e => setF2Legajo(e.target.value)} /></div>
              <div><label className={labelCls}>Reg. Mercantil</label><input className={inputCls} value={f2_reg_mercantil} onChange={e => setF2RegMerc(e.target.value)} /></div>
              <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={f2_fecha} onChange={e => setF2Fecha(e.target.value)} /></div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Carácter impositivo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Carácter IVA</label>
                <select className={inputCls + " bg-white"} value={caracterIva} onChange={e => setCaracterIva(e.target.value)}>
                  {CARACTER_IVA.map(o => <option key={o} value={o}>{o || "Seleccionar..."}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Carácter Ganancias</label>
                <select className={inputCls + " bg-white"} value={caracterGanancias} onChange={e => setCaracterGanancias(e.target.value)}>
                  {CARACTER_GANANCIAS.map(o => <option key={o} value={o}>{o || "Seleccionar..."}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Ingresos Brutos / Convenio</label><input className={inputCls} value={ingresosBrutos} onChange={e => setIngresosBrutos(e.target.value)} /></div>
              <div>
                <label className={labelCls}>Mes cierre ejercicio</label>
                <select className={inputCls + " bg-white"} value={mesCierre} onChange={e => setMesCierre(e.target.value ? parseInt(e.target.value) : "")}>
                  <option value="">Seleccionar...</option>
                  {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Datos bancarios</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Banco - Nombre</label><input className={inputCls} value={bcoNombre} onChange={e => setBcoNombre(e.target.value)} /></div>
              <div><label className={labelCls}>Banco - Sucursal</label><input className={inputCls} value={bcoSucursal} onChange={e => setBcoSucursal(e.target.value)} /></div>
              <div>
                <label className={labelCls}>Banco - Tipo</label>
                <select className={inputCls + " bg-white"} value={bcoTipo} onChange={e => setBcoTipo(e.target.value)}>
                  {TIPOS_BANCO.map(o => <option key={o} value={o}>{o || "Seleccionar..."}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Banco - CBU</label><input className={inputCls} value={bcoCbu} onChange={e => setBcoCbu(e.target.value)} maxLength={22} /></div>
              <div className="md:col-span-2"><label className={labelCls}>Banco - Alias</label><input className={inputCls} value={bcoAlias} onChange={e => setBcoAlias(e.target.value)} /></div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Observación</h3>
            <textarea rows={3} className={inputCls} value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Observaciones..." />
          </section>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
          <XCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link href="/fideicomisos" className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium">Cancelar</Link>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
          <Save size={16} /> {submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
