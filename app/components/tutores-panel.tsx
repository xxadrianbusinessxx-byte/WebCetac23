"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import {
  actionBuscarAlumnoParaTutor,
  actionCrearTutor,
  actionGenerarTutoresAutomaticos,
  actionListarTutoresConCredenciales,
  actionPrevisualizarConsolidacionTutores,
  actionPrevisualizarGeneracionTutores,
} from "@/app/actions/tutores";
import { nombreCompletoTutor, type TutorRow } from "@/lib/escolar/tutores-types";
import type { CredencialInicialTutor } from "@/lib/escolar/tutores";





function PanelTab({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

function GreyActionPill({
  children,
  className = "",
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

type AlumnoVinculado = {
  curp: string;
  nombreCompleto: string;
  yaTieneTutor: boolean;
  claveTutorActual?: string;
};

type CredencialesMostradas = {
  claveTutor: string;
  usuario: string;
  contraseñaInicial: string;
};

/** Resumen de consolidación de hermanos (Bloque 6C). */
type PrevisualizacionConsolidacion = {
  alumnosConTutor: { curp: string; claveTutor: string }[];
  alumnosSinTutor: string[];
};


type PrevisualizacionMasiva = {
  totalAlumnos: number;
  sinTutor: number;
  conTutor: number;
};

type ResultadoMasivo = {
  procesados: number;
  creados: number;
  omitidos: number;
  omitidosDetalle: string[];
  errores: number;
  erroresDetalle: string[];
  csv: string;
};

type TutorConCredenciales = {
  tutor: TutorRow;
  credencialesIniciales: CredencialInicialTutor[];
};

export function TutoresPanel() {
  const [tutores, setTutores] = useState<TutorConCredenciales[]>([]);
  const [cargando, setCargando] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formulario de creación.
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [curp, setCurp] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [alumnos, setAlumnos] = useState<AlumnoVinculado[]>([]);
  const [creando, setCreando] = useState(false);
  const [credenciales, setCredenciales] = useState<CredencialesMostradas | null>(
    null,
  );

  // Generación masiva (Bloque 6B).
  const [previsualizando, setPrevisualizando] = useState(false);
  const [preview, setPreview] = useState<PrevisualizacionMasiva | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoMasivo | null>(null);

  // Consolidación de hermanos (Bloque 6C).
  const [previewConsolidacion, setPreviewConsolidacion] =
    useState<PrevisualizacionConsolidacion | null>(null);
  const [analizandoConsolidacion, setAnalizandoConsolidacion] = useState(false);
  const [confirmandoConsolidacion, setConfirmandoConsolidacion] = useState(false);



  const cargarTutores = useCallback(async () => {
    setCargando(true);
    const lista = await actionListarTutoresConCredenciales();
    setTutores(lista);
    setCargando(false);
  }, []);

  // C4.19 — carga PEREZOSA de tutores registrados (463): no se cargan al
  // montar; se abren bajo demanda por eficiencia de rendimiento.
  async function abrirListaTutores() {
    setListaAbierta(true);
    await cargarTutores();
  }

  function cerrarListaTutores() {
    setListaAbierta(false);
    setTutores([]);
  }

  async function onBuscarAlumno() {
    setError(null);
    setMensaje(null);
    const texto = busqueda.trim();
    if (!texto) {
      setError("Escribe un CURP o nombre de alumno.");
      return;
    }
    setBuscando(true);
    const res = await actionBuscarAlumnoParaTutor(texto);
    setBuscando(false);
    if (!res) {
      setError("No se encontró ningún alumno con ese CURP o nombre.");
      return;
    }
    if (alumnos.some((a) => a.curp === res.curp)) {
      setError("Ese alumno ya está en la lista.");
      return;
    }
    setAlumnos((prev) => [...prev, res]);
    setBusqueda("");
    setMensaje(
      res.yaTieneTutor
        ? `⚠️ ${res.nombreCompleto} ya tiene un tutor (${res.claveTutorActual ?? "?"}). Al crear este tutor único, se reemplazará el anterior.`
        : `Alumno agregado: ${res.nombreCompleto}`,
    );
  }


  function onQuitarAlumno(curp: string) {
    setAlumnos((prev) => prev.filter((a) => a.curp !== curp));
  }

  // -------------------------------------------------------------------------
  // Generación masiva de tutores (Bloque 6B).
  // -------------------------------------------------------------------------

  async function onPrevisualizarMasiva() {
    setError(null);
    setMensaje(null);
    setResultado(null);
    setConfirmando(false);
    setPrevisualizando(true);
    const res = await actionPrevisualizarGeneracionTutores();
    setPrevisualizando(false);
    if (!res) {
      setError("No se pudo previsualizar la generación.");
      return;
    }
    setPreview(res);
    setConfirmando(true);
  }

  function onCancelarMasiva() {
    setPreview(null);
    setConfirmando(false);
  }

  async function onConfirmarMasiva() {
    setError(null);
    setMensaje(null);
    setConfirmando(false);
    setGenerando(true);
    const res = await actionGenerarTutoresAutomaticos();
    setGenerando(false);
    if (!res.ok) {
      setError(res.error);
      setPreview(null);
      return;
    }
    setResultado({
      procesados: res.procesados,
      creados: res.creados,
      omitidos: res.omitidos,
      omitidosDetalle: res.omitidosDetalle,
      errores: res.errores,
      erroresDetalle: res.erroresDetalle,
      csv: res.csv,
    });
    setPreview(null);
    await abrirListaTutores();
  }

  function onDescargarCsv() {
    if (!resultado) return;
    const blob = new Blob([resultado.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "credenciales_tutores.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  // -------------------------------------------------------------------------
  // Consolidación de hermanos (Bloque 6C).
  // -------------------------------------------------------------------------

  /**
   * Al pulsar "Crear tutor": si alguno de los alumnos seleccionados ya tiene un
   * tutor activo, se muestra un resumen explícito de consolidación y se pide
   * confirmación antes de ejecutar nada. Si ninguno tiene tutor, se crea
   * directamente (flujo normal).
   */
  async function onCrearTutor() {
    setError(null);
    setMensaje(null);
    setCredenciales(null);
    setPreviewConsolidacion(null);
    setConfirmandoConsolidacion(false);
    if (alumnos.length === 0) {
      setError("Agrega al menos un alumno antes de crear el tutor.");
      return;
    }

    const hayAlumnosConTutor = alumnos.some((a) => a.yaTieneTutor);
    if (hayAlumnosConTutor) {
      // Mostrar resumen de consolidación y pedir confirmación.
      setAnalizandoConsolidacion(true);
      const res = await actionPrevisualizarConsolidacionTutores(
        alumnos.map((a) => a.curp),
      );
      setAnalizandoConsolidacion(false);
      if (!res) {
        setError("No se pudo analizar la consolidación.");
        return;
      }
      setPreviewConsolidacion(res);
      setConfirmandoConsolidacion(true);
      return;
    }

    await ejecutarCrearTutor(false);
  }

  function onCancelarConsolidacion() {
    setPreviewConsolidacion(null);
    setConfirmandoConsolidacion(false);
  }

  /** Ejecuta la creación del tutor (con o sin consolidación). */
  async function ejecutarCrearTutor(consolidar: boolean) {
    setError(null);
    setMensaje(null);
    setCredenciales(null);
    setCreando(true);
    const res = await actionCrearTutor({
      nombre: nombre || undefined,
      apellidos: apellidos || undefined,
      curp: curp || undefined,
      telefono: telefono || undefined,
      correo: correo || undefined,
      curpsAlumnos: alumnos.map((a) => a.curp),
      alumnoReferenciaParaUsuario: {
        curp: alumnos[0]!.curp,
        nombreCompleto: alumnos[0]!.nombreCompleto,
      },
      consolidar,
    });
    setCreando(false);
    if (res.ok) {
      setCredenciales({
        claveTutor: res.claveTutor,
        usuario: res.usuario,
        contraseñaInicial: res.contraseñaInicial,
      });
      if (consolidar && res.reemplazos && res.reemplazos.length > 0) {
        setMensaje(
          `Tutor único creado. Se reemplazaron ${res.reemplazos.length} tutor(es) anterior(es).`,
        );
      } else {
        setMensaje("Tutor creado. Guarda las credenciales iniciales.");
      }
      // Limpiar el formulario.
      setNombre("");
      setApellidos("");
      setCurp("");
      setTelefono("");
      setCorreo("");
      setAlumnos([]);
      setPreviewConsolidacion(null);
      setConfirmandoConsolidacion(false);
      await abrirListaTutores();
    } else {
      setError(res.error);
    }
  }


  return (
    <div className="relative flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
      <PanelTab className="mx-auto w-fit">Tutores / Padres</PanelTab>

      <div className="relative z-[1] flex flex-col gap-4">
        {mensaje && (
          <p className="text-center text-xs font-semibold text-sky-900" role="status">
            {mensaje}
          </p>
        )}
        {error && (
          <p className="text-center text-xs font-semibold text-red-700" role="alert">
            {error}
          </p>
        )}

        {/* Credenciales iniciales (se muestran una sola vez tras crear) */}
        {credenciales && (
          <div className="rounded-3xl border border-emerald-400/50 bg-emerald-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
            <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
              Credenciales iniciales del tutor (guárdalas y entrégaselas)
            </p>
            <ul className="flex flex-col gap-1 text-sm font-semibold text-emerald-900">
              <li>🔑 Clave de tutor: {credenciales.claveTutor}</li>
              <li>👤 Usuario: {credenciales.usuario}</li>
              <li>🔒 Contraseña inicial: {credenciales.contraseñaInicial}</li>
            </ul>
            <p className="mt-2 text-center text-[10px] font-semibold text-emerald-800">
              El tutor deberá cambiar usuario y contraseña en su primer acceso.
            </p>
          </div>
        )}

        {/* Formulario de creación */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
          <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
            Crear tutor / padre
          </p>
          <p className="mb-4 text-center text-xs font-semibold text-slate-700">
            Busca y agrega los alumnos que estará a cargo este tutor. El sistema
            genera automáticamente la clave, el usuario y la contraseña inicial.
          </p>

          <div className="flex flex-col gap-3">
            {/* Datos del tutor */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del tutor (opcional)"
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <input
                type="text"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                placeholder="Apellidos del tutor (opcional)"
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <input
                type="text"
                value={curp}
                onChange={(e) => setCurp(e.target.value)}
                placeholder="CURP del tutor (opcional)"
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Teléfono (opcional)"
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <input
                type="text"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Correo (opcional)"
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
            </div>

            {/* Búsqueda de alumnos */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onBuscarAlumno();
                  }
                }}
                placeholder="CURP o nombre del alumno a vincular"
                className="min-w-[10rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <GreyActionPill onClick={onBuscarAlumno} disabled={buscando}>
                {buscando ? "Buscando…" : "Agregar alumno"}
              </GreyActionPill>
            </div>

            {/* Lista de alumnos vinculados */}
            {alumnos.length > 0 && (
              <div className="rounded-2xl border border-white/50 bg-white/50 p-3">
                <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                  Alumnos a cargo ({alumnos.length})
                </p>
                <ul className="flex flex-col gap-1">
                  {alumnos.map((a) => (
                    <li
                      key={a.curp}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <span className="min-w-0 truncate">
                        {a.nombreCompleto}{" "}
                        <span className="text-slate-400">({a.curp})</span>
                        {a.yaTieneTutor && (
                          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-700">
                            Tutor: {a.claveTutorActual ?? "?"}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onQuitarAlumno(a.curp)}
                        className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-red-700 hover:bg-red-200"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-center">
              <GreyActionPill onClick={onCrearTutor} disabled={creando}>
                {creando ? "Creando…" : "Crear tutor"}
              </GreyActionPill>
            </div>

            {/* Confirmación de consolidación de hermanos (Bloque 6C) */}
            {confirmandoConsolidacion && previewConsolidacion && (
              <div className="rounded-2xl border border-amber-400/50 bg-amber-100/70 p-4">
                <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                  Consolidar hermanos bajo un solo tutor
                </p>
                <p className="mb-3 text-center text-xs font-semibold text-amber-900">
                  Se creará un tutor ÚNICO para todos los alumnos seleccionados.
                  Los tutores anteriores de estos alumnos quedarán sin alumnos y
                  se desactivarán.
                </p>
                {previewConsolidacion.alumnosConTutor.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-1 text-xs font-semibold text-amber-900">
                    <li className="font-extrabold uppercase">
                      Se reemplazarán estos tutores:
                    </li>
                    {previewConsolidacion.alumnosConTutor.map((a) => (
                      <li key={a.curp}>
                        {a.curp} → tutor actual {a.claveTutor}
                      </li>
                    ))}
                  </ul>
                )}
                {previewConsolidacion.alumnosSinTutor.length > 0 && (
                  <p className="mb-3 text-xs font-semibold text-amber-900">
                    {previewConsolidacion.alumnosSinTutor.length} alumno(s) sin
                    tutor previo se asignarán por primera vez.
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <GreyActionPill
                    onClick={() => void ejecutarCrearTutor(true)}
                    disabled={creando || analizandoConsolidacion}
                  >
                    {creando ? "Creando…" : "Confirmar y crear tutor único"}
                  </GreyActionPill>
                  <GreyActionPill
                    onClick={onCancelarConsolidacion}
                    disabled={creando}
                  >
                    Cancelar
                  </GreyActionPill>
                </div>
              </div>
            )}
          </div>
        </div>


        {/* Lista de tutores existentes */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
          <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
            Tutores registrados ({tutores.length})
          </p>
          {!listaAbierta ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void abrirListaTutores()}
                className="rounded-full border border-sky-700/40 bg-white/80 px-5 py-2 text-xs font-extrabold uppercase tracking-wide text-sky-900 transition hover:bg-white"
              >
                Ver tutores registrados
              </button>
              <p className="text-center text-xs font-semibold text-slate-600">
                Catálogo oculto por eficiencia. Ábrelo solo si lo necesitas.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={cerrarListaTutores}
                className="mb-3 w-fit rounded-full border border-sky-700/40 bg-white/80 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-900 transition hover:bg-white"
              >
                No ver nada (ocultar lista)
              </button>
              {cargando ? (
                <p className="text-center text-xs font-semibold text-slate-600">
                  Cargando…
                </p>
              ) : tutores.length === 0 ? (
                <p className="text-center text-xs font-semibold text-slate-600">
                  Aún no hay tutores registrados.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {tutores.map(({ tutor, credencialesIniciales }) => (
                    <li
                      key={tutor.id}
                      className="flex flex-col gap-1 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {nombreCompletoTutor(tutor) ||
                            tutor.usuario ||
                            tutor.clave_tutor}
                        </span>
                        <span className="shrink-0 text-slate-400">
                          {tutor.clave_tutor}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                            tutor.activo
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {tutor.activo ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      {tutor.activo && credencialesIniciales.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {credencialesIniciales.map((c) => (
                            <span
                              key={c.curp_alumno}
                              className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800"
                              title={`Contraseña inicial del hijo ${c.curp_alumno}`}
                            >
                              {c.curp_alumno.slice(-4)} → {c.contraseñaInicial}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Generación masiva de tutores (Bloque 6B) */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
          <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
            Generación masiva de tutores
          </p>
          <p className="mb-4 text-center text-xs font-semibold text-slate-700">
            Crea automáticamente un tutor individual para cada alumno que aún no
            tenga uno. Los alumnos ya cubiertos se omiten. Al final podrás
            descargar el CSV con las credenciales iniciales.
          </p>

          {!preview && !resultado && (
            <div className="flex justify-center">
              <GreyActionPill
                onClick={onPrevisualizarMasiva}
                disabled={previsualizando}
              >
                {previsualizando ? "Analizando…" : "Previsualizar generación"}
              </GreyActionPill>
            </div>
          )}

          {/* Confirmación */}
          {preview && confirmando && (
            <div className="rounded-2xl border border-amber-400/50 bg-amber-100/70 p-4">
              <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                ¿Confirmar generación masiva?
              </p>
              <ul className="mb-3 flex flex-col gap-1 text-xs font-semibold text-amber-900">
                <li>Alumnos totales: {preview.totalAlumnos}</li>
                <li>Con tutor ya asignado: {preview.conTutor}</li>
                <li className="font-extrabold">
                  Se crearán: {preview.sinTutor} tutores
                </li>
              </ul>
              <div className="flex flex-wrap justify-center gap-2">
                <GreyActionPill onClick={onConfirmarMasiva} disabled={generando}>
                  {generando ? "Generando…" : "Sí, generar"}
                </GreyActionPill>
                <GreyActionPill onClick={onCancelarMasiva} disabled={generando}>
                  Cancelar
                </GreyActionPill>
              </div>
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className="rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-4">
              <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                Generación completada
              </p>
              <ul className="mb-3 flex flex-col gap-1 text-xs font-semibold text-emerald-900">
                <li>Procesados: {resultado.procesados}</li>
                <li className="font-extrabold">Tutores creados: {resultado.creados}</li>
                <li>Omitidos (ya tenían tutor): {resultado.omitidos}</li>
                <li>Errores: {resultado.errores}</li>
              </ul>
              {resultado.errores > 0 && (
                <details className="mb-3 rounded-xl bg-white/60 p-2 text-[11px] text-red-700">
                  <summary className="cursor-pointer font-extrabold uppercase">
                    Ver errores
                  </summary>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {resultado.erroresDetalle.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
              {resultado.creados > 0 && (
                <div className="flex justify-center">
                  <GreyActionPill onClick={onDescargarCsv}>
                    Descargar CSV de credenciales
                  </GreyActionPill>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


