"use client";

import { useState } from "react";
import { X } from "lucide-react";

type PersonaCreada = {
  id: string;
  nombre: string;
  cuit: string | null;
  doc_numero: string | null;
};

export function ModalCrearPersona({
  tenant,
  onClose,
  onCreated,
}: {
  tenant: string;
  onClose: () => void;
  onCreated: (p: PersonaCreada) => void;
}) {
  const [tipo, setTipo] = useState<"FISICA" | "JURIDICA">("FISICA");
  const [docTipo, setDocTipo] = useState<string>("DNI");
  const [docNumero, setDocNumero] = useState("");
  const [cuit, setCuit] = useState("");
  const [apellido, setApellido] = useState("");
  const [nombre, setNombre] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [condIva, setCondIva] = useState("CF");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccionCalle, setDireccionCalle] = useState("");
  const [direccionNumero, setDireccionNumero] = useState("");
  const [direccionLocalidad, setDireccionLocalidad] = useState("");
  const [direccionProvincia, setDireccionProvincia] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);

    if (!docNumero.trim()) {
      setError("Número de documento es obligatorio");
      return;
    }
    if (tipo === "FISICA" && (!apellido.trim() || !nombre.trim())) {
      setError("Apellido y nombre son obligatorios");
      return;
    }
    if (tipo === "JURIDICA" && !razonSocial.trim()) {
      setError("Razón social es obligatoria");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/personas/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          tipo,
          doc_tipo: docTipo,
          doc_numero: docNumero.trim(),
          cuit: cuit.trim() || null,
          apellido: tipo === "FISICA" ? apellido.trim() : null,
          nombre: tipo === "FISICA" ? nombre.trim() : null,
          razon_social: tipo === "JURIDICA" ? razonSocial.trim() : null,
          cond_iva: condIva,
          email: email.trim() || null,
          telefono: telefono.trim() || null,
          direccion_calle: direccionCalle.trim() || null,
          direccion_numero: direccionNumero.trim() || null,
          direccion_localidad: direccionLocalidad.trim() || null,
          direccion_provincia: direccionProvincia.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        let msg = data.error || "Error al crear persona";
        if (data.sql_detail) msg += ` (${data.sql_detail})`;
        if (data.existing_id) {
          msg = `${data.error}. ¿Querés seleccionar la persona existente?`;
        }
        setError(msg);
        setSubmitting(false);
        return;
      }
      if (!data.persona || !data.persona.id) {
        setError("La persona se creó pero la respuesta del servidor no es válida. Revisá la consola del servidor.");
        setSubmitting(false);
        return;
      }
      onCreated(data.persona);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-slate-900">Crear nueva persona</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Tipo */}
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={tipo === "FISICA"}
                onChange={() => setTipo("FISICA")}
              />
              <span className="text-sm">Persona Física</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={tipo === "JURIDICA"}
                onChange={() => setTipo("JURIDICA")}
              />
              <span className="text-sm">Persona Jurídica</span>
            </label>
          </div>

          {/* Datos según tipo */}
          {tipo === "FISICA" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Apellido *</label>
                <input
                  type="text"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Nombre *</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Razón social *</label>
              <input
                type="text"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {/* Documento */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Tipo doc *</label>
              <select
                value={docTipo}
                onChange={(e) => setDocTipo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="DNI">DNI</option>
                <option value="CUIT">CUIT</option>
                <option value="CUIL">CUIL</option>
                <option value="CDI">CDI</option>
                <option value="LE">LE</option>
                <option value="LC">LC</option>
                <option value="PASAPORTE">Pasaporte</option>
                <option value="CI_EXTRANJERA">CI Extranjera</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-600 mb-1 block">Número *</label>
              <input
                type="text"
                value={docNumero}
                onChange={(e) => setDocNumero(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">CUIT</label>
              <input
                type="text"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="XX-XXXXXXXX-X"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Condición IVA</label>
              <select
                value={condIva}
                onChange={(e) => setCondIva(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="CF">Consumidor Final</option>
                <option value="MONO">Monotributista</option>
                <option value="RI">Responsable Inscripto</option>
                <option value="EXENTO">Exento</option>
                <option value="NO_RESPONSABLE">No Responsable</option>
                <option value="RNI">Resp. No Inscripto</option>
                <option value="EXTERIOR">Exterior</option>
              </select>
            </div>
          </div>

          {/* Contacto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Teléfono</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Dirección */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-slate-600 mb-1 block">Calle</label>
              <input
                type="text"
                value={direccionCalle}
                onChange={(e) => setDireccionCalle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Número</label>
              <input
                type="text"
                value={direccionNumero}
                onChange={(e) => setDireccionNumero(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Localidad</label>
              <input
                type="text"
                value={direccionLocalidad}
                onChange={(e) => setDireccionLocalidad(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Provincia</label>
              <input
                type="text"
                value={direccionProvincia}
                onChange={(e) => setDireccionProvincia(e.target.value)}
                placeholder="Jujuy"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {submitting ? "Creando..." : "Crear y usar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
