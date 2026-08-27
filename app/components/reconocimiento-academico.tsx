"use client";

/**
 * C4.19 — RECONOCIMIENTO ACADÉMICO DE ALUMNOS (Panel Directivo → Configuración).
 *
 * Importa un Excel con CURP y nombre, permite al directivo seleccionar
 * EXPLÍCITAMENTE periodo, carrera, grado y grupo (desde el catálogo real) y
 * REUTILIZA el pipeline C3.1 (actionPrevisualizarCargaAcademica /
 * actionAplicarCargaAcademica) para generar/actualizar la inscripción:
 *
 *   alumno → inscripciones_alumno → grupo → carrera/grado/periodo
 *
 * NO crea arquitectura nueva, NO guarda datos duplicados, NO infiere
 * carrera/grupo/grado. Solo rol directivo (validado en las Server Actions).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  actionAplicarCargaAcademica,
  actionListarCatalogoReconocimiento,
  actionPrevisualizarCargaAcademica,
  type CatalogoReconocimiento,
} from "@/app/actions/carga-academica";
import { archivoCsvAFilas } from "@/lib/escolar/csv";
import {
  detectarColumnasRoster,
  type CampoRoster,
  type MapeoRoster,
} from "@/lib/escolar/mapeo-columnas";
import { normalizarCurp, pareceCurp } from "@/lib/escolar/buscar-en-filas";
import type {
  PreviewCargaAcademica,
  ResultadoAplicarCarga,
} from "@/lib/escolar/carga-academica";

const CAMPOS_NOMBRE: CampoRoster[] = ["nombre", "pApellido", "sApellido"];

const CAMPOS_SELECTOR: Array<{ campo: CampoRoster; etiqueta: string; obligatorio: boolean }> = [
  { campo: "curp", etiqueta: "CURP", obligatorio: true },
  { campo: "nombre", etiqueta: "Nombre(s)", obligatorio: false },
  { campo: "pApellido", etiqueta: "Apellido paterno", obligatorio: false },
  { campo: "sApellido", etiqueta: "Apellido materno", obligatorio: false },
];

export function ReconocimientoAcademico() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [catalogo, setCatalogo] = useState<CatalogoReconocimiento | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasDatos, setFilasDatos] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<MapeoRoster | null>(null);

  const [periodoId, setPeriodoId] = useState("");
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const [grado, setGrado] = useState("");
  const [grupoId, setGrupoId] = useState("");

  const [previewServer, setPreviewServer] =
    useState<PreviewCargaAcademica | null>(null);
  const [resultado, setResultado] = useState<ResultadoAplicarCarga | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await actionListarCatalogoReconocimiento();
      if ("error" in r) setCatalogoError(r.error);
      else setCatalogo(r);
      setCargandoCatalogo(false);
    })();
  }, []);

  async function onArchivo(file: File) {
    setArchivo(file);
    setPreviewServer(null);
    setResultado(null);
    setConfirmado(false);
    setMensaje(null);
    try {
      const parsed = await archivoCsvAFilas(file);
      const filas = parsed.filas.filter((f) =>
        f.some((c) => (c ?? "").trim() !== ""),
      );
      if (filas.length < 1) {
        setMensaje("El archivo está vacío o no se pudo leer.");
        return;
      }
      const head = filas[0].map((h, i) => (h ?? "").trim() || `Col ${i + 1}`);
      setEncabezados(head);
      setFilasDatos(filas.slice(1));
      setMapeo(detectarColumnasRoster(head));
      setMensaje(
        `Archivo listo: ${file.name}. Revisa las columnas y el contexto académico.`,
      );
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }

  function onCambiarCampo(campo: CampoRoster, indice: number) {
    if (!mapeo) return;
    setMapeo((prev) => {
      if (!prev) return prev;
      const siguiente: MapeoRoster = { ...prev, [campo]: indice };
      for (const c of CAMPOS_SELECTOR.map((x) => x.campo)) {
        if (c === campo) continue;
        if (siguiente[c] === indice) siguiente[c] = -1;
      }
      return siguiente;
    });
  }

  const filasPreview = useMemo(() => {
    if (!mapeo || filasDatos.length === 0) return [];
    return filasDatos.slice(0, 10).map((fila) => {
      const curp = normalizarCurp(String(fila[mapeo.curp] ?? ""));
      const nombre = CAMPOS_NOMBRE.map((c) =>
        mapeo[c] >= 0 ? String(fila[mapeo[c]] ?? "").trim() : "",
      )
        .filter(Boolean)
        .join(" ")
        .trim();
      return { curp, nombre };
    });
  }, [mapeo, filasDatos]);

  const erroresLocal = useMemo(() => {
    if (!mapeo || filasDatos.length === 0) return [];
    const errs: string[] = [];
    const vistos = new Set<string>();
    let curpsVacias = 0;
    let curpsInvalidas = 0;
    let nombresVacios = 0;
    let duplicados = 0;
    for (const fila of filasDatos) {
      const curp = normalizarCurp(String(fila[mapeo.curp] ?? ""));
      if (!curp) {
        curpsVacias++;
        continue;
      }
      if (!pareceCurp(curp)) {
        curpsInvalidas++;
        continue;
      }
      if (vistos.has(curp)) duplicados++;
      vistos.add(curp);
      const nombre = CAMPOS_NOMBRE.map((c) =>
        mapeo[c] >= 0 ? String(fila[mapeo[c]] ?? "").trim() : "",
      )
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!nombre) nombresVacios++;
    }
    if (curpsVacias) errs.push(`${curpsVacias} fila(s) con CURP vacía.`);
    if (curpsInvalidas) errs.push(`${curpsInvalidas} fila(s) con CURP inválida.`);
    if (nombresVacios)
      errs.push(`${nombresVacios} fila(s) sin nombre completo.`);
    if (duplicados) errs.push(`${duplicados} CURP(s) duplicada(s) en el archivo.`);
    return errs;
  }, [mapeo, filasDatos]);

  const gradosDisponibles = useMemo(() => {
    if (!catalogo) return [];
    return [
      ...new Set(
        catalogo.grupos
          .filter(
            (g) =>
              g.periodoId === periodoId &&
              (g.carreraId ?? null) === (carreraId ?? null) &&
              g.activo,
          )
          .map((g) => g.grado),
      ),
    ].sort();
  }, [catalogo, periodoId, carreraId]);

  const gruposCompatibles = useMemo(() => {
    if (!catalogo) return [];
    return catalogo.grupos.filter(
      (g) =>
        g.periodoId === periodoId &&
        (g.carreraId ?? null) === (carreraId ?? null) &&
        g.grado === grado &&
        g.activo,
    );
  }, [catalogo, periodoId, carreraId, grado]);

  const periodoSeleccionado =
    catalogo?.periodos.find((p) => p.id === periodoId) ?? null;
  const carreraSeleccionada =
    catalogo?.carreras.find((c) => (c.id ?? null) === (carreraId ?? null)) ?? null;
  const grupoSeleccionado =
    catalogo?.grupos.find((g) => g.id === grupoId) ?? null;

  function construirFormData(): FormData | null {
    if (!archivo || !mapeo || !periodoSeleccionado || !grupoSeleccionado)
      return null;
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("mapeo", JSON.stringify(mapeo));
    fd.set("periodoNombre", periodoSeleccionado.nombre);
    fd.set("grado", grupoSeleccionado.grado);
    fd.set("grupo", grupoSeleccionado.nombre);
    if (carreraSeleccionada && carreraSeleccionada.id !== null) {
      fd.set("carrera", carreraSeleccionada.clave);
    }
    return fd;
  }

  async function onPrevisualizar() {
    if (!mapeo || mapeo.curp < 0) {
      setMensaje("Asigna la columna CURP antes de previsualizar.");
      return;
    }
    const fd = construirFormData();
    if (!fd) {
      setMensaje(
        "Selecciona periodo, carrera, grado y grupo antes de previsualizar.",
      );
      return;
    }
    setCargandoPreview(true);
    setPreviewServer(null);
    setResultado(null);
    setConfirmado(false);
    const res = await actionPrevisualizarCargaAcademica(fd);
    setCargandoPreview(false);
    setPreviewServer(res);
  }

  async function onAplicar() {
    if (!confirmado || !previewServer?.ok || previewServer.bloqueaEscritura)
      return;
    const fd = construirFormData();
    if (!fd) return;
    setAplicando(true);
    setResultado(null);
    const res = await actionAplicarCargaAcademica(fd);
    setAplicando(false);
    setResultado(res);
    setConfirmado(false);
    setPreviewServer(null);
  }

  return (
    <div className="mt-6 w-full rounded-[1.5rem] border border-white/45 bg-slate-500/20 p-5 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">
        Reconocimiento académico de alumnos (C4.19)
      </h2>
      <p className="mt-1 text-xs font-semibold text-slate-600">
        Importa alumnos desde Excel y asígnalos al periodo, carrera, grado y
        grupo correspondiente. Reutiliza la carga académica existente (C3);
        la identidad del alumno es siempre su CURP.
      </p>

      {catalogoError && (
        <p className="mt-3 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-800">
          {catalogoError}
        </p>
      )}
      {mensaje && (
        <p className="mt-3 rounded-xl bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-900">
          {mensaje}
        </p>
      )}

      {/* PASO 1 — Seleccionar Excel */}
      <div className="mt-4 rounded-2xl border border-white/55 bg-white/50 p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
          Paso 1 — Seleccionar Excel
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (f) void onArchivo(f);
            }}
            aria-label="Seleccionar archivo Excel de reconocimiento"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-full border border-sky-700/40 bg-white/80 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-900 transition hover:bg-white"
          >
            Seleccionar archivo Excel
          </button>
          {archivo && (
            <span className="text-xs font-semibold text-slate-600">
              {archivo.name} · {filasDatos.length} fila(s) ·{" "}
              {encabezados.length} columna(s)
            </span>
          )}
        </div>
      </div>

      {/* PASO 2 — Identificar columnas */}
      {encabezados.length > 0 && mapeo && (
        <div className="mt-3 rounded-2xl border border-white/55 bg-white/50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
            Paso 2 — Identificar columnas
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CAMPOS_SELECTOR.map(({ campo, etiqueta, obligatorio }) => (
              <label
                key={campo}
                className="flex flex-col gap-1 rounded-xl border border-white/60 bg-white/60 p-2"
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                  {etiqueta}
                  {obligatorio && <span className="text-red-600"> *</span>}
                </span>
                <select
                  value={mapeo[campo]}
                  onChange={(e) =>
                    onCambiarCampo(campo, Number(e.target.value))
                  }
                  className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value={-1}>— No usar —</option>
                  {encabezados.map((enc, i) => (
                    <option key={i} value={i}>
                      {enc}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {mapeo.curp < 0 && (
            <p className="mt-2 text-xs font-bold text-red-700">
              La columna CURP es obligatoria.
            </p>
          )}
        </div>
      )}

      {/* PASO 3 — Vista previa (10 filas) */}
      {filasDatos.length > 0 && (
        <div className="mt-3 rounded-2xl border border-white/55 bg-white/50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
            Paso 3 — Vista previa (primeras 10 filas)
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/60 text-[10px] uppercase text-slate-500">
                  <th className="py-1 pr-3 font-extrabold">CURP</th>
                  <th className="py-1 font-extrabold">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {filasPreview.map((f, i) => (
                  <tr key={i} className="border-b border-white/40">
                    <td className="py-1 pr-3 font-semibold text-slate-800">
                      {f.curp || "—"}
                    </td>
                    <td className="py-1 font-semibold text-slate-700">
                      {f.nombre || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {erroresLocal.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs font-bold text-red-700">
              {erroresLocal.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-bold text-emerald-700">
              Sin errores de formato.
            </p>
          )}
        </div>
      )}

      {/* PASO 4 — Contexto académico */}
      {cargandoCatalogo ? (
        <p className="mt-3 text-xs font-semibold text-slate-600">
          Cargando catálogo…
        </p>
      ) : (
        catalogo && (
          <div className="mt-3 rounded-2xl border border-white/55 bg-white/50 p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
              Paso 4 — Contexto académico (grupos del catálogo)
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 rounded-xl border border-white/60 bg-white/60 p-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                  Periodo *
                </span>
                <select
                  value={periodoId}
                  onChange={(e) => {
                    setPeriodoId(e.target.value);
                    setGrado("");
                    setGrupoId("");
                  }}
                  className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="">— Seleccionar —</option>
                  {catalogo.periodos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 rounded-xl border border-white/60 bg-white/60 p-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                  Carrera *
                </span>
                <select
                  value={carreraId ?? ""}
                  onChange={(e) => {
                    setCarreraId(e.target.value === "" ? null : e.target.value);
                    setGrado("");
                    setGrupoId("");
                  }}
                  className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="">— Seleccionar —</option>
                  {catalogo.carreras.map((c) => (
                    <option key={c.id ?? "sin"} value={c.id ?? ""}>
                      {c.clave}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 rounded-xl border border-white/60 bg-white/60 p-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                  Grado / semestre *
                </span>
                <select
                  value={grado}
                  onChange={(e) => {
                    setGrado(e.target.value);
                    setGrupoId("");
                  }}
                  className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="">— Seleccionar —</option>
                  {gradosDisponibles.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 rounded-xl border border-white/60 bg-white/60 p-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                  Grupo *
                </span>
                <select
                  value={grupoId}
                  onChange={(e) => setGrupoId(e.target.value)}
                  className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="">— Seleccionar —</option>
                  {gruposCompatibles.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.grado} {g.nombre}
                      {carreraSeleccionada && carreraSeleccionada.id !== null
                        ? ` ${carreraSeleccionada.clave}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {grupoSeleccionado && periodoSeleccionado && (
              <p className="mt-2 text-xs font-bold text-slate-700">
                Grupo: {grupoSeleccionado.grado} {grupoSeleccionado.nombre} ·
                semestre {grupoSeleccionado.semestre} ·{" "}
                {carreraSeleccionada?.clave ?? "SIN CARRERA"} ·{" "}
                {periodoSeleccionado.nombre}
              </p>
            )}
          </div>
        )
      )}

      {/* PASO 5 — Previsualización server-side + confirmación */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onPrevisualizar()}
          disabled={cargandoPreview || !archivo || !grupoSeleccionado}
          className="rounded-full border border-sky-700/40 bg-white/80 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cargandoPreview ? "Previsualizando…" : "Previsualizar carga"}
        </button>
        {cargandoPreview && (
          <span className="text-xs font-semibold text-slate-600">
            Validando contra el catálogo…
          </span>
        )}
      </div>

      {previewServer && !previewServer.ok && (
        <p className="mt-3 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-800">
          {previewServer.error}
        </p>
      )}

      {previewServer?.ok && (
        <div className="mt-3 rounded-2xl border border-white/55 bg-white/50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
            Resumen de la previsualización — periodo{" "}
            {previewServer.periodoUtilizado ?? "—"}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <li>
              Filas: {previewServer.alumnos.totalFilas} · CURP válidas:{" "}
              {previewServer.alumnos.curpsValidas} · vacías:{" "}
              {previewServer.alumnos.curpsAusentes} · duplicadas:{" "}
              {previewServer.alumnos.curpsDuplicadas}
            </li>
            <li>
              Alumnos nuevos: {previewServer.alumnos.alumnosNuevos} ·
              existentes: {previewServer.alumnos.alumnosExistentes} · sin
              cambios: {previewServer.alumnos.alumnosSinCambios}
            </li>
            <li>
              Inscripciones nuevas: {previewServer.academico.nuevasInscripciones}{" "}
              · sin cambio: {previewServer.academico.sinCambio} · cambios de
              grupo: {previewServer.academico.cambiosDeGrupo} · sin datos
              académicos: {previewServer.academico.sinDatosAcademicos}
            </li>
            <li>
              Grupos inexistentes: {previewServer.academico.gruposInexistentes}{" "}
              · ambiguos: {previewServer.academico.ambiguos} · conflictos:{" "}
              {previewServer.academico.conflictosAcademicos}
            </li>
          </ul>
          {previewServer.bloqueaEscritura ? (
            <p className="mt-2 text-xs font-bold text-red-700">
              La carga tiene bloqueos (inexistentes / ambiguos / conflictos). No
              se aplicará nada. Revisa los datos.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                  className="mt-0.5"
                />
                Esta operación actualizará las inscripciones académicas de los
                alumnos seleccionados.
              </label>
              <button
                type="button"
                onClick={() => void onAplicar()}
                disabled={aplicando || !confirmado}
                className="w-fit rounded-full border border-emerald-600/50 bg-linear-to-b from-emerald-400 via-emerald-500 to-emerald-600 px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aplicando
                  ? "Aplicando…"
                  : "Confirmar reconocimiento académico"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="mt-3 rounded-2xl border border-white/55 bg-white/50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
            Resultado
          </p>
          {resultado.ok ? (
            <ul className="mt-2 flex flex-col gap-1 text-xs font-semibold text-emerald-800">
              <li>
                Alumnos agregados: {resultado.alumnos.agregados} · completados:{" "}
                {resultado.alumnos.completados} · omitidos:{" "}
                {resultado.alumnos.omitidos}
              </li>
              <li>
                Inscripciones nuevas: {resultado.inscripciones.nuevas} · cambios
                de grupo: {resultado.inscripciones.cambiosDeGrupo} · errores:{" "}
                {resultado.inscripciones.errores}
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-xs font-bold text-red-700">
              {resultado.error}
            </p>
          )}
          {resultado.ok && grupoSeleccionado && periodoSeleccionado && (
            <p className="mt-2 text-xs font-bold text-slate-700">
              Grupo: {grupoSeleccionado.grado} {grupoSeleccionado.nombre} ·
              Periodo: {periodoSeleccionado.nombre}
            </p>
          )}
        </div>
      )}
    </div>
  );
}



