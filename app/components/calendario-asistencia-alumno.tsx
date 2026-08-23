"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  actionObtenerEstadosAsistenciaAlumno,
  actionSolicitarJustificacionAsistencia,
} from "@/app/actions/asistencias";
import { actionListarCiclosEscolares } from "@/app/actions/calendario";
import type {
  DiaEstadoAsistencia,
  EstadoAsistencia,
} from "@/lib/escolar/asistencias";
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
  grado: string;
  grupo: string;
  carrera?: string;
  /** Ciclo escolar. Si no se pasa, se cargan los ciclos y se usa el más reciente. */
  ciclo?: string;
  nombreAlumno?: string;
  /** Si se pasa, el maestro solo ve su propio aporte (nunca el global). */
  profesorClave?: string;
  /** Si true, permite solicitar justificación en días de falta. */
  permitirJustificacion?: boolean;
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
  grado,
  grupo,
  carrera,
  ciclo,
  nombreAlumno,
  profesorClave,
  permitirJustificacion = false,
}: Props) {
  const [dias, setDias] = useState<DiaEstadoAsistencia[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ciclos disponibles. Si `ciclo` viene por prop, se usa directamente; si no,
  // se cargan y se selecciona el más reciente.
  const [ciclos, setCiclos] = useState<string[]>([]);
  const [cicloSeleccionado, setCicloSeleccionado] = useState<string>(
    ciclo ?? "",
  );

  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(
    new Date(hoy.getFullYear(), hoy.getMonth(), 1),
  );

  // Día seleccionado para ver detalle / justificar.
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardandoJustificacion, setGuardandoJustificacion] = useState(false);
  const [mensajeJustificacion, setMensajeJustificacion] = useState<
    string | null
  >(null);

  // Cargar ciclos cuando no se pasa `ciclo` por prop.
  useEffect(() => {
    if (ciclo) {
      setCicloSeleccionado(ciclo);
      return;
    }
    let activo = true;
    void actionListarCiclosEscolares().then((lista) => {
      if (!activo) return;
      setCiclos(lista);
      if (lista.length > 0) {
        setCicloSeleccionado((prev) => prev || lista[0]!);
      }
    });
    return () => {
      activo = false;
    };
  }, [ciclo]);

  const cargar = useCallback(async () => {
    if (!curp || !grado || !grupo || !cicloSeleccionado) return;
    setCargando(true);
    setError(null);
    const res = await actionObtenerEstadosAsistenciaAlumno({
      curp,
      grado,
      grupo,
      carrera,
      ciclo: cicloSeleccionado,
      profesorClave,
    });
    setCargando(false);
    if (res.ok) {
      setDias(res.dias);
    } else {
      setDias([]);
      setError(res.error);
    }
  }, [curp, grado, grupo, carrera, cicloSeleccionado, profesorClave]);

  useEffect(() => {
    void cargar();
  }, [cargar]);


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

  async function onSolicitarJustificacion() {
    if (!seleccionado || !motivo.trim()) return;
    setGuardandoJustificacion(true);
    setMensajeJustificacion(null);
    const res = await actionSolicitarJustificacionAsistencia({
      curp,
      fecha: seleccionado,
      motivo: motivo.trim(),
    });
    setGuardandoJustificacion(false);
    if (res.ok) {
      setMensajeJustificacion(
        "Justificación enviada. Quedará pendiente de revisión.",
      );
      setMotivo("");
    } else {
      setMensajeJustificacion(res.error);
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

      {ciclos.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/60 bg-white/55 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
            Ciclo
          </label>
          <select
            value={cicloSeleccionado}
            onChange={(e) => setCicloSeleccionado(e.target.value)}
            className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
          >
            {ciclos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
                      Solicitar justificación
                    </p>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Motivo de la falta…"
                      className="w-full resize-none rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-sm font-semibold text-sky-900"
                    />
                    <div className="flex justify-center">
                      <GreyActionPill
                        onClick={onSolicitarJustificacion}
                        disabled={guardandoJustificacion || !motivo.trim()}
                      >
                        {guardandoJustificacion
                          ? "Enviando…"
                          : "Enviar justificación"}
                      </GreyActionPill>
                    </div>
                    {mensajeJustificacion && (
                      <p className="text-center text-xs font-semibold text-sky-900">
                        {mensajeJustificacion}
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
