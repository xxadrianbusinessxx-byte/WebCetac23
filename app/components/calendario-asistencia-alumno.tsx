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
  ColorDia,
  DiaEstadoAsistencia,
  MateriaDelDia,
  ResumenPorParcial,
} from "@/lib/escolar/asistencia/asistencias";
import { totalesEnClases } from "@/lib/escolar/asistencia/asistencia-dia-materia";
import { diasPorColorVacio } from "@/lib/escolar/asistencia/asistencia-parcial";
import type { FilaJustificacion } from "@/lib/escolar/asistencia/justificaciones";
import { fechaISO } from "@/lib/escolar/ciclo/calendario";


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
      className={`rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)] sm:text-[11px] ${className}`}
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
      className={`rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * tokens: `--oc-alert` es solo punto; el texto va con `--oc-alert-text`. Lo
 * mismo con el naranja nuevo (`--oc-warn` / `--oc-warn-text`). Nada de hex.
 */
const INFO_COLOR: Record<
  ColorDia,
  { etiqueta: string; corta: string; clase: string; punto: string; texto: string }
> = {
  verde: {
    etiqueta: "Asistió a todo",
    corta: "completa",
    clase: "bg-[var(--oc-ok)]/20 border-[var(--oc-ok)]/60 text-[var(--oc-text)]",
    punto: "bg-[var(--oc-ok)]",
    texto: "text-[var(--oc-ok)]",
  },
  naranja: {
    etiqueta: "Asistió a la mitad o más",
    corta: "mitad o más",
    clase:
      "bg-[var(--oc-warn)]/20 border-[var(--oc-warn)]/60 text-[var(--oc-warn-text)]",
    punto: "bg-[var(--oc-warn)]",
    texto: "text-[var(--oc-warn-text)]",
  },
  rojo: {
    etiqueta: "Asistió a menos de la mitad",
    corta: "menos de la mitad",
    clase:
      "bg-[var(--oc-alert)]/20 border-[var(--oc-alert)]/60 text-[var(--oc-alert-text)]",
    punto: "bg-[var(--oc-alert)]",
    texto: "text-[var(--oc-alert-text)]",
  },
  pendiente: {
    etiqueta: "Pendiente",
    corta: "pendiente",
    clase: "bg-[var(--oc-input)] border-[var(--oc-border-active)] text-[var(--oc-text)]",
    punto: "bg-[var(--oc-muted)]",
    texto: "text-[var(--oc-text)]",
  },
  sin_clase: {
    etiqueta: "Sin clase",
    corta: "sin clase",
    clase: "bg-[var(--oc-surface)] border-[var(--oc-border)] text-[var(--oc-muted)]",
    punto: "bg-[var(--oc-border)]",
    texto: "text-[var(--oc-muted)]",
  },
};

/** Orden único de los colores: leyenda, resumen del mes y resumen por parcial. */
const ORDEN_COLORES: readonly ColorDia[] = [
  "verde",
  "naranja",
  "rojo",
  "pendiente",
  "sin_clase",
];

/** Texto de UNA línea de materia en el detalle del día (PROMPT S · B). */
function lineaMateria(m: MateriaDelDia): string {
  if (m.tipo === "justificacion") return m.nombre;
  if (m.estado === "pendiente") return `${m.nombre} · pendiente`;
  const asistidas = m.asistidas ?? 0;
  if (m.estado === "completa") return `${m.nombre} · ${asistidas} de ${m.clases} ✓`;
  if (m.estado === "falta") return `${m.nombre} · ${asistidas} de ${m.clases} — faltó`;
  return `${m.nombre} · ${asistidas} de ${m.clases}`;
}

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

  const cargar = useCallback(() => {
    // Los `setState` van dentro de los callbacks de la promesa, nunca en la fase
    // síncrona del efecto: ahí fuerzan un render en cascada antes del dato
    // (regla `react-hooks/set-state-in-effect`). Mismo patrón que
    // `buscador-alumno-profesor.tsx` y `horario-escolar-panel.tsx`.
    if (!curp) return Promise.resolve();
    return Promise.resolve()
      .then(() => {
        setCargando(true);
        setError(null);
        setDatos(null);
      })
      .then(() => actionObtenerEstadosAsistenciaAlumno({ curp, profesorClave }))
      .then((res) => {
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
      });
  }, [curp, profesorClave]);

  // Cargar las justificaciones del alumno para pintar su estado por día.
  const cargarJustificaciones = useCallback(() => {
    // Mismo patrón que `cargar`: los `setState` van en el callback de la promesa.
    if (!curp) return Promise.resolve().then(() => setJustificaciones({}));
    return Promise.resolve()
      .then(() => actionObtenerJustificacionesDeAlumno(curp))
      .then((res) => {
        if (!res.ok) return;
        const mapa: Record<string, FilaJustificacion> = {};
        for (const j of res.justificaciones) mapa[j.fecha] = j;
        setJustificaciones(mapa);
      });
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

  // Resumen derivado. Los conteos de DÍAS (asistió/falta/pendiente/sin clase)
  // se conservan; el PORCENTAJE pasa a medirse EN CLASES (PROMPT S, decisión 4).
  // Resumen derivado: los DÍAS se cuentan por el mismo color con que se
  // pintan (PROMPT S · B) y el PORCENTAJE se mide EN CLASES con la regla única
  // `totalesEnClases` (decisión 4), la misma del dominio.
  const resumen = useMemo(() => {
    const porColor = diasPorColorVacio();
    let clasesRegistradas = 0;
    let clasesAsistidas = 0;
    for (const d of dias) {
      porColor[d.color]++;
      const t = totalesEnClases(d.materias);
      clasesRegistradas += t.clases;
      clasesAsistidas += t.asistidas;
    }
    const porcentaje =
      clasesRegistradas === 0
        ? 0
        : Math.round((clasesAsistidas / clasesRegistradas) * 100);
    return { porColor, porcentaje };
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

  // BLOQUE 9 (PIEZA 4) + PROMPT S (A5/B) — Anula el aporte de asistencia del
  // profesor POR MATERIA. `grupoMateriaId` identifica la fila a anular.
  async function onAnular(grupoMateriaId?: string) {
    if (!seleccionado || !datos?.grado || !datos?.grupo) return;
    setAnulando(true);
    setMensajeAnulacion(null);
    const res = await actionAnularAsistenciaProfesor({
      curp,
      fecha: seleccionado,
      grado: datos.grado,
      grupo: datos.grupo,
      grupoMateriaId: grupoMateriaId ?? null,
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
        <p className="text-center text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
          {nombreAlumno}
        </p>
      )}

      {datos?.cicloNombre && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-[10px] font-bold text-[var(--oc-muted)]">
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
            Ciclo
          </label>
          <span className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
            {datos.cicloNombre}
          </span>
          {datos.grado && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
              {datos.grado} · {datos.grupo}
              {datos.carrera ? ` · ${datos.carrera}` : ""}
            </span>
          )}
        </div>
      )}

      {error && (

        <p className="text-center text-xs font-semibold text-[var(--oc-alert-text)]" role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="text-center text-sm font-semibold text-[var(--oc-muted)]">
          Cargando asistencia…
        </p>
      ) : (
        <>
          {/* Resumen */}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3 text-[10px] font-bold text-[var(--oc-text)]">
            {ORDEN_COLORES.map((c) => (
              <span key={c} className="flex items-center gap-1" title={INFO_COLOR[c].etiqueta}>
                <span className={`h-2 w-2 rounded-full ${INFO_COLOR[c].punto}`} />
                {resumen.porColor[c]} {INFO_COLOR[c].corta}
              </span>
            ))}
            <span className="ml-1 rounded-full border border-[var(--oc-border-active)] bg-[var(--oc-surface)] px-3 py-1 text-[11px] font-extrabold text-[var(--oc-text)]">
              {resumen.porcentaje}% asistencia
            </span>
          </div>

          {/* Desglose POR PARCIAL (derivado del ciclo, resuelto en servidor) */}
          {datos && datos.resumenPorParcial.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-3xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3 text-[10px] font-bold text-[var(--oc-text)]">
              <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                Por parcial
              </p>
              {datos.resumenPorParcial.map((r) => (
                <div
                  key={r.parcial.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                    {r.parcial.nombre} · {r.parcial.fecha_inicio} a{" "}
                    {r.parcial.fecha_fin}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {ORDEN_COLORES.map((c) => (
                      <span key={c} className="flex items-center gap-1" title={INFO_COLOR[c].etiqueta}>
                        <span className={`h-2 w-2 rounded-full ${INFO_COLOR[c].punto}`} />
                        {r.diasPorColor[c]}
                      </span>
                    ))}
                    <span className="rounded-full border border-[var(--oc-border-active)] bg-[var(--oc-surface)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--oc-text)]">
                      {r.porcentaje}%
                    </span>
                  </span>
                </div>
              ))}
              {datos.conflictosParcial.length > 0 && (
                <p className="text-[10px] font-semibold text-[var(--oc-alert-text)]" role="alert">
                  {datos.conflictosParcial.length} día(s) caen en parciales
                  solapados y no se cuentan en ningún resumen.
                </p>
              )}
              {datos.diasSinParcial.length > 0 && (
                <p className="text-[10px] font-semibold text-[var(--oc-alert-text)]">
                  {datos.diasSinParcial.length} día(s) no pertenecen a ningún
                  parcial activo y no se asignan a un parcial.
                </p>
              )}
            </div>
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-[10px] font-bold text-[var(--oc-muted)]">
            {ORDEN_COLORES.map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${INFO_COLOR[c].punto}`} />
                {INFO_COLOR[c].etiqueta}
              </span>
            ))}
          </div>

          {/* Calendario visual mensual */}
          <div className="rounded-3xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <GreyActionPill onClick={() => cambiarMes(-1)}>‹</GreyActionPill>
              <p className="text-sm font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                {NOMBRES_MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
              </p>
              <GreyActionPill onClick={() => cambiarMes(1)}>›</GreyActionPill>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {NOMBRES_DIAS.map((d, i) => (
                <div
                  key={i}
                  className="pb-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]"
                >
                  {d}
                </div>
              ))}
              {celdasMes.map((fecha, i) => {
                if (!fecha) return <div key={`v-${i}`} />;
                const dia = diasPorFecha.get(fecha);
                const color: ColorDia = dia?.color ?? "sin_clase";
                const info = INFO_COLOR[color];
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
                      esSeleccionado ? "ring-2 ring-[var(--oc-border-active)]" : ""
                    } ${esHoy ? "outline outline-2 outline-[var(--oc-border-active)]" : ""}`}
                    title={info.etiqueta}
                  >
                    <span>{Number(fecha.slice(8))}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${info.punto}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detalle del día seleccionado */}
          {seleccionado && diaSeleccionado && (
            <div className="rounded-3xl border border-[var(--oc-border-active)] bg-[var(--oc-input)] p-4">
              <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                {seleccionado} · {INFO_COLOR[diaSeleccionado.color].etiqueta}
              </p>
              {diaSeleccionado.materias.length > 0 ? (
                <div className="flex flex-col gap-2 text-xs font-semibold text-[var(--oc-text)]">
                  <p className="text-center font-extrabold">
                    Hubo{" "}
                    {diaSeleccionado.materias.reduce((s, m) => s + m.clases, 0)}{" "}
                    clases · asistió a{" "}
                    {diaSeleccionado.materias.reduce(
                      (s, m) => s + (m.asistidas ?? 0),
                      0,
                    )}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {diaSeleccionado.materias.map((m, i) => (
                      <li
                        key={`${m.grupoMateriaId ?? "null"}-${i}`}
                        className="text-center"
                      >
                        {lineaMateria(m)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-xs font-semibold text-[var(--oc-text)]">
                  <p>Clases esperadas: {diaSeleccionado.clasesEsperadas}</p>
                  <p>
                    Clases asistidas:{" "}
                    {diaSeleccionado.clasesAsistidas === null
                      ? "—"
                      : diaSeleccionado.clasesAsistidas}
                  </p>
                </div>
              )}

              {permitirJustificacion &&
                diaSeleccionado.estado === "falta" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                      Justificación de la falta
                    </p>
                    {justificacionDia ? (
                      <p
                        role="status"
                        className={`rounded-2xl border px-4 py-3 text-center text-xs font-bold ${
                          justificacionDia.estado === "pendiente"
                            ? "border-[var(--oc-border-active)] bg-[var(--oc-input)] text-[var(--oc-text)]"
                            : justificacionDia.estado === "rechazada"
                              ? "border-[var(--oc-alert)]/60 bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"
                              : "border-[var(--oc-ok)]/60 bg-[var(--oc-ok)]/15 text-[var(--oc-text)]"
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
                          <label className="flex flex-col gap-1 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                              Clase a justificar (del horario del día)
                            </span>
                            <select
                              value={materiaJust}
                              onChange={(e) => setMateriaJust(e.target.value)}
                              className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-surface)] px-3 py-1.5 text-xs font-bold text-[var(--oc-text)] outline-none"
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
                          <p className="text-center text-[10px] font-semibold text-[var(--oc-alert-text)]">
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
                          className="w-full resize-none rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm font-semibold text-[var(--oc-text)]"
                        />
                        <label className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-xs font-bold text-[var(--oc-text)]">
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
                            className="max-w-full text-[11px] font-semibold text-[var(--oc-text)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--oc-mint)] file:px-4 file:py-1.5 file:text-[11px] file:font-extrabold file:uppercase file:text-[var(--oc-mint-ink)]"
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
                            ? "text-[var(--oc-text)]"
                            : "text-[var(--oc-alert-text)]"
                        }`}
                        role="status"
                      >
                        {mensajeJustificacion}
                      </p>
                    )}
                  </div>
                )}

              {/* BLOQUE 9 (PIEZA 4) + PROMPT S (B) — Anular POR MATERIA: un botón
                  por línea de materia con asistencia registrada; en líneas
                  legacy o de justificación no aparece. */}
              {permitirAnulacion &&
                profesorClave &&
                diaSeleccionado.materias.some(
                  (m) => m.grupoMateriaId != null && (m.asistidas ?? 0) > 0,
                ) && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                      Anular asistencia registrada por ti
                    </p>
                    {diaSeleccionado.materias
                      .filter(
                        (m) => m.grupoMateriaId != null && (m.asistidas ?? 0) > 0,
                      )
                      .map((m) => (
                        <GreyActionPill
                          key={m.grupoMateriaId!}
                          onClick={() => void onAnular(m.grupoMateriaId!)}
                          disabled={anulando}
                        >
                          {anulando ? "Anulando…" : `Anular ${m.nombre}`}
                        </GreyActionPill>
                      ))}
                    {mensajeAnulacion && (
                      <p
                        className={`text-center text-xs font-semibold ${
                          mensajeAnulacion.startsWith("Asistencia anulada")
                            ? "text-[var(--oc-text)]"
                            : "text-[var(--oc-alert-text)]"
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
