"use client";

import { useEffect, useRef, useState } from "react";

import {
  actionConfirmarAsistencias,
  actionDescargarPlantillaAsistencia,
  actionGuardarConfiguracionClasesProfesor,
  actionListarGruposAsistencia,
  actionObtenerConfiguracionClasesProfesor,
  actionPrevisualizarAsistencias,
} from "@/app/actions/asistencias";
import { actionDescargarPlantillaMateria } from "@/app/actions/materias";
import type {
  ConfiguracionClasesProfesor,
  ResumenAsistencia,
} from "@/lib/escolar/asistencias";


type Grupo = { grado: string; grupo: string; carrera: string };

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
            {resumen.pendientes} día(s) de clase del ciclo no vienen en el
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
            archivo y tu configuración semanal. Se usa tu configuración (fuente
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


export function AsistenciasPanel() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [ciclos, setCiclos] = useState<string[]>([]);
  const [cargandoGrupos, setCargandoGrupos] = useState(true);
  const [errorGrupos, setErrorGrupos] = useState<string | null>(null);

  const [grado, setGrado] = useState("");
  const [grupo, setGrupo] = useState("");
  const [carrera, setCarrera] = useState("");
  const [ciclo, setCiclo] = useState("");

  const [descargando, setDescargando] = useState(false);
  const [mensajeDescarga, setMensajeDescarga] = useState<string | null>(null);

  // BLOQUE 9 (PIEZA 2) — plantilla de MATERIA (CURP | NOMBRE) reutilizando el
  // mismo selector de grado/grupo/carrera (sin ciclo).
  const [descargandoMateria, setDescargandoMateria] = useState(false);
  const [mensajeDescargaMateria, setMensajeDescargaMateria] = useState<
    string | null
  >(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<ResumenAsistencia | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [mensajeConfirmar, setMensajeConfirmar] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Configuración semanal de clases del profesor (Bloque 5C).
  const [config, setConfig] = useState<ConfiguracionClasesProfesor | null>(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    void actionListarGruposAsistencia().then((r) => {
      if (!activo) return;
      setCargandoGrupos(false);
      if (r.ok) {
        setGrupos(r.data.grupos);
        setCiclos(r.data.ciclos);
      } else {
        setErrorGrupos(r.error);
      }
    });
    return () => {
      activo = false;
    };
  }, []);

  // Cargar la configuración semanal del profesor al montar.
  useEffect(() => {
    let activo = true;
    void actionObtenerConfiguracionClasesProfesor().then((r) => {
      if (!activo) return;
      setCargandoConfig(false);
      if (r.ok) setConfig(r.config);
      else setMensajeConfig(r.error);
    });
    return () => {
      activo = false;
    };
  }, []);

  const configSinDefinir =
    config !== null &&
    config.lunes === 0 &&
    config.martes === 0 &&
    config.miercoles === 0 &&
    config.jueves === 0 &&
    config.viernes === 0;

  function setDiaConfig(dia: keyof ConfiguracionClasesProfesor, valor: string) {
    setConfig((prev) => {
      if (!prev) return prev;
      const n = Number(valor);
      const limpio = Number.isInteger(n) && n >= 0 ? n : 0;
      return { ...prev, [dia]: limpio };
    });
    setMensajeConfig(null);
  }

  async function onGuardarConfig() {
    if (!config) return;
    setGuardandoConfig(true);
    setMensajeConfig(null);
    const r = await actionGuardarConfiguracionClasesProfesor({
      lunes: config.lunes,
      martes: config.martes,
      miercoles: config.miercoles,
      jueves: config.jueves,
      viernes: config.viernes,
    });
    setGuardandoConfig(false);
    if (r.ok) setMensajeConfig("Configuración guardada correctamente.");
    else setMensajeConfig(r.error);
  }


  const grados = [...new Set(grupos.map((g) => g.grado))].sort();
  const gruposDelGrado = [...new Set(grupos.filter((g) => g.grado === grado).map((g) => g.grupo))].sort();
  const carrerasDelGrupo = [
    ...new Set(
      grupos
        .filter((g) => g.grado === grado && g.grupo === grupo)
        .map((g) => g.carrera)
        .filter(Boolean),
    ),
  ].sort();

  const seleccionCompleta = Boolean(grado && grupo && ciclo);

  function onGradoChange(v: string) {
    setGrado(v);
    setGrupo("");
    setCarrera("");
    setPreview(null);
    setMensajeDescarga(null);
  }
  function onGrupoChange(v: string) {
    setGrupo(v);
    setCarrera("");
    setPreview(null);
    setMensajeDescarga(null);
  }

  async function onDescargar() {
    if (!seleccionCompleta) return;
    setDescargando(true);
    setMensajeDescarga(null);
    const r = await actionDescargarPlantillaAsistencia(grado, grupo, carrera, ciclo);
    setDescargando(false);
    if (!r.ok) {
      setMensajeDescarga(r.error);
      return;
    }
    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asistencias_${grado}_${grupo}${carrera ? `_${carrera}` : ""}_${ciclo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMensajeDescarga(
      `Plantilla generada: ${r.alumnos} alumnos · ${r.fechas.length} días de clase.`,
    );
  }

  // BLOQUE 9 (PIEZA 2) — Descarga la plantilla de MATERIA (CURP | NOMBRE)
  // para el grado/grupo/carrera ya seleccionados arriba.
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
      a.remove();
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
    if (!archivo || !seleccionCompleta) return;
    setMensajeConfirmar(null);
    const formData = new FormData();
    formData.set("archivo", archivo);
    const r = await actionPrevisualizarAsistencias(formData, grado, grupo, carrera, ciclo);
    if (r.ok) {
      setPreview(r.resumen);
    } else {
      setPreview(null);
      setMensajeConfirmar(r.error);
    }
  }

  async function onConfirmar() {
    if (!archivo || !seleccionCompleta) return;
    setConfirmando(true);
    setMensajeConfirmar(null);
    const formData = new FormData();
    formData.set("archivo", archivo);
    const r = await actionConfirmarAsistencias(formData, grado, grupo, carrera, ciclo);
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
      aria-label="Asistencias"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-sky-900">
            Asistencias
          </h2>
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]">
            Descarga la plantilla, llénala y súbela
          </span>
        </div>

        {/* Configuración semanal de clases del profesor (Bloque 5C). */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              Configuración de clases por día
            </p>
            <span className="text-[10px] font-semibold text-slate-600">
              Cuántas clases impartes cada día de la semana
            </span>
          </div>

          {cargandoConfig ? (
            <p className="mt-2 text-xs font-semibold text-slate-600">Cargando…</p>
          ) : config ? (
            <>
              {configSinDefinir && (
                <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
                  Aún no has configurado tus clases. Configúralas para que la
                  plantilla se genere automáticamente con el número de clases por
                  día.
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(
                  [
                    ["lunes", "Lunes"],
                    ["martes", "Martes"],
                    ["miercoles", "Miércoles"],
                    ["jueves", "Jueves"],
                    ["viernes", "Viernes"],
                  ] as const
                ).map(([clave, etiqueta]) => (
                  <label key={clave} className="flex flex-col gap-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                      {etiqueta}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={config[clave]}
                      onChange={(e) => setDiaConfig(clave, e.target.value)}
                      className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                      aria-label={`Clases del ${etiqueta}`}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <PillButton
                  onClick={onGuardarConfig}
                  disabled={guardandoConfig}
                  className="from-slate-400 via-slate-500 to-slate-600"
                >
                  {guardandoConfig ? "Guardando…" : "Guardar configuración"}
                </PillButton>
                {mensajeConfig && (
                  <p
                    className={`text-xs font-semibold ${mensajeConfig.includes("guardada") ? "text-sky-900" : "text-red-700"}`}
                    role="status"
                  >
                    {mensajeConfig}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs font-semibold text-red-700">
              No se pudo cargar la configuración.
            </p>
          )}
        </div>

        {errorGrupos && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
            {errorGrupos}
          </p>
        )}


        <div className="grid grid-cols-1 gap-3 rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:grid-cols-2 lg:grid-cols-4">
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
            onChange={setCarrera}
            options={carrerasDelGrupo}
            placeholder="Sin carrera"
          />
          <SelectField
            label="Ciclo escolar"
            value={ciclo}
            onChange={setCiclo}
            options={ciclos}
            placeholder="Selecciona ciclo"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PillButton onClick={onDescargar} disabled={!seleccionCompleta || descargando}>
            {descargando ? "Generando…" : "Descargar plantilla"}
          </PillButton>
          {mensajeDescarga && (
            <p className="text-xs font-semibold text-sky-900" role="status">
              {mensajeDescarga}
            </p>
          )}
        </div>

        {/* BLOQUE 9 (PIEZA 2) — Plantilla de MATERIA (CURP | NOMBRE) con el
            mismo selector de grado/grupo/carrera (sin ciclo). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PillButton
            onClick={onDescargarPlantillaMateria}
            disabled={!grado || !grupo || descargandoMateria}
            className="from-slate-400 via-slate-500 to-slate-600"
          >
            {descargandoMateria
              ? "Generando…"
              : "Descargar plantilla de materia (CURP | NOMBRE)"}
          </PillButton>
          {mensajeDescargaMateria && (
            <p
              className={`text-xs font-semibold ${
                mensajeDescargaMateria.includes("generada")
                  ? "text-sky-900"
                  : "text-red-700"
              }`}
              role="status"
            >
              {mensajeDescargaMateria}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <PillButton
              onClick={() => inputRef.current?.click()}
              className="from-slate-400 via-slate-500 to-slate-600"
            >
              {archivo ? `Archivo: ${archivo.name}` : "Seleccionar archivo"}
            </PillButton>
            <div className="flex flex-wrap gap-2">
              <PillButton
                onClick={onPrevisualizar}
                disabled={!archivo || !seleccionCompleta}
                className="from-slate-400 via-slate-500 to-slate-600"
              >
                Previsualizar
              </PillButton>
              <PillButton
                onClick={onConfirmar}
                disabled={!archivo || !seleccionCompleta || confirmando}
              >
                {confirmando ? "Guardando…" : "Confirmar"}
              </PillButton>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="sr-only"
            onChange={onArchivoElegido}
            aria-label="Seleccionar archivo de asistencias"
          />

          {preview && <div className="mt-3"><Resumen resumen={preview} /></div>}
          {mensajeConfirmar && (
            <p
              className={`mt-3 text-center text-xs font-semibold ${mensajeConfirmar.includes("guardadas") ? "text-sky-900" : "text-red-700"}`}
              role="status"
            >
              {mensajeConfirmar}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
