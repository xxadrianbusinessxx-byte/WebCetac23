"use client";

/**
 * tutores-roster-panel.tsx — administración del roster de TUTORES
 * (Personas › Tutores, modos «Editar», «Quitar tutor» y «Borrar roster»,
 * 2026-10-25).
 *
 * Por qué vive aparte de `tutores-panel.tsx`: aquel crea tutores (uno a uno y
 * en masa) y ya tiene 712 líneas; esto los corrige y los retira. Son dos
 * trabajos distintos y el archivo no da para los dos.
 *
 * Lo que hace falta saber para leerlo:
 *  - «Borrar» aquí es SIEMPRE lógico (`activo = false`). Ninguna acción borra
 *    una fila: volver a vincular al alumno deshace la operación.
 *  - El patrón es el del resto de las escrituras del técnico: previsualizar →
 *    confirmar. La previsualización la calcula el servidor; aquí solo se pinta.
 *  - Vaciar el roster pide escribir una frase que lleva dentro el número de
 *    tutores. Si la cifra cambió entre mirar y confirmar, el servidor la
 *    rechaza: la confirmación vale para la foto que se vio, no para cualquiera.
 *
 * Las clases se declaran como constantes y no como componentes con nombre: C11
 * (`test-orden`) vigila que una pieza de presentación no se redeclare en `app/`.
 */
import { useState } from "react";
import {
  actionBorrarRosterTutores,
  actionBuscarTutorDeAlumno,
  actionEditarDatosTutor,
  actionPrevisualizarBorrarRosterTutores,
  actionPrevisualizarQuitarTutor,
  actionQuitarTutorDeAlumno,
} from "@/app/actions/tutores";
import type {
  PreviewQuitarTutor,
  PreviewRosterTutores,
  TutorEditableDeAlumno,
} from "@/lib/escolar/tutores/tutores-borrado";
import { validarDatosTutor, type DatosTutorEditables } from "@/lib/escolar/tutores/tutores-borrado-puro";

const CLASE_CAMPO =
  "w-full rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]";
const CLASE_ETIQUETA = "mb-1 block px-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]";
const CLASE_BOTON =
  "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const CLASE_CAJA = "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6";
const CLASE_AVISO = "rounded-2xl border border-amber-400/50 bg-amber-100 px-4 py-3 text-[11px] font-semibold text-amber-900";
const CLASE_ERROR = "rounded-2xl border border-red-300/70 bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-800";
const CLASE_OK = "rounded-2xl border border-emerald-400/50 bg-emerald-100 px-4 py-3 text-[11px] font-semibold text-emerald-900";
const CLASE_DATO = "text-[11px] font-semibold text-[var(--oc-text)]";

export type ModoRosterTutores = "editar" | "quitar" | "roster";

const CAMPOS: { campo: keyof DatosTutorEditables; etiqueta: string; placeholder: string }[] = [
  { campo: "nombre", etiqueta: "Nombre", placeholder: "Nombre del tutor" },
  { campo: "apellidos", etiqueta: "Apellidos", placeholder: "Apellidos del tutor" },
  { campo: "curp", etiqueta: "CURP", placeholder: "CURP (18 caracteres)" },
  { campo: "telefono", etiqueta: "Teléfono", placeholder: "10 dígitos" },
  { campo: "correo", etiqueta: "Correo", placeholder: "correo@ejemplo.mx" },
];

const SIN_DATOS: DatosTutorEditables = { nombre: "", apellidos: "", curp: "", telefono: "", correo: "" };

export function TutoresRosterPanel({ modo }: { modo: ModoRosterTutores }) {
  if (modo === "roster") return <BorrarRoster />;
  if (modo === "quitar") return <QuitarTutor />;
  return <EditarTutor />;
}

// ---------------------------------------------------------------------------
// Editar los datos del tutor de un alumno.
// ---------------------------------------------------------------------------

