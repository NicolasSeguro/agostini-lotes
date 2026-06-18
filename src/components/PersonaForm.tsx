"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, XCircle, AlertTriangle } from "lucide-react";

const TIPOS_DOC = ["DNI", "CUIT", "CUIL", "CDI", "LE", "LC", "PASAPORTE", "CI_EXTRANJERA"];
const COND_IVA = [
  { v: "CF", l: "Consumidor Final" },
  { v: "MONO", l: "Monotributista" },
  { v: "RI", l: "Responsable Inscripto" },
  { v: "EXENTO", l: "Exento" },
  { v: "NO_RESPONSABLE", l: "No Responsable" },
  { v: "RNI", l: "Resp. No Inscripto" },
  { v: "EXTERIOR", l: "Exterior" },
];
const ESTADOS_CIVIL = ["Soltero/a", "Casado/a", "Divorciado/a", "Viudo/a", "UniÃ³n convivencial", "Separado/a"];

type Persona = any;

export function PersonaForm({
  tenant,
  persona,
  modo,
}: {
  tenant: string;
  persona?: Persona;
  modo: "nuevo" | "editar";
}) {
  const router = useRouter();
  const editando = modo === "editar";

  const [tipo, setTipo] = useState<"FISICA" | "JURIDICA">(persona?.tipo || "FISICA");
  // Comunes
  const [docTipo, setDocTipo] = useState(persona?.doc_tipo || "DNI");
  const [docNumero, setDocNumero] = useState(persona?.doc_numero || "");
  const [cuit, setCuit] = useState(persona?.cuit || "");
  const [condIva, setCondIva] = useState(persona?.cond_iva || "CF");
  const [email, setEmail] = useState(persona?.email || "");
  const [emailAlt, setEmailAlt] = useState(persona?.email_alt || "");
  const [telefono, setTelefono] = useState(persona?.telefono || "");
  const [telefonoAlt, setTelefonoAlt] = useState(persona?.telefono_alt || "");
  const [dirCalle, setDirCalle] = useState(persona?.direccion_calle || "");
  const [dirNumero, setDirNumero] = useState(persona?.direccion_numero || "");
  const [dirBarrio, setDirBarrio] = useState(persona?.direccion_barrio || "");
  const [dirLocalidad, setDirLocalidad] = useState(persona?.direccion_localidad || "");
  const [dirProvincia, setDirProvincia] = useState(persona?.direccion_provincia || "Jujuy");
  const [dirPais, setDirPais] = useState(persona?.direccion_pais || "Argentina");
  const [actividad, setActividad] = useState(persona?.actividad || "");
  const [observaciones, setObservaciones] = useState(persona?.observaciones || "");
  const [activo, setActivo] = useState(persona?.activo !== false);
  // FÃ­sica
  const [apellido, setApellido] = useState(persona?.apellido || "");
  const [nombre, setNombre] = useState(persona?.nombre || "");
  const [fechaNac, setFechaNac] = useState(persona?.fecha_nac || "");
  const [profesion, setProfesion] = useState(persona?.profesion || "");
  const [estadoCivil, setEstadoCivil] = useState(persona?.estado_civil || "");
  const [sujetoObligado, setSujetoObligado] = useState<boolean>(persona?.sujeto_obligado || false);
  const [sujetoExpuesto, setSujetoExpuesto] = useState<boolean>(persona?.sujeto_expuesto || false);
  // JurÃ­dica
  const [razonSocial, setRazonSocial] = useState(persona?.razon_social || "");
  const [inicioActividad, setInicioActividad] = useState(persona?.inicio_actividad || "");
  const [refNombre, setRefNombre] = useState(persona?.referente_nombre || "");
  const [refDocTipo, setRefDocTipo] = useState(persona?.referente_doc_tipo || "DNI");
  const [refDocNumero, setRefDocNumero] = useState(persona?.referente_doc_numero || "");
  const [refCargo, setRefCargo] = useState(persona?.referente_cargo || "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (tipo === "FISICA") {
      if (!docNumero.trim()) { setError("Documento obligatorio"); return; }
      if (!apellido.trim() || !nombre.trim()) { setError("Apellido y nombre obligatorios"); return; }
    } else {
      if (!razonSocial.trim()) { setError("RazÃ³n social obligatoria"); return; }
      if (!cuit.trim() || cuit.replace(/[^0-9]/g, "").length < 10) { setError("El CUIT es obligatorio para persona jurÃ­dica"); return; }
    }

    setSubmitting(true);
    try {
      const payload: any = {
        tenant, tipo,
        doc_tipo: docTipo, doc_numero: docNumero.trim(), cuit: cuit.trim() || null,
        cond_iva: condIva,
        email: email.trim() || null, email_alt: emailAlt.trim() || null,
        telefono: telefono.trim() || null, telefono_alt: telefonoAlt.trim() || null,
        direccion_calle: dirCalle.trim() || null, direccion_numero: dirNumero.trim() || null,
        direccion_barrio: dirBarrio.trim() || null, direccion_localidad: dirLocalidad.trim() || null,
        direccion_provincia: dirProvincia.trim() || null, direccion_pais: dirPais.trim() || null,
        actividad: actividad.trim() || null,
        observaciones: observaciones.trim() || null,
        activo,
        // FÃ­sica
        apellido: tipo === "FISICA" ? apellido.trim() : null,
        nombre: tipo === "FISICA" ? nombre.trim() : null,
        fecha_nac: tipo === "FISICA" ? (fechaNac || null) : null,
        profesion: tipo === "FISICA" ? (profesion.trim() || null) : null,
        estado_civil: tipo === "FISICA" ? (estadoCivil || null) : null,
        sujeto_obligado: tipo === "FISICA" ? sujetoObligado : false,
        sujeto_expuesto: tipo === "FISICA" ? sujetoExpuesto : false,
        // JurÃ­dica
        razon_social: tipo === "JURIDICA" ? razonSocial.trim() : null,
        inicio_actividad: tipo === "JURIDICA" ? (inicioActividad || null) : null,
        referente_nombre: tipo === "JURIDICA" ? (refNombre.trim() || null) : null,
        referente_doc_tipo: tipo === "JURIDICA" ? refDocTipo : null,
        referente_doc_numero: tipo === "JURIDICA" ? (refDocNumero.trim() || null) : null,
        referente_cargo: tipo === "JURIDICA" ? (refCargo.trim() || null) : null,
      };

      const url = editando ? `/api/personas/${persona.id}` : `/api/personas/crear`;
      const method = editando ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al guardar"); setSubmitting(false); return; }
      router.push(`/personas?t=${tenant}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexiÃ³n");
      setSubmitting(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-xs text-slate-600 mb-1 block";

  return (
    <div className="space-y-6">
      <Link href={`/personas?t=${tenant}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft size={16} /> Volver al listado
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {editando ? "Editar Persona" : "Nueva Persona"}
        </h1>
      </div>

      {/* Selector tipo */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={tipo === "FISICA"} onChange={() => setTipo("FISICA")} disabled={editando} />
            <span className="text-sm font-medium">Persona FÃ­sica</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={tipo === "JURIDICA"} onChange={() => setTipo("JURIDICA")} disabled={editando} />
            <span className="text-sm font-medium">Persona JurÃ­dica</span>
          </label>
          {editando && <span className="text-xs text-slate-400 ml-2">(el tipo no se cambia al editar)</span>}
        </div>
      </div>

      {tipo === "FISICA" ? (
        <FisicaFields {...{
          nombre, setNombre, apellido, setApellido, docTipo, setDocTipo, docNumero, setDocNumero,
          cuit, setCuit, fechaNac, setFechaNac, profesion, setProfesion, actividad, setActividad,
          estadoCivil, setEstadoCivil, dirCalle, setDirCalle, dirNumero, setDirNumero,
          dirBarrio, setDirBarrio, dirLocalidad, setDirLocalidad, dirProvincia, setDirProvincia, dirPais, setDirPais,
          email, setEmail, emailAlt, setEmailAlt, telefono, setTelefono, telefonoAlt, setTelefonoAlt,
          sujetoObligado, setSujetoObligado, sujetoExpuesto, setSujetoExpuesto, condIva, setCondIva,
          inputCls, labelCls,
        }} />
      ) : (
        <JuridicaFields {...{
          razonSocial, setRazonSocial, condIva, setCondIva, cuit, setCuit, inicioActividad, setInicioActividad,
          actividad, setActividad, refNombre, setRefNombre, refDocTipo, setRefDocTipo,
          refDocNumero, setRefDocNumero, refCargo, setRefCargo,
          dirCalle, setDirCalle, dirNumero, setDirNumero, dirBarrio, setDirBarrio,
          dirLocalidad, setDirLocalidad, dirProvincia, setDirProvincia, dirPais, setDirPais,
          email, setEmail, emailAlt, setEmailAlt, telefono, setTelefono, telefonoAlt, setTelefonoAlt,
          docTipo, setDocTipo, docNumero, setDocNumero,
          inputCls, labelCls,
        }} />
      )}

      {/* Observaciones */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Observaciones</h2>
        <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3}
          placeholder="Observaciones..." className={inputCls} />
      </section>

      {/* Estado (editar) */}
      {editando && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            <span className="text-sm">Activa (disponible para nuevas ventas)</span>
          </label>
          {!activo && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2 inline-flex items-start gap-1">
              <AlertTriangle size={12} className="mt-0.5" />
              <span>Persona inactiva: no aparecerÃ¡ al cargar nuevas ventas. Las ventas existentes no se afectan.</span>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
          <XCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link href={`/personas?t=${tenant}`} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium">
          Cancelar
        </Link>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
          <Save size={16} /> {submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function FisicaFields(p: any) {
  return (
    <>
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Datos personales</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={p.labelCls}>Nombre *</label><input className={p.inputCls} value={p.nombre} onChange={e => p.setNombre(e.target.value)} /></div>
          <div><label className={p.labelCls}>Apellido *</label><input className={p.inputCls} value={p.apellido} onChange={e => p.setApellido(e.target.value)} /></div>
          <div>
            <label className={p.labelCls}>Tipo doc. *</label>
            <select className={p.inputCls + " bg-white"} value={p.docTipo} onChange={e => p.setDocTipo(e.target.value)}>
              {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className={p.labelCls}>Documento *</label><input className={p.inputCls} value={p.docNumero} onChange={e => p.setDocNumero(e.target.value)} /></div>
          <div><label className={p.labelCls}>CUIL/CUIT</label><input className={p.inputCls} value={p.cuit} onChange={e => p.setCuit(e.target.value)} placeholder="00-00000000-0" /></div>
          <div><label className={p.labelCls}>Fecha nac.</label><input type="date" className={p.inputCls} value={p.fechaNac} onChange={e => p.setFechaNac(e.target.value)} /></div>
          <div><label className={p.labelCls}>OcupaciÃ³n</label><input className={p.inputCls} value={p.profesion} onChange={e => p.setProfesion(e.target.value)} /></div>
          <div><label className={p.labelCls}>Actividad</label><input className={p.inputCls} value={p.actividad} onChange={e => p.setActividad(e.target.value)} /></div>
          <div>
            <label className={p.labelCls}>Estado civil</label>
            <select className={p.inputCls + " bg-white"} value={p.estadoCivil} onChange={e => p.setEstadoCivil(e.target.value)}>
              <option value="">Seleccionar...</option>
              {ESTADOS_CIVIL.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className={p.labelCls}>CondiciÃ³n IVA</label>
            <select className={p.inputCls + " bg-white"} value={p.condIva} onChange={e => p.setCondIva(e.target.value)}>
              {COND_IVA.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
        </div>
      </section>

      <DomicilioContacto {...p} />

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Cumplimiento (UIF)</h2>
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={p.sujetoObligado} onChange={e => p.setSujetoObligado(e.target.checked)} />
            <span className="text-sm">Sujeto obligado</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={p.sujetoExpuesto} onChange={e => p.setSujetoExpuesto(e.target.checked)} />
            <span className="text-sm">Persona expuesta polÃ­ticamente (PEP)</span>
          </label>
        </div>
      </section>
    </>
  );
}

function JuridicaFields(p: any) {
  return (
    <>
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Datos de la organizaciÃ³n</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2"><label className={p.labelCls}>Nombre / OrganizaciÃ³n *</label><input className={p.inputCls} value={p.razonSocial} onChange={e => p.setRazonSocial(e.target.value)} /></div>
          <div><label className={p.labelCls}>CUIT *</label><input className={p.inputCls} value={p.cuit} onChange={e => p.setCuit(e.target.value)} placeholder="00-00000000-0" /></div>
          <div>
            <label className={p.labelCls}>SituaciÃ³n impositiva</label>
            <select className={p.inputCls + " bg-white"} value={p.condIva} onChange={e => p.setCondIva(e.target.value)}>
              {COND_IVA.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div><label className={p.labelCls}>Inicio de actividades</label><input type="date" className={p.inputCls} value={p.inicioActividad} onChange={e => p.setInicioActividad(e.target.value)} /></div>
          <div><label className={p.labelCls}>Actividad</label><input className={p.inputCls} value={p.actividad} onChange={e => p.setActividad(e.target.value)} /></div>
          {/* Documento opcional para jurÃ­dica: si va vacÃ­o, se usa el CUIT */}
          <div>
            <label className={p.labelCls}>Tipo doc. (opcional)</label>
            <select className={p.inputCls + " bg-white"} value={p.docTipo} onChange={e => p.setDocTipo(e.target.value)}>
              {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={p.labelCls}>Documento (opcional)</label>
            <input className={p.inputCls} value={p.docNumero} onChange={e => p.setDocNumero(e.target.value)} placeholder="Si se deja vacÃ­o, se usa el CUIT" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Referente</h2>
        <p className="text-xs text-slate-500 mb-3">Opcional. Persona de contacto de la organizaciÃ³n.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={p.labelCls}>Referente (nombre)</label><input className={p.inputCls} value={p.refNombre} onChange={e => p.setRefNombre(e.target.value)} /></div>
          <div><label className={p.labelCls}>Referente (cargo)</label><input className={p.inputCls} value={p.refCargo} onChange={e => p.setRefCargo(e.target.value)} /></div>
          <div>
            <label className={p.labelCls}>Referente (tipo doc.)</label>
            <select className={p.inputCls + " bg-white"} value={p.refDocTipo} onChange={e => p.setRefDocTipo(e.target.value)}>
              {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className={p.labelCls}>Referente (documento)</label><input className={p.inputCls} value={p.refDocNumero} onChange={e => p.setRefDocNumero(e.target.value)} /></div>
        </div>
      </section>

      <DomicilioContacto {...p} />
    </>
  );
}

function DomicilioContacto(p: any) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-900 mb-3">Domicilio y contacto</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={p.labelCls}>Domicilio (calle)</label><input className={p.inputCls} value={p.dirCalle} onChange={e => p.setDirCalle(e.target.value)} /></div>
        <div><label className={p.labelCls}>NÃºmero</label><input className={p.inputCls} value={p.dirNumero} onChange={e => p.setDirNumero(e.target.value)} /></div>
        <div><label className={p.labelCls}>Barrio</label><input className={p.inputCls} value={p.dirBarrio} onChange={e => p.setDirBarrio(e.target.value)} /></div>
        <div><label className={p.labelCls}>Localidad</label><input className={p.inputCls} value={p.dirLocalidad} onChange={e => p.setDirLocalidad(e.target.value)} /></div>
        <div><label className={p.labelCls}>Provincia</label><input className={p.inputCls} value={p.dirProvincia} onChange={e => p.setDirProvincia(e.target.value)} /></div>
        <div><label className={p.labelCls}>PaÃ­s</label><input className={p.inputCls} value={p.dirPais} onChange={e => p.setDirPais(e.target.value)} /></div>
        <div><label className={p.labelCls}>Email</label><input type="email" className={p.inputCls} value={p.email} onChange={e => p.setEmail(e.target.value)} /></div>
        <div><label className={p.labelCls}>Email 2</label><input type="email" className={p.inputCls} value={p.emailAlt} onChange={e => p.setEmailAlt(e.target.value)} /></div>
        <div><label className={p.labelCls}>TelÃ©fono</label><input className={p.inputCls} value={p.telefono} onChange={e => p.setTelefono(e.target.value)} placeholder="(000)-0000000" /></div>
        <div><label className={p.labelCls}>TelÃ©fono 2</label><input className={p.inputCls} value={p.telefonoAlt} onChange={e => p.setTelefonoAlt(e.target.value)} placeholder="(000)-0000000" /></div>
      </div>
    </section>
  );
}
