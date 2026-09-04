"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  actionAnularAsistenciaProfesor,
  actionObtenerEstadosAsistenciaAlumno,
} from "@/app/actions/asistencias";
import {
  actionObtenerJustificacionesDeAlumno,
  actionObtenerMateriasJustificables,
  actionSolicitarJustificacionConArchivo,
  type MateriaJustificableUI,
} from "@/app/actions/justificaciones";
import type {
  DiaEstadoAsistencia,
  EstadoAsistencia,
  ResumenPorParcial,
} from "@/lib/escolar/asistencias";
import type { FilaJustificacion } from "@/lib/escolar/justificaciones";
import { fechaISO } from "@/lib/escolar/calendario";


/**
 * Calendario visual de ASISTENCIA de un alumno (Bloque 5D).
 *
 * Muestra, mes a mes, el estado derivado de cada día del calendario escolar:
 *   asistio / falta / pendiente / sin_clase
 *
 * Los estados y el porcentaje son DERIVADOS: NO se almacenan en ninguna tabla.
 * Se calculan en el servidor a partir de `calendario_escolar`,
 * `clases_impartidas` y `asistencia_alumnos`.
 *
 * Reutilizable para:
 *  - /perfil (pestaña Estatus) → el alumno ve su propia asistencia.
 *  - /tutor (selector de alumno) → el tutor ve la asistencia de sus alumnos y
 *    puede solicitar justificaciones.
 *  - maestro (con `profesorClave`) → ve SOLO su propio aporte.
 */

type Props = {
  curp: string;
  nombreAlumno?: string;
  /** Si se pasa, el maestro solo ve su propio aporte (nunca el global). */
  profesorClave?: string;
  /** Si true, permite solicitar justificación en días de falta. */
  permitirJustificacion?: boolean;
  /**
   * BLOQUE 9 (PIEZA 4) — Si true (y hay `profesorClave`), permite ANULAR el
   * aporte de asistencia registrado por ESE profesor en días «asistio».
   */
  permitirAnulacion?: boolean;
};

/**
 * Contexto que devuelve el servidor junto con los días: ciclo global (operativo),
 * identidad resuelta desde la inscripción y el desglose POR PARCIAL.
 */
type ContextoAsistenciaAlumno = {
  cicloNombre: string;
  grado: string;
  grupo: string;
  carrera: string;
  resumenPorParcial: ResumenPorParcial[];
  conflictosParcial: {
    fecha: string;
    parciales: { id: string; numero: number; nombre: string }[];
  }[];
  diasSinParcial: string[];
};


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

/** Etiquetas y colores por estado de asistencia. */
const INFO_ESTADO: Record<
  EstadoAsistencia,
  { etiqueta: string; simbolo: string; clase: string; texto: string }
> = {
  asistio: {
    etiqueta: "Asistió",
    simbolo: "🟢",
    clase: "bg-emerald-200/80 border-emerald-500/60 text-emerald-900",
    texto: "text-emerald-800",
  },
  falta: {
    etiqueta: "Falta",
    simbolo: "🔴",
    clase: "bg-red-200/80 border-red-500/60 text-red-900",
    texto: "text-red-800",
  },
  pendiente: {
    etiqueta: "Pendiente",
    simbolo: "🟠",
    clase: "bg-amber-200/80 border-amber-500/60 text-amber-900",
    texto: "text-amber-800",
  },
  sin_clase: {
    etiqueta: "Sin clase",
    simbolo: "⚪",
    clase: "bg-slate-200/80 border-slate-400/60 text-slate-700",
    texto: "text-slate-700",
  },
};

const NOMBRES_MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const NOMBRES_DIAS = ["L", "M", "M", "J", "V", "S", "D"];