function EditarTutor() {
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgo, setHallazgo] = useState<TutorEditableDeAlumno | null>(null);
  const [form, setForm] = useState<DatosTutorEditables>(SIN_DATOS);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function onBuscar(event: React.FormEvent) {
    event.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setBuscando(true);
    setError(null);
    setMensaje(null);
    setHallazgo(null);
    const r = await actionBuscarTutorDeAlumno(t);
    setBuscando(false);
    if (!r) {
      setError("No se encontró ningún alumno con ese CURP o nombre.");
      return;
    }
    setHallazgo(r);
    setForm(r.tutor ? r.tutor.datos : SIN_DATOS);
  }

  async function onGuardar(event: React.FormEvent) {
    event.preventDefault();
    if (!hallazgo?.tutor) return;
    const v = validarDatosTutor(form);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const r = await actionEditarDatosTutor({ tutorId: hallazgo.tutor.id, datos: form });
    setGuardando(false);
    if (r.ok) setMensaje(r.mensaje);
    else setError(r.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onBuscar} className={CLASE_CAJA}>
        <label className={CLASE_ETIQUETA} htmlFor="tutor-editar-busqueda">
          Alumno (CURP o nombre)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="tutor-editar-busqueda"
            className={CLASE_CAMPO}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="CURP o nombre del alumno"
          />
          <button type="submit" className={CLASE_BOTON} disabled={buscando || !texto.trim()}>
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>
        <p className="mt-2 px-2 text-[10px] font-semibold text-[var(--oc-muted)]">
          Los tutores generados automáticamente no traen teléfono ni correo: es aquí donde se capturan.
        </p>
      </form>

      {error ? <p className={CLASE_ERROR}>{error}</p> : null}
      {mensaje ? <p className={CLASE_OK}>{mensaje}</p> : null}

      {hallazgo && !hallazgo.tutor ? (
        <p className={CLASE_AVISO}>
          {hallazgo.nombreAlumno} ({hallazgo.curpAlumno}) no tiene ningún tutor activo. Se le crea uno en
          «Crear» o en «Generar automáticos».
        </p>
      ) : null}

      {hallazgo?.tutor ? (
        <form onSubmit={onGuardar} className={`${CLASE_CAJA} flex flex-col gap-3`}>
          <p className={CLASE_DATO}>
            Tutor de <strong>{hallazgo.nombreAlumno}</strong> · clave {hallazgo.tutor.claveTutor}
            {hallazgo.tutor.usuario ? ` · usuario «${hallazgo.tutor.usuario}»` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <div key={c.campo}>
                <label className={CLASE_ETIQUETA} htmlFor={`tutor-${c.campo}`}>
                  {c.etiqueta}
                </label>
                <input
                  id={`tutor-${c.campo}`}
                  className={CLASE_CAMPO}
                  value={form[c.campo]}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, [c.campo]: v }));
                    setMensaje(null);
                    setError(null);
                  }}
                  placeholder={c.placeholder}
                />
              </div>
            ))}
          </div>
          <div>
            <button type="submit" className={CLASE_BOTON} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar datos del tutor"}
            </button>
          </div>
          <p className="px-2 text-[10px] font-semibold text-[var(--oc-muted)]">
            Esto no toca sus credenciales ni sus alumnos: solo los datos de contacto.
          </p>
        </form>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quitarle el tutor a un alumno.
// ---------------------------------------------------------------------------

