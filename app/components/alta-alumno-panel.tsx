"use client";

/**
 * alta-alumno-panel.tsx — alta manual de UN alumno (Personas › Alumnos ›
 * Inscripciones, PROMPT W, 2026-10-24). Sin CSV ni Excel: CURP, número de
 * control, nombre, apellidos, grado y grupo, y si se le crea tutor.
 *
 * Dos pasos, como el resto de las escrituras del técnico: «Revisar» valida con
 * la MISMA regla que el servidor (`validarAltaManualAlumno`) y muestra lo que se
 * va a guardar; solo «Confirmar alta» escribe. El servidor vuelve a validar todo:
 * lo de aquí es para que el error se vea antes, no para decidir.
 *
 * Las clases se declaran como constantes y no como componentes con nombre: C11
 * (`test-orden`) vigila que una pieza de presentación no se redeclare en `app/`.
 */
import { useEffect, useState } from "react";
import { actionContextoAltaManual, actionDarDeAltaAlumnoManual } from "@/app/actions/alta-alumno";
import {
  validarAltaManualAlumno,
  type DatosAltaManualAlumno,
  type GrupoAlta,
  type ResultadoAltaManual,
} from "@/lib/escolar/alumno/alta-manual-alumno-puro";

const CLASE_CAMPO =
  "w-full rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]";
const CLASE_ETIQUETA = "mb-1 block px-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]";
const CLASE_BOTON =
  "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const CLASE_CAJA = "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6";

const VACIO = {
  curp: "",
  numeroControl: "",
  nombre: "",
  pApellido: "",
  sApellido: "",
  grupoId: "",
  crearTutor: false,
};

type Formulario = typeof VACIO;
type AltaHecha = Extract<ResultadoAltaManual, { ok: true }>;