export function CalendarioAsistenciaAlumno({
  curp,
  nombreAlumno,
  profesorClave,
  permitirJustificacion = false,
  permitirAnulacion = false,
}: Props) {
  const [dias, setDias] = useState<DiaEstadoAsistencia[]>([]);
  const [datos, setDatos] = useState<ContextoAsistenciaAlumno | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(
    new Date(hoy.getFullYear(), hoy.getMonth(), 1),
  );

  // Día seleccionado para ver detalle / justificar.
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardandoJustificacion, setGuardandoJustificacion] = useState(false);
  const [mensajeJustificacion, setMensajeJustificacion] = useState<
    string | null
  >(null);

  // BLOQUE 9 (PIEZA 4) — Anulación del aporte del profesor en un día «asistio».
  const [anulando, setAnulando] = useState(false);
  const [mensajeAnulacion, setMensajeAnulacion] = useState<string | null>(null);

  // Justificaciones del alumno (por fecha) para mostrar su estado.
  const [justificaciones, setJustificaciones] = useState<
    Record<string, FilaJustificacion>
  >({});

  // Prompt B — justificación POR CLASE: materias del grupo ESE día (horario
  // oficial). Solo aplica cuando un profesor usa el panel.
  const [materiasDia, setMateriasDia] = useState<MateriaJustificableUI[]>([]);
  const [materiaJust, setMateriaJust] = useState("");

  const cargar = useCallback(async () => {
    if (!curp) return;
    setCargando(true);
    setError(null);
    setDatos(null);
    const res = await actionObtenerEstadosAsistenciaAlumno({
      curp,
      profesorClave,
    });
    setCargando(false);
    if (res.ok) {
      setDias(res.dias);
      setDatos({
        cicloNombre: res.cicloNombre,
        grado: res.grado,
        grupo: res.grupo,
        carrera: res.carrera,
        resumenPorParcial: res.resumenPorParcial,
        conflictosParcial: res.conflictosParcial,
        diasSinParcial: res.diasSinParcial,
      });
    } else {
      setDias([]);
      setError(res.error);
    }
  }, [curp, profesorClave]);

  // Cargar las justificaciones del alumno para pintar su estado por día.
  const cargarJustificaciones = useCallback(async () => {
    if (!curp) {
      setJustificaciones({});
      return;
    }
    const res = await actionObtenerJustificacionesDeAlumno(curp);
    if (res.ok) {
      const mapa: Record<string, FilaJustificacion> = {};
      for (const j of res.justificaciones) mapa[j.fecha] = j;
      setJustificaciones(mapa);
    }
  }, [curp]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void cargarJustificaciones();
  }, [cargarJustificaciones]);

  // Al elegir un día, el profesor (si aplica) carga las materias de ESE día.
  useEffect(() => {
    let activo = true;
    if (!seleccionado || !profesorClave || !permitirJustificacion) {
      void Promise.resolve().then(() => {
        if (!activo) return;
        setMateriasDia([]);
        setMateriaJust("");
      });
      return () => {
        activo = false;
      };
    }
    void actionObtenerMateriasJustificables({
      curp,
      fecha: seleccionado,
    }).then((r) => {
      if (!activo) return;
      if (r.ok && r.materias.length > 0) {
        setMateriasDia(r.materias);
        setMateriaJust((prev) => prev || r.materias[0]!.materiaClave);
      } else {
        setMateriasDia([]);
        setMateriaJust("");
      }
    });
    return () => {
      activo = false;
    };
  }, [seleccionado, curp, profesorClave, permitirJustificacion]);


  const diasPorFecha = useMemo(() => {
    const mapa = new Map<string, DiaEstadoAsistencia>();
    for (const d of dias) mapa.set(d.fecha, d);
    return mapa;
  }, [dias]);

  // Celdas del mes visible (con huecos para alinear el primer día).
  const celdasMes = useMemo(() => {
    const anio = mesVisible.getFullYear();
    const mes = mesVisible.getMonth();
    const primerDia = new Date(anio, mes, 1);
    const offset = (primerDia.getDay() + 6) % 7; // lunes = 0
    const totalDias = new Date(anio, mes + 1, 0).getDate();
    const celdas: (string | null)[] = [];
    for (let i = 0; i < offset; i++) celdas.push(null);
    for (let d = 1; d <= totalDias; d++) {
      celdas.push(fechaISO(new Date(anio, mes, d)));
    }
    return celdas;
  }, [mesVisible]);

  function cambiarMes(delta: number) {
    setMesVisible(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
    setSeleccionado(null);
    setMensajeJustificacion(null);
    setMensajeAnulacion(null);
  }

  // Resumen derivado (solo sobre clases registradas: asistencias + faltas).
  const resumen = useMemo(() => {
    let asistencias = 0;
    let faltas = 0;
    let pendientes = 0;
    let sinClase = 0;
    for (const d of dias) {
      if (d.estado === "asistio") asistencias++;
      else if (d.estado === "falta") faltas++;
      else if (d.estado === "pendiente") pendientes++;
      else sinClase++;
    }
    const registradas = asistencias + faltas;
    const porcentaje =
      registradas === 0 ? 0 : Math.round((asistencias / registradas) * 100);
    return { asistencias, faltas, pendientes, sinClase, porcentaje };
  }, [dias]);

  const diaSeleccionado = seleccionado
    ? diasPorFecha.get(seleccionado)
    : null;
  const justificacionDia = seleccionado
    ? justificaciones[seleccionado]
    : undefined;

  async function onSolicitarJustificacion() {
    if (!seleccionado || !motivo.trim() || !archivo) return;
    setGuardandoJustificacion(true);
    setMensajeJustificacion(null);
    const formData = new FormData();
    formData.append("curp", curp);
    formData.append("fecha", seleccionado);
    formData.append("motivo", motivo.trim());
    formData.append("materia_clave", materiaJust);
    formData.append("archivo", archivo);
    const res = await actionSolicitarJustificacionConArchivo(formData);
    setGuardandoJustificacion(false);
    if (res.ok) {
      setMensajeJustificacion(
        "Justificación enviada. Quedará pendiente de revisión.",
      );
      setMotivo("");
      setArchivo(null);
      await cargarJustificaciones();
    } else {
      setMensajeJustificacion(res.error);
    }
  }

  // BLOQUE 9 (PIEZA 4) — Anula el aporte de asistencia del profesor (día
  // «asistio»). Mismo patrón de confirmación/envió que la justificación.
  async function onAnular() {
    if (!seleccionado || !datos?.grado || !datos?.grupo) return;
    setAnulando(true);
    setMensajeAnulacion(null);
    const res = await actionAnularAsistenciaProfesor({
      curp,
      fecha: seleccionado,
      grado: datos.grado,
      grupo: datos.grupo,
    });
    setAnulando(false);
    if (res.ok) {
      setMensajeAnulacion("Asistencia anulada correctamente.");
      await cargar();
    } else {
      setMensajeAnulacion(res.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PanelTab className="mx-auto w-fit">Asistencia</PanelTab>

      {nombreAlumno && (
        <p className="text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
          {nombreAlumno}
        </p>
      )}

      {datos?.cicloNombre && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/60 bg-white/55 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
            Ciclo
          </label>
          <span className="rounded-full border border-emerald-400/70 bg-emerald-100/90 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-900">
            {datos.cicloNombre}
          </span>
          {datos.grado && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {datos.grado} · {datos.grupo}
              {datos.carrera ? ` · ${datos.carrera}` : ""}
            </span>
          )}
        </div>
      )}

      {error && (

        <p className="text-center text-xs font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="text-center text-sm font-semibold text-slate-600">
          Cargando asistencia…
        </p>
      ) : (
        <>
          {/* Resumen */}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-white/55 bg-slate-400/25 p-3 text-[10px] font-bold text-slate-700 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <span className="flex items-center gap-1">
              <span>🟢</span> {resumen.asistencias} asistió
            </span>
            <span className="flex items-center gap-1">
              <span>🔴</span> {resumen.faltas} falta
            </span>
            <span className="flex items-center gap-1">
              <span>🟠</span> {resumen.pendientes} pendiente
            </span>
            <span className="flex items-center gap-1">
              <span>⚪</span> {resumen.sinClase} sin clase
            </span>
            <span className="ml-1 rounded-full border border-sky-500/50 bg-sky-100/90 px-3 py-1 text-[11px] font-extrabold text-sky-900">
              {resumen.porcentaje}% asistencia
            </span>
          </div>

          {/* Desglose POR PARCIAL (derivado del ciclo, resuelto en servidor) */}
          {datos && datos.resumenPorParcial.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-3xl border border-white/55 bg-white/55 p-3 text-[10px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
              <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                Por parcial
              </p>
              {datos.resumenPorParcial.map((r) => (
                <div
                  key={r.parcial.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                    {r.parcial.nombre} · {r.parcial.fecha_inicio} a{" "}
                    {r.parcial.fecha_fin}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>🟢 {r.asistencias}</span>
                    <span>🔴 {r.faltas}</span>
                    <span>🟠 {r.pendientes}</span>
                    <span>⚪ {r.sinClase}</span>
                    <span className="rounded-full border border-sky-500/50 bg-sky-100/90 px-2 py-0.5 text-[10px] font-extrabold text-sky-900">
                      {r.porcentaje}%
                    </span>
                  </span>
                </div>
              ))}
              {datos.conflictosParcial.length > 0 && (
                <p className="text-[10px] font-semibold text-red-700" role="alert">
                  {datos.conflictosParcial.length} día(s) caen en parciales
                  solapados y no se cuentan en ningún resumen.
                </p>
              )}
              {datos.diasSinParcial.length > 0 && (
                <p className="text-[10px] font-semibold text-amber-700">
                  {datos.diasSinParcial.length} día(s) no pertenecen a ningún
                  parcial activo y no se asignan a un parcial.
                </p>
              )}
            </div>
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/60 bg-white/55 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
            {(Object.keys(INFO_ESTADO) as EstadoAsistencia[]).map((e) => (
              <span key={e} className="flex items-center gap-1">
                <span>{INFO_ESTADO[e].simbolo}</span>
                {INFO_ESTADO[e].etiqueta}
              </span>
            ))}
          </div>

          {/* Calendario visual mensual */}
          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <GreyActionPill onClick={() => cambiarMes(-1)}>‹</GreyActionPill>
              <p className="text-sm font-extrabold uppercase tracking-wide text-sky-900">
                {NOMBRES_MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
              </p>
              <GreyActionPill onClick={() => cambiarMes(1)}>›</GreyActionPill>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {NOMBRES_DIAS.map((d, i) => (
                <div
                  key={i}
                  className="pb-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-slate-500"
                >
                  {d}
                </div>
              ))}
              {celdasMes.map((fecha, i) => {
                if (!fecha) return <div key={`v-${i}`} />;
                const dia = diasPorFecha.get(fecha);
                const estado = dia?.estado ?? "sin_clase";
                const info = INFO_ESTADO[estado];
                const esSeleccionado = seleccionado === fecha;
                const esHoy = fecha === fechaISO(hoy);
                return (
                  <button
                    key={fecha}
                    type="button"
                    onClick={() => {
                      setSeleccionado(fecha);
                      setMensajeJustificacion(null);
                      setMensajeAnulacion(null);
                    }}
                    className={`flex min-h-[3rem] flex-col items-center justify-center rounded-xl border p-1 text-xs font-bold transition hover:brightness-105 sm:min-h-[3.5rem] ${info.clase} ${
                      esSeleccionado ? "ring-2 ring-sky-500 ring-offset-1" : ""
                    } ${esHoy ? "outline outline-2 outline-sky-400" : ""}`}
                    title={info.etiqueta}
                  >
                    <span>{Number(fecha.slice(8))}</span>
                    <span className="text-[10px]">{info.simbolo}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detalle del día seleccionado */}
          {seleccionado && diaSeleccionado && (
            <div className="rounded-3xl border border-sky-400/50 bg-sky-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
              <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                {seleccionado} · {INFO_ESTADO[diaSeleccionado.estado].etiqueta}
              </p>
              <div className="flex flex-col items-center gap-1 text-xs font-semibold text-slate-700">
                <p>
                  Clases esperadas: {diaSeleccionado.clasesEsperadas}
                </p>
                <p>
                  Clases asistidas:{" "}
                  {diaSeleccionado.clasesAsistidas === null
                    ? "—"
                    : diaSeleccionado.clasesAsistidas}
                </p>
              </div>

              {permitirJustificacion &&
                diaSeleccionado.estado === "falta" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                      Justificación de la falta
                    </p>
                    {justificacionDia ? (
                      <p
                        role="status"
                        className={`rounded-2xl border px-4 py-3 text-center text-xs font-bold ${
                          justificacionDia.estado === "pendiente"
                            ? "border-amber-500/60 bg-amber-100/90 text-amber-900"
                            : justificacionDia.estado === "rechazada"
                              ? "border-red-500/60 bg-red-100/90 text-red-900"
                              : "border-emerald-500/60 bg-emerald-100/90 text-emerald-900"
                        }`}
                      >
                        {justificacionDia.estado === "pendiente"
                          ? "Justificación enviada — pendiente de revisión."
                          : justificacionDia.estado === "rechazada"
                            ? `Justificación rechazada: ${
                                justificacionDia.motivo_rechazo ||
                                "sin motivo registrado"
                              }`
                            : "Justificación aprobada."}
                      </p>
                    ) : (
                      <>
                        {profesorClave && (
                          <label className="flex flex-col gap-1 rounded-2xl border border-white/70 bg-white/90 px-3 py-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                              Clase a justificar (del horario del día)
                            </span>
                            <select
                              value={materiaJust}
                              onChange={(e) => setMateriaJust(e.target.value)}
                              className="rounded-full border border-sky-700/30 bg-white px-3 py-1.5 text-xs font-bold text-sky-900 outline-none"
                            >
                              <option value="">Día completo</option>
                              {materiasDia.map((m) => (
                                <option
                                  key={m.materiaClave}
                                  value={m.materiaClave}
                                >
                                  {m.nombre} · {m.bloques} clase(s)
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {profesorClave && materiasDia.length === 0 && (
                          <p className="text-center text-[10px] font-semibold text-amber-800">
                            No se pudo leer el horario del grupo para ese día
                            (aplica supabase/agregar-materia-justificaciones.sql
                            para justificar por clase).
                          </p>
                        )}
                        <textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Motivo de la falta (obligatorio)…"
                          className="w-full resize-none rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-sm font-semibold text-sky-900"
                        />
                        <label className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-sky-500/60 bg-white/80 px-4 py-3 text-xs font-bold text-sky-900">
                          <span>
                            {archivo
                              ? `Archivo listo: ${archivo.name}`
                              : "Adjuntar justificante (PDF, JPG o PNG; obligatorio)"}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                            onChange={(e) => {
                              setArchivo(e.target.files?.[0] ?? null);
                              setMensajeJustificacion(null);
                            }}
                            className="max-w-full text-[11px] font-semibold text-sky-900 file:mr-3 file:rounded-full file:border-0 file:bg-sky-800 file:px-4 file:py-1.5 file:text-[11px] file:font-extrabold file:uppercase file:text-white"
                            aria-label="Seleccionar archivo de justificación"
                          />
                        </label>
                        <div className="flex flex-wrap justify-center gap-2">
                          <GreyActionPill
                            onClick={() => {
                              setMotivo("");
                              setArchivo(null);
                              setMensajeJustificacion(null);
                            }}
                            disabled={guardandoJustificacion}
                          >
                            Cancelar
                          </GreyActionPill>
                          <GreyActionPill
                            onClick={onSolicitarJustificacion}
                            disabled={
                              guardandoJustificacion ||
                              !motivo.trim() ||
                              !archivo
                            }
                          >
                            {guardandoJustificacion
                              ? "Enviando…"
                              : "Enviar justificación"}
                          </GreyActionPill>
                        </div>
                      </>
                    )}
                    {mensajeJustificacion && (
                      <p
                        className={`text-center text-xs font-semibold ${
                          mensajeJustificacion.startsWith("Justificación enviada")
                            ? "text-sky-900"
                            : "text-red-700"
                        }`}
                        role="status"
                      >
                        {mensajeJustificacion}
                      </p>
                    )}
                  </div>
                )}

              {/* BLOQUE 9 (PIEZA 4) — Anular el aporte del profesor en un día
                  «asistio». Mismo patrón visual/de confirmación que la
                  justificación (bloque en el detalle del día). */}
              {permitirAnulacion &&
                profesorClave &&
                diaSeleccionado.estado === "asistio" && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                      Anular asistencia registrada por ti
                    </p>
                    <GreyActionPill
                      onClick={() => void onAnular()}
                      disabled={anulando}
                    >
                      {anulando ? "Anulando…" : "Anular"}
                    </GreyActionPill>
                    {mensajeAnulacion && (
                      <p
                        className={`text-center text-xs font-semibold ${
                          mensajeAnulacion.startsWith("Asistencia anulada")
                            ? "text-sky-900"
                            : "text-red-700"
                        }`}
                        role="status"
                      >
                        {mensajeAnulacion}
                      </p>
                    )}
                  </div>
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