function QuitarTutor() {
  const [curp, setCurp] = useState("");
  const [preview, setPreview] = useState<PreviewQuitarTutor | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function onPrevisualizar(event: React.FormEvent) {
    event.preventDefault();
    const c = curp.trim().toUpperCase();
    if (!c) return;
    setBuscando(true);
    setError(null);
    setMensaje(null);
    setPreview(null);
    const r = await actionPrevisualizarQuitarTutor(c);
    setBuscando(false);
    if (!r) {
      setError("No autorizado.");
      return;
    }
    setPreview(r);
  }

  async function onConfirmar() {
    if (!preview?.tutor) return;
    setTrabajando(true);
    setError(null);
    const r = await actionQuitarTutorDeAlumno(preview.curpAlumno);
    setTrabajando(false);
    if (r.ok) {
      setMensaje(r.mensaje);
      setPreview(null);
      setCurp("");
    } else {
      setError(r.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onPrevisualizar} className={CLASE_CAJA}>
        <label className={CLASE_ETIQUETA} htmlFor="tutor-quitar-curp">
          CURP del alumno
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="tutor-quitar-curp"
            className={CLASE_CAMPO}
            value={curp}
            onChange={(e) => setCurp(e.target.value)}
            placeholder="CURP del alumno"
          />
          <button type="submit" className={CLASE_BOTON} disabled={buscando || !curp.trim()}>
            {buscando ? "Buscando…" : "Previsualizar"}
          </button>
        </div>
      </form>

      {error ? <p className={CLASE_ERROR}>{error}</p> : null}
      {mensaje ? <p className={CLASE_OK}>{mensaje}</p> : null}

      {preview && !preview.tutor ? (
        <p className={CLASE_AVISO}>
          {preview.nombreAlumno ?? preview.curpAlumno} no tiene ningún tutor activo: no hay nada que quitar.
        </p>
      ) : null}

      {preview?.tutor ? (
        <div className={`${CLASE_CAJA} flex flex-col gap-3`}>
          <p className={CLASE_DATO}>
            Se le quitará a <strong>{preview.nombreAlumno ?? preview.curpAlumno}</strong> el tutor{" "}
            {preview.tutor.claveTutor}
            {preview.tutor.nombre ? ` (${preview.tutor.nombre})` : ""}.
          </p>
          {preview.avisos.map((a) => (
            <p key={a} className={CLASE_AVISO}>
              {a}
            </p>
          ))}
          {preview.otrosAlumnos.length > 0 ? (
            <div>
              <p className={CLASE_ETIQUETA}>Conservan este tutor</p>
              <ul className="flex flex-col gap-1">
                {preview.otrosAlumnos.map((a) => (
                  <li key={a.curp} className={CLASE_DATO}>
                    · {a.nombre} ({a.curp})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="px-2 text-[10px] font-semibold text-[var(--oc-muted)]">
            No se borra ninguna fila: el vínculo queda inactivo y se puede volver a crear.
          </p>
          <div>
            <button type="button" className={CLASE_BOTON} onClick={() => void onConfirmar()} disabled={trabajando}>
              {trabajando ? "Quitando…" : "Confirmar: quitar el tutor"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vaciar el roster de tutores completo.
// ---------------------------------------------------------------------------

function BorrarRoster() {
  const [preview, setPreview] = useState<PreviewRosterTutores | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function onPrevisualizar() {
    setCargando(true);
    setError(null);
    setMensaje(null);
    const r = await actionPrevisualizarBorrarRosterTutores();
    setCargando(false);
    if (!r) {
      setError("No autorizado.");
      return;
    }
    setPreview(r);
    setConfirmacion("");
  }

  async function onConfirmar() {
    if (!preview) return;
    setTrabajando(true);
    setError(null);
    const r = await actionBorrarRosterTutores(confirmacion);
    setTrabajando(false);
    if (r.ok) {
      setMensaje(r.mensaje);
      setPreview(null);
      setConfirmacion("");
    } else {
      setError(r.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={CLASE_CAJA}>
        <p className={CLASE_DATO}>
          Desactiva TODAS las cuentas de tutor y TODOS sus vínculos con alumnos. No borra ninguna fila: las
          cuentas quedan como historial y «Generar automáticos» vuelve a poblar el roster.
        </p>
        <div className="mt-3">
          <button type="button" className={CLASE_BOTON} onClick={() => void onPrevisualizar()} disabled={cargando}>
            {cargando ? "Contando…" : "Previsualizar"}
          </button>
        </div>
      </div>

      {error ? <p className={CLASE_ERROR}>{error}</p> : null}
      {mensaje ? <p className={CLASE_OK}>{mensaje}</p> : null}

      {preview ? (
        <div className={`${CLASE_CAJA} flex flex-col gap-3`}>
          <p className={CLASE_DATO}>
            Se desactivarán <strong>{preview.tutoresActivos}</strong> cuenta(s) de tutor y{" "}
            <strong>{preview.relacionesActivas}</strong> vínculo(s). Se quedarán sin tutor{" "}
            <strong>{preview.alumnosConTutor}</strong> alumno(s).
          </p>
          {preview.bloqueos.map((b) => (
            <p key={b} className={CLASE_AVISO}>
              {b}
            </p>
          ))}
          {preview.bloqueos.length === 0 ? (
            <>
              <div>
                <label className={CLASE_ETIQUETA} htmlFor="tutor-roster-confirmacion">
                  Para confirmar, escribe «{preview.confirmacionEsperada}»
                </label>
                <input
                  id="tutor-roster-confirmacion"
                  className={CLASE_CAMPO}
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder={preview.confirmacionEsperada}
                />
              </div>
              <div>
                <button
                  type="button"
                  className={CLASE_BOTON}
                  onClick={() => void onConfirmar()}
                  disabled={trabajando || !confirmacion.trim()}
                >
                  {trabajando ? "Vaciando…" : "Confirmar: vaciar el roster de tutores"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