export function AltaAlumnoPanel() {
  const [grupos, setGrupos] = useState<GrupoAlta[]>([]);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [errorContexto, setErrorContexto] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [revision, setRevision] = useState<DatosAltaManualAlumno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecha, setHecha] = useState<AltaHecha | null>(null);

  useEffect(() => {
    let vivo = true;
    actionContextoAltaManual().then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setGrupos(r.grupos);
        setPeriodo(r.periodo.nombre);
      } else {
        setErrorContexto(r.error);
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setRevision(null);
    setError(null);
  }

  function onRevisar(event: React.FormEvent) {
    event.preventDefault();
    const v = validarAltaManualAlumno(form);
    if (!v.ok) {
      setError(v.error);
      setRevision(null);
      return;
    }
    setError(null);
    setHecha(null);
    setRevision(v.datos);
  }

  async function onConfirmar() {
    if (!revision || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await actionDarDeAltaAlumnoManual(form);
    setEnviando(false);
    setRevision(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setHecha(r);
    setForm(VACIO);
  }

  const etiquetaGrupo = (id: string) => grupos.find((g) => g.id === id)?.etiqueta ?? "";

  return (
    <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-3 sm:p-4">
      <span className="mx-auto w-fit rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] sm:text-[11px]">
        Alta manual de alumno
      </span>

      {hecha && (
        <div className="rounded-2xl border border-[var(--oc-ok)]/50 bg-[var(--oc-ok)]/15 p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
              Alumno dado de alta
            </p>
            <button
              type="button"
              onClick={() => setHecha(null)}
              className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-ok)] underline"
            >
              Cerrar
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-sm font-semibold text-[var(--oc-ok)]">
            <li>👤 {hecha.alumno.nombreCompleto}</li>
            <li>🪪 CURP: {hecha.alumno.curp}</li>
            <li>🔒 Entra con la contraseña inicial de siempre: los últimos 6 caracteres de su CURP.</li>
          </ul>

          {hecha.inscripcion.ok ? (
            <p className="mt-2 text-sm font-semibold text-[var(--oc-ok)]">🏫 Inscrito en {hecha.alumno.grupo}.</p>
          ) : (
            <p className="mt-2 rounded-xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-2 text-xs font-semibold text-[var(--oc-alert-text)]">
              El alumno se creó, pero NO quedó inscrito en {hecha.alumno.grupo}: {hecha.inscripcion.error} Inscríbelo
              desde Ciclo escolar › Configurador › Alumnos.
            </p>
          )}

          {hecha.tutor?.ok && (
            <div className="mt-3 rounded-xl border border-[var(--oc-ok)]/50 p-3">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
                Credenciales iniciales del tutor (se muestran una sola vez: guárdalas y entrégaselas)
              </p>
              <ul className="flex flex-col gap-1 text-sm font-semibold text-[var(--oc-ok)]">
                <li>🔑 Clave de tutor: {hecha.tutor.claveTutor}</li>
                <li>👤 Usuario: {hecha.tutor.usuario}</li>
                <li>🔒 Contraseña inicial: {hecha.tutor.contraseñaInicial}</li>
              </ul>
              <p className="mt-1 text-[10px] font-semibold text-[var(--oc-ok)]">
                El tutor deberá cambiar usuario y contraseña en su primer acceso.
              </p>
            </div>
          )}
          {hecha.tutor && !hecha.tutor.ok && (
            <p className="mt-2 rounded-xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-2 text-xs font-semibold text-[var(--oc-alert-text)]">
              No se pudo crear el tutor: {hecha.tutor.error} Créalo desde Personas › Tutores › Crear.
            </p>
          )}
        </div>
      )}

      <form onSubmit={onRevisar} className={CLASE_CAJA}>
        <p className="mb-4 text-center text-xs font-semibold text-[var(--oc-muted)]">
          Da de alta a un alumno nuevo y lo inscribe en su grupo
          {periodo ? (
            <>
              {" "}del ciclo <span className="font-extrabold text-[var(--oc-text)]">{periodo}</span>
            </>
          ) : null}
          . Solo alumnos cuya CURP aún no exista.
        </p>

        {errorContexto && (
          <p className="mb-3 rounded-xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-2 text-center text-xs font-semibold text-[var(--oc-alert-text)]">
            {errorContexto}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={CLASE_ETIQUETA}>CURP</span>
            <input
              className={CLASE_CAMPO}
              value={form.curp}
              onChange={(e) => cambiar("curp", e.target.value)}
              maxLength={25}
              autoComplete="off"
              spellCheck={false}
              placeholder="18 caracteres"
            />
          </label>
          <label>
            <span className={CLASE_ETIQUETA}>Nº de control</span>
            <input
              className={CLASE_CAMPO}
              value={form.numeroControl}
              onChange={(e) => cambiar("numeroControl", e.target.value)}
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={CLASE_ETIQUETA}>Nombre(s)</span>
            <input
              className={CLASE_CAMPO}
              value={form.nombre}
              onChange={(e) => cambiar("nombre", e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <label>
            <span className={CLASE_ETIQUETA}>Apellido paterno</span>
            <input
              className={CLASE_CAMPO}
              value={form.pApellido}
              onChange={(e) => cambiar("pApellido", e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <label>
            <span className={CLASE_ETIQUETA}>Apellido materno (opcional)</span>
            <input
              className={CLASE_CAMPO}
              value={form.sApellido}
              onChange={(e) => cambiar("sApellido", e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <label className="sm:col-span-2">
            <span className={CLASE_ETIQUETA}>Grado y grupo</span>
            <select
              className={CLASE_CAMPO}
              value={form.grupoId}
              onChange={(e) => cambiar("grupoId", e.target.value)}
              disabled={grupos.length === 0}
            >
              <option value="">
                {grupos.length > 0 ? "Elige el grado y grupo" : errorContexto ? "Sin grupos disponibles" : "Cargando grupos…"}
              </option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 px-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.crearTutor}
              onChange={(e) => cambiar("crearTutor", e.target.checked)}
              className="h-4 w-4 accent-[var(--oc-ok)]"
            />
            <span className="text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
              Crearle perfil de tutor
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-2 text-center text-xs font-semibold text-[var(--oc-alert-text)]">
            {error}
          </p>
        )}

        {revision ? (
          <div className="mt-4 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
              Se va a guardar
            </p>
            <ul className="flex flex-col gap-1 text-xs font-semibold text-[var(--oc-text)]">
              <li>
                {[revision.nombre, revision.pApellido, revision.sApellido].filter(Boolean).join(" ")}
              </li>
              <li>CURP: {revision.curp}</li>
              <li>Nº de control: {revision.numeroControl}</li>
              <li>Grupo: {etiquetaGrupo(revision.grupoId)}</li>
              <li>{revision.crearTutor ? "Con perfil de tutor" : "Sin perfil de tutor"}</li>
            </ul>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className={CLASE_BOTON} onClick={() => setRevision(null)} disabled={enviando}>
                Corregir
              </button>
              <button type="button" className={CLASE_BOTON} onClick={onConfirmar} disabled={enviando}>
                {enviando ? "Guardando…" : "Confirmar alta"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-center">
            <button type="submit" className={CLASE_BOTON} disabled={grupos.length === 0}>
              Revisar
            </button>
          </div>
        )}
      </form>

      <p className="text-center text-[11px] font-semibold text-[var(--oc-muted)]">
        La carga masiva por archivo (CSV o Excel) está en Roster.
      </p>
    </div>
  );
}
