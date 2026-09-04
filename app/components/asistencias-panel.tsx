"use client";

import { useEffect, useState } from "react";

import {
  actionConfirmarAsistencias,
  actionDescargarPlantillaAsistencia,
  actionListarGruposAsistencia,
  actionObtenerMateriasHorarioGrupo,
  actionPrevisualizarAsistencias,
  type MateriaHorarioUI,
} from "@/app/actions/asistencias";
import { actionDescargarPlantillaMateria } from "@/app/actions/materias";
import type { ResumenAsistencia } from "@/lib/escolar/asistencias";


type Grupo = { grado: string; grupo: string; carrera: string };

/** Parcial ACTIVO del periodo OPERATIVO (periodos_evaluacion). */
type ParcialUI = {
  id: string;
  numero: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
};

function PillButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border border-white/70 bg-linear-to-b from-sky-500 via-sky-600 to-sky-700 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Resumen({ resumen }: { resumen: ResumenAsistencia }) {
  return (
    <div className="rounded-2xl border border-white/55 bg-white/60 p-4 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
        Resumen de la plantilla
      </p>
      {resumen.aviso && (
        <p className="mb-2 rounded-2xl border border-amber-300 bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-900">
          {resumen.aviso}
        </p>
      )}
      <p className="mb-1 text-[10px] font-semibold text-slate-500">
        Fuente de la fila CLASES:{" "}
        {resumen.usaHorario ? "horario oficial de la materia" : "sin horario"}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <span>Procesados: {resumen.procesados}</span>
        <span>Actualizados: {resumen.actualizados}</span>
        <span>Sin cambios: {resumen.sinCambios}</span>
        <span>Omitidos: {resumen.omitidos}</span>
        <span>Errores: {resumen.errores}</span>
      </div>

      {resumen.pendientes > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
          <p className="font-extrabold">
            {resumen.pendientes} día(s) de clase del parcial no vienen en el
            archivo y quedarán como PENDIENTES (no se marcan como falta).
          </p>
          <ul className="mt-1 max-h-24 list-inside list-disc overflow-auto">
            {resumen.pendientesDetalle.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {resumen.discrepancias > 0 && (
        <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-[11px] text-sky-900">
          <p className="font-extrabold">
            {resumen.discrepancias} discrepancia(s) entre la fila CLASES del
            archivo y el horario oficial de la materia. Se usa el horario (fuente
            oficial); no se modifica automáticamente.
          </p>
          <ul className="mt-1 max-h-24 list-inside list-disc overflow-auto">
            {resumen.discrepanciasDetalle.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {resumen.omitidosDetalle.length > 0 && (
        <ul className="mt-2 max-h-28 list-inside list-disc overflow-auto text-[11px] text-amber-700">
          {resumen.omitidosDetalle.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {resumen.erroresDetalle.length > 0 && (
        <ul className="mt-2 max-h-28 list-inside list-disc overflow-auto text-[11px] text-red-700">
          {resumen.erroresDetalle.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}


const DIAS_SEMANA_CORTOS = ["lun", "mar", "mié", "jue", "vie"];
const DIAS_LARGO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export function AsistenciasPanel({
  nombreProfesor,
}: {
  /** Nombre visible del profesor de la sesión. Solo presentación: la identidad
   *  real (profesor_id) la resuelve SIEMPRE el servidor. */
  nombreProfesor?: string | null;
} = {}) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  // CICLO GLOBAL — periodo OPERATIVO resuelto en la Server Action; el profesor
  // ya NO elige el ciclo: solo el PARCIAL dentro de ese ciclo.
  const [parciales, setParciales] = useState<ParcialUI[]>([]);
  const [errorGrupos, setErrorGrupos] = useState<string | null>(null);
  const [avisoOperativo, setAvisoOperativo] = useState<string | null>(null);

  const [grado, setGrado] = useState("");
  const [grupo, setGrupo] = useState("");
  const [carrera, setCarrera] = useState("");
  // `ciclo` es derivado del periodo OPERATIVO (nombre); alimenta el horario.
  const [ciclo, setCiclo] = useState("");
  const [parcialId, setParcialId] = useState("");

  // FASE HORARIO — materias del horario oficial del grupo (cualquier profesor
  // puede descargar la plantilla de una materia; el sistema calcula el número
  // de clases por día contando bloques del horario).
  const [materias, setMaterias] = useState<MateriaHorarioUI[]>([]);
  const [horarioCargado, setHorarioCargado] = useState(false);
  const [avisoHorario, setAvisoHorario] = useState<string | null>(null);
  const [materiaClave, setMateriaClave] = useState("");

  const [descargando, setDescargando] = useState(false);
  const [mensajeDescarga, setMensajeDescarga] = useState<string | null>(null);
  const [avisoPlantilla, setAvisoPlantilla] = useState<string | null>(null);

  // BLOQUE 9 (PIEZA 2) — plantilla de MATERIA (calificaciones, CURP | NOMBRE).
  const [descargandoMateria, setDescargandoMateria] = useState(false);
  const [mensajeDescargaMateria, setMensajeDescargaMateria] = useState<
    string | null
  >(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<ResumenAsistencia | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [mensajeConfirmar, setMensajeConfirmar] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    // Pieza C — el periodo OPERATIVO se preselecciona como default (viene
    // resuelto con obtenerCicloOperativoGlobal en la Server Action); el
    // profesor puede cambiarlo manualmente. Si no hay operativo se muestra
    // aviso en lugar de fallar en silencio.
    void actionListarGruposAsistencia().then((r) => {
      if (!activo) return;
      if (r.ok) {
        setGrupos(r.data.grupos);
        setParciales(r.data.parciales);
        if (r.data.periodoOperativo) {
          setCiclo(r.data.periodoOperativo.nombre);
          setAvisoOperativo(r.data.avisoOperativo);
          if (r.data.parciales.length > 0) {
            setParcialId((prev) => prev || r.data.parciales[0]!.id);
          } else {
            setParcialId("");
          }
        } else {
          setCiclo("");
          setParcialId("");
          setAvisoOperativo(r.data.avisoOperativo);
        }
      } else {
        setErrorGrupos(r.error);
      }
    });
    return () => {
      activo = false;
    };
  }, []);

  // Cargar las materias del horario oficial del grupo seleccionado.
  useEffect(() => {
    if (!grado || !grupo || !ciclo) return;
    let activo = true;
    void actionObtenerMateriasHorarioGrupo({
      grado,
      grupo,
      carrera,
      ciclo,
    }).then((r) => {
      if (!activo) return;
      if (r.ok) {
        setMaterias(r.materias);
        setHorarioCargado(r.usaHorario);
        setAvisoHorario(r.aviso);
      } else {
        setMaterias([]);
        setHorarioCargado(false);
        setAvisoHorario(r.error);
      }
    });
    return () => {
      activo = false;
    };
  }, [grado, grupo, carrera, ciclo]);

  const grados = [...new Set(grupos.map((g) => g.grado))].sort();
  const gruposDelGrado = [
    ...new Set(grupos.filter((g) => g.grado === grado).map((g) => g.grupo)),
  ].sort();
  const carrerasDelGrupo = [
    ...new Set(
      grupos
        .filter((g) => g.grado === grado && g.grupo === grupo)
        .map((g) => g.carrera)
        .filter(Boolean),
    ),
  ].sort();
  const materiaSeleccionada =
    materias.find((m) => m.clave === materiaClave) ?? null;
  const parcialSeleccionado = parciales.find((p) => p.id === parcialId) ?? null;

  const seleccionCompleta = Boolean(
    grado && grupo && ciclo && materiaClave && parcialId,
  );

  function limpiarSeleccionPlantilla() {
    setPreview(null);
    setMensajeDescarga(null);
    setAvisoPlantilla(null);
    setMensajeConfirmar(null);
  }

  function onGradoChange(v: string) {
    setGrado(v);
    setGrupo("");
    setCarrera("");
    setMateriaClave("");
    limpiarSeleccionPlantilla();
  }
  function onGrupoChange(v: string) {
    setGrupo(v);
    setCarrera("");
    setMateriaClave("");
    limpiarSeleccionPlantilla();
  }
  function onCarreraChange(v: string) {
    setCarrera(v);
    setMateriaClave("");
    limpiarSeleccionPlantilla();
  }
  function onParcialChange(v: string) {
    setParcialId(v);
    limpiarSeleccionPlantilla();
  }
  function onMateriaChange(clave: string) {
    setMateriaClave(clave);
    limpiarSeleccionPlantilla();
  }

  async function onDescargar() {
    if (!seleccionCompleta || !materiaClave) return;
    setDescargando(true);
    setMensajeDescarga(null);
    setAvisoPlantilla(null);
    const r = await actionDescargarPlantillaAsistencia(
      grado,
      grupo,
      carrera,
      materiaClave,
      parcialId,
    );
    setDescargando(false);
    if (!r.ok) {
      setMensajeDescarga(r.error);
      return;
    }
    try {
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nombreArchivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMensajeDescarga(
        `Plantilla generada: ${r.alumnos} alumnos · ${r.fechas.length} días de clase.`,
      );
      setAvisoPlantilla(r.aviso ?? null);
    } catch {
      setMensajeDescarga("No se pudo generar el archivo.");
    }
  }

  // BLOQUE 9 (PIEZA 2) — Plantilla de MATERIA (CURP | NOMBRE) para
  // calificaciones, con el mismo selector de grado/grupo/carrera.
  async function onDescargarPlantillaMateria() {
    if (!grado || !grupo) return;
    setDescargandoMateria(true);
    setMensajeDescargaMateria(null);
    const r = await actionDescargarPlantillaMateria(grado, grupo, carrera);
    setDescargandoMateria(false);
    if (!r.ok) {
      setMensajeDescargaMateria(r.error);
      return;
    }
    try {
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nombreArchivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMensajeDescargaMateria(
        `Plantilla de materia generada: ${r.alumnos} alumnos.`,
      );
    } catch {
      setMensajeDescargaMateria("No se pudo generar el archivo.");
    }
  }

  function onArchivoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setArchivo(f);
    setPreview(null);
    setMensajeConfirmar(null);
    e.target.value = "";
  }

  async function onPrevisualizar() {
    if (!archivo || !seleccionCompleta || !materiaClave) return;
    setMensajeConfirmar(null);
    const formData = new FormData();
    formData.set("archivo", archivo);
    const r = await actionPrevisualizarAsistencias(
      formData,
      grado,
      grupo,
      carrera,
      materiaClave,
      parcialId,
    );
    if (r.ok) {
      setPreview(r.resumen);
    } else {
      setPreview(null);
      setMensajeConfirmar(r.error);
    }
  }

  async function onConfirmar() {
    if (!archivo || !seleccionCompleta || !materiaClave) return;
    setConfirmando(true);
    setMensajeConfirmar(null);
    const formData = new FormData();
    formData.set("archivo", archivo);
    const r = await actionConfirmarAsistencias(
      formData,
      grado,
      grupo,
      carrera,
      materiaClave,
      parcialId,
    );
    setConfirmando(false);
    if (r.ok) {
      setPreview(r.resumen);
      setMensajeConfirmar("Asistencias guardadas correctamente.");
    } else {
      setMensajeConfirmar(r.error);
    }
  }

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Asistencias por materia"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-sky-900">
            Asistencias por materia
          </h2>
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]">
            Elige materia · el sistema calcula las clases por día
          </span>
        </div>

        {/* FASE HORARIO — materias del documento para el grupo seleccionado. */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              Horario oficial del grupo
            </p>
            <span className="text-[10px] font-semibold text-slate-600">
              Materias extraídas del horario semanal
            </span>
          </div>
          {!grado || !grupo || !ciclo ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Selecciona grado y grupo para ver las materias programadas
              del ciclo operativo y descargar su plantilla por parcial.
            </p>
          ) : !horarioCargado ? (
            <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" role="alert">
              {avisoHorario ??
                "El grupo no tiene horario oficial cargado para este ciclo."}
            </p>
          ) : (
            <>
              <p className="mt-2 text-[11px] font-semibold text-slate-600">
                {grado} · grupo {grupo}
                {carrera ? ` · ${carrera}` : ""} —{" "}
                {materias.length} materia(s) programada(s)
              </p>
              {materias.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {materias.map((m) => (
                    <button
                      key={m.clave}
                      type="button"
                      onClick={() => onMateriaChange(m.clave)}
                      className={`rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide transition ${
                        m.clave === materiaClave
                          ? "border-sky-600 bg-sky-200 text-sky-950"
                          : "border-white/70 bg-white/70 text-sky-900 hover:bg-white"
                      }`}
                    >
                      {m.nombre} · {m.totalSemana}
                    </button>
                  ))}
                </div>
              )}
              {avisoHorario && (
                <p className="mt-2 text-[11px] font-semibold text-amber-800">
                  {avisoHorario}
                </p>
              )}
            </>
          )}
        </div>

        {/* Selector de contexto + materia */}
        {avisoOperativo && (
          <div className="rounded-2xl border border-amber-300 bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-900">
            {avisoOperativo}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:grid-cols-2 lg:grid-cols-6">
          <SelectField
            label="Grado"
            value={grado}
            onChange={onGradoChange}
            options={grados}
            placeholder="Selecciona grado"
          />
          <SelectField
            label="Grupo"
            value={grupo}
            onChange={onGrupoChange}
            options={gruposDelGrado}
            placeholder="Selecciona grupo"
          />
          <SelectField
            label="Carrera (opcional)"
            value={carrera}
            onChange={onCarreraChange}
            options={carrerasDelGrupo}
            placeholder="Todas / tronco común"
          />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              Ciclo (operativo)
            </span>
            <span
              className={`rounded-full border px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] ${
                ciclo
                  ? "border-emerald-400/70 bg-emerald-100/90 text-emerald-900"
                  : "border-amber-300 bg-amber-100 text-amber-900"
              }`}
            >
              {ciclo || "Sin ciclo operativo"}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              Parcial
            </span>
            <select
              value={parcialId}
              onChange={(e) => onParcialChange(e.target.value)}
              disabled={parciales.length === 0}
              className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-sky-400/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {parciales.length === 0
                  ? "Sin parciales activos"
                  : "Selecciona parcial"}
              </option>
              {parciales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.fecha_inicio} a {p.fecha_fin}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              Materia
            </span>
            <select
              value={materiaClave}
              onChange={(e) => onMateriaChange(e.target.value)}
              disabled={materias.length === 0}
              className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50"
            >
              <option value="">
                {materias.length === 0 ? "Sin materias" : "Selecciona materia"}
              </option>
              {materias.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!avisoOperativo && (
          <p className="text-[10px] font-semibold text-slate-500">
            Ciclo global: periodo OPERATIVO de /configuracion. La plantilla se genera
            con los días de clase del calendario acotados al parcial elegido.
          </p>
        )}

        {/* Clases por día de la materia seleccionada (automático del horario) */}
        {materiaSeleccionada && (
          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              {materiaSeleccionada.nombre} — clases por día (automático)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIAS_SEMANA_CORTOS.map((d, i) => (
                <span
                  key={d}
                  className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-sky-900"
                >
                  {DIAS_LARGO[i]} · {materiaSeleccionada.porDia[d] ?? 0}
                </span>
              ))}
              <span className="rounded-full border border-emerald-400/70 bg-emerald-100/80 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-emerald-900">
                Total semana · {materiaSeleccionada.totalSemana}
              </span>
            </div>
            <p className="mt-2 text-[10px] font-semibold text-slate-600">
              La fila CLASES de la plantilla se llena automáticamente con estas
              cantidades.
            </p>
          </div>
        )}

        {errorGrupos && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
            {errorGrupos}
          </p>
        )}

        {/* Descarga de la plantilla de asistencias de la materia */}
        <div className="flex flex-col gap-2 rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <PillButton
              onClick={() => void onDescargar()}
              disabled={!seleccionCompleta || descargando}
            >
              {descargando ? "Generando…" : "Descargar plantilla"}
            </PillButton>
            <span className="text-[11px] font-semibold text-slate-600">
              {materiaSeleccionada
                ? `Materia: ${materiaSeleccionada.nombre}`
                : "Selecciona la materia para descargar su plantilla"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {mensajeDescarga && (
              <p className="text-xs font-semibold text-sky-900" role="status">
                {mensajeDescarga}
              </p>
            )}
            {avisoPlantilla && (
              <p className="text-[11px] font-semibold text-amber-800" role="status">
                {avisoPlantilla}
              </p>
            )}
          </div>
        </div>

        {/* Subir la plantilla llena (asistencias de la materia) */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              Sube la plantilla llena
            </p>
            <span className="text-[10px] font-semibold text-slate-600">
              CURP | NOMBRE | fechas · re-subir no duplica
            </span>
          </div>
          {/* Contexto EXPLÍCITO de la subida: qué materia/grupo/parcial se va a
              guardar y a quién se le atribuye. Sin esto, unos selectores
              olvidados arriba hacen que la plantilla se guarde (y la materia se
              traspase) en el sitio equivocado. */}
          {seleccionCompleta ? (
            <div className="mt-3 rounded-2xl border border-sky-500/60 bg-sky-50/90 px-4 py-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                Vas a subir la plantilla de:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  ["Grado", grado],
                  ["Grupo", grupo],
                  ["Carrera", carrera || "Tronco común"],
                  ["Materia", materiaSeleccionada?.nombre ?? materiaClave],
                  ["Parcial", parcialSeleccionado?.nombre ?? "—"],
                ].map(([etiqueta, valor]) => (
                  <span
                    key={etiqueta}
                    className="rounded-full border border-sky-600/40 bg-white/90 px-3 py-1 text-[11px] font-bold text-sky-900"
                  >
                    <span className="font-extrabold uppercase tracking-wide text-sky-700">
                      {etiqueta}:
                    </span>{" "}
                    {valor}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-sky-900">
                Se atribuirá a{" "}
                <span className="font-extrabold">
                  {nombreProfesor?.trim() || "tu perfil"}
                </span>
                : al confirmar, esta materia y todos sus registros de asistencia
                pasan a ser tuyos. Si otro profesor la tenía, deja de tenerla
                (conserva sus demás materias).
              </p>
              <p className="mt-1 text-[10px] font-semibold text-amber-800">
                Verifica que el archivo corresponda a esta materia y parcial
                antes de continuar.
              </p>
            </div>
          ) : (
            <p className="mt-2 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
              Antes de subir, elige arriba:{" "}
              {[
                !grado && "grado",
                !grupo && "grupo",
                !parcialId && "parcial",
                !materiaClave && "materia",
              ]
                .filter(Boolean)
                .join(" · ")}
              . La plantilla se guarda en la materia que quede seleccionada.
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={onArchivoElegido}
              disabled={!seleccionCompleta}
              className="max-w-xs rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-inner outline-none disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Seleccionar plantilla de asistencia llena"
            />
            <PillButton
              onClick={() => void onPrevisualizar()}
              disabled={!archivo || !seleccionCompleta}
            >
              Previsualizar cambios
            </PillButton>
          </div>
          {preview && (
            <div className="mt-3 rounded-2xl border border-white/60 bg-white/70 p-3">
              <Resumen resumen={preview} />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <PillButton
                  onClick={() => void onConfirmar()}
                  disabled={confirmando}
                  className="from-emerald-500 via-emerald-600 to-emerald-700"
                >
                  {confirmando ? "Guardando…" : "Confirmar asistencias"}
                </PillButton>
                {mensajeConfirmar && (
                  <p
                    className={`text-xs font-semibold ${
                      mensajeConfirmar.includes("correctamente")
                        ? "text-emerald-900"
                        : "text-red-700"
                    }`}
                    role="status"
                  >
                    {mensajeConfirmar}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Plantilla de MATERIA para calificaciones (CURP | NOMBRE). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PillButton
            onClick={() => void onDescargarPlantillaMateria()}
            disabled={!grado || !grupo || descargandoMateria}
            className="from-slate-400 via-slate-500 to-slate-600"
          >
            {descargandoMateria
              ? "Generando…"
              : "Descargar plantilla de materia (calificaciones)"}
          </PillButton>
          {mensajeDescargaMateria && (
            <p className="text-xs font-semibold text-sky-900" role="status">
              {mensajeDescargaMateria}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

