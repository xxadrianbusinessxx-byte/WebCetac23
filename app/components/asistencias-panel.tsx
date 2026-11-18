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
import { CatalogoMateriasAsistencia } from "@/app/components/asistencias-catalogo";
import { SelectorArchivo } from "@/app/components/ui/selector-archivo";
import type { ResumenAsistencia } from "@/lib/escolar/asistencia/asistencias";


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
      className={`rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function Resumen({ resumen }: { resumen: ResumenAsistencia }) {
  return (
    <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 text-xs font-semibold text-[var(--oc-muted)]">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
        Resumen de la plantilla
      </p>
      {resumen.aviso && (
        <p className="mb-2 rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-3 py-2 text-[11px] font-bold text-[var(--oc-alert-text)]">
          {resumen.aviso}
        </p>
      )}
      <p className="mb-1 text-[10px] font-semibold text-[var(--oc-muted)]">
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
        <div className="mt-3 rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-4 py-2 text-[11px] text-[var(--oc-alert-text)]">
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
        <div className="mt-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] text-[var(--oc-text)]">
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
        <ul className="mt-2 max-h-28 list-inside list-disc overflow-auto text-[11px] text-[var(--oc-alert-text)]">
          {resumen.omitidosDetalle.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {resumen.erroresDetalle.length > 0 && (
        <ul className="mt-2 max-h-28 list-inside list-disc overflow-auto text-[11px] text-[var(--oc-alert-text)]">
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
  mostrarPlantillaMateria = true,
}: {
  /** Nombre visible del profesor de la sesión. Solo presentación: la identidad
   *  real (profesor_id) la resuelve SIEMPRE el servidor. */
  nombreProfesor?: string | null;
  /** 2026-11-16 — la plantilla de MATERIA (CURP | NOMBRE) es para capturar
   *  CALIFICACIONES, no asistencia: comparte panel por historia, no por
   *  parentesco. El rol Servicio Escolar la oculta porque no califica, y
   *  además no tiene `materia.descargar_plantilla`: dejarla visible sería un
   *  botón que el servidor rechaza. */
  mostrarPlantillaMateria?: boolean;
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

  // Recibe el File ya elegido: limpiar el `input` para que volver a elegir el
  // mismo archivo dispare `change` es trabajo de `SelectorArchivo`, no de aquí.
  // Elegir otro archivo invalida la previsualización anterior: si no se borrara,
  // se podría confirmar el resumen de un archivo con el contenido de otro.
  function onArchivoElegido(f: File) {
    setArchivo(f);
    setPreview(null);
    setMensajeConfirmar(null);
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

  // 2026-11-17 — MISMA forma que subir calificaciones: catálogo a la izquierda,
  // UNA tarjeta a la derecha. Antes esto era una sola columna con siete
  // tarjetas apiladas del mismo borde y el mismo peso: todo pedía la misma
  // atención, así que nada la tenía, y la materia elegida —lo que decide dónde
  // se guarda la plantilla— se perdía entre selectores.
  return (
    <div className="flex flex-col gap-4 lg:flex-row" aria-label="Asistencias por materia">
      <CatalogoMateriasAsistencia
        className="lg:w-80 lg:shrink-0"
        grado={grado}
        grupo={grupo}
        carrera={carrera}
        grados={grados}
        gruposDelGrado={gruposDelGrado}
        carrerasDelGrupo={carrerasDelGrupo}
        onGradoChange={onGradoChange}
        onGrupoChange={onGrupoChange}
        onCarreraChange={onCarreraChange}
        ciclo={ciclo}
        parciales={parciales}
        parcialId={parcialId}
        onParcialChange={onParcialChange}
        materias={materias}
        materiaClave={materiaClave}
        onMateriaChange={onMateriaChange}
        horarioCargado={horarioCargado}
        avisoHorario={avisoHorario}
      />

      <div className="flex min-h-[16rem] flex-1 flex-col gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        {avisoOperativo && (
          <p className="rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-4 py-3 text-xs font-semibold text-[var(--oc-alert-text)]">
            {avisoOperativo}
          </p>
        )}
        {errorGrupos && (
          <p className="rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-4 py-3 text-xs font-semibold text-[var(--oc-alert-text)]">
            {errorGrupos}
          </p>
        )}

        {!materiaSeleccionada ? (
          <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
            Elige una materia del catálogo para descargar su plantilla y subir la
            asistencia. El sistema calcula solo las clases de cada día.
          </p>
        ) : (
          <>
            {/* Cabecera: la materia abierta y el contexto con el que se va a
                guardar, de una ojeada. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                {materiaSeleccionada.nombre}
              </h2>
              <span className="text-[11px] font-semibold text-[var(--oc-muted)]">
                {grado} · grupo {grupo}
                {carrera ? ` · ${carrera}` : " · tronco común"}
                {parcialSeleccionado ? ` · ${parcialSeleccionado.nombre}` : ""}
              </span>
            </div>

            {/* Clases por día: automático del horario oficial. */}
            <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                Clases por día (automático)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DIAS_SEMANA_CORTOS.map((d, i) => (
                  <span
                    key={d}
                    className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]"
                  >
                    {DIAS_LARGO[i]} · {materiaSeleccionada.porDia[d] ?? 0}
                  </span>
                ))}
                <span className="rounded-full border border-[var(--oc-ok)]/50 bg-[var(--oc-ok)]/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
                  Total semana · {materiaSeleccionada.totalSemana}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[var(--oc-muted)]">
                La fila CLASES de la plantilla se llena sola con estas cantidades,
                tomadas de los días de clase del calendario dentro del parcial.
              </p>
            </div>

            {/* 1 · descargar */}
            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <PillButton
                  onClick={() => void onDescargar()}
                  disabled={!seleccionCompleta || descargando}
                >
                  {descargando ? "Generando…" : "Descargar plantilla"}
                </PillButton>
                <span className="text-[11px] font-semibold text-[var(--oc-muted)]">
                  {seleccionCompleta
                    ? "La plantilla ya trae los días de clase del parcial."
                    : "Falta elegir el parcial para generarla."}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {mensajeDescarga && (
                  <p className="text-xs font-semibold text-[var(--oc-text)]" role="status">
                    {mensajeDescarga}
                  </p>
                )}
                {avisoPlantilla && (
                  <p
                    className="text-[11px] font-semibold text-[var(--oc-alert-text)]"
                    role="status"
                  >
                    {avisoPlantilla}
                  </p>
                )}
              </div>
            </div>

            {/* 2 · subir */}
            <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                  Sube la plantilla llena
                </p>
                <span className="text-[11px] font-semibold text-[var(--oc-muted)]">
                  CURP | NOMBRE | fechas · re-subir no duplica
                </span>
              </div>

              {seleccionCompleta ? (
                <>
                  {/* La atribución, dicha una vez y en su sitio. Hasta el commit
                      a1f1546 la subida llamaba a `traspasar_materia_a_profesor` y
                      la materia PASABA a quien subía; ya no. */}
                  <p className="mt-2 text-[11px] font-semibold text-[var(--oc-text)]">
                    Quedará registrado que lo capturó{" "}
                    <span className="font-extrabold">
                      {nombreProfesor?.trim() || "tu perfil"}
                    </span>
                    . Capturar asistencia <span className="font-extrabold">no</span>{" "}
                    te da la materia: su profesor lo asigna el técnico, y subir aquí
                    no se la quita a nadie.
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-[var(--oc-alert-text)]">
                    Verifica que el archivo sea de esta materia y parcial: volver a
                    subir el mismo día sustituye lo que ya hubiera guardado.
                  </p>
                </>
              ) : (
                <p className="mt-2 rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-3 py-2 text-[11px] font-semibold text-[var(--oc-alert-text)]">
                  Antes de subir, elige en el catálogo:{" "}
                  {[
                    !grado && "grado",
                    !grupo && "grupo",
                    !parcialId && "parcial",
                    !materiaClave && "materia",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  .
                </p>
              )}

              {/* MISMA pieza que subir calificaciones (`ui/selector-archivo.tsx`).
                  Antes aquí iba el `<input type="file">` crudo, con el botón que
                  dibuja el sistema operativo. */}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SelectorArchivo
                  accept=".csv,.xlsx,.xls,text/csv"
                  etiqueta="Elegir archivo"
                  etiquetaAccesible="Elegir la plantilla de asistencia llena"
                  disabled={!seleccionCompleta}
                  nombreArchivo={archivo?.name ?? null}
                  ayuda="CSV o Excel · la plantilla que descargaste arriba"
                  onArchivo={onArchivoElegido}
                />
                <PillButton
                  onClick={() => void onPrevisualizar()}
                  disabled={!archivo || !seleccionCompleta}
                >
                  Previsualizar cambios
                </PillButton>
              </div>

              {preview && (
                <div className="mt-3">
                  <Resumen resumen={preview} />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <PillButton
                      onClick={() => void onConfirmar()}
                      disabled={confirmando}
                      className="text-[var(--oc-ok)]"
                    >
                      {confirmando ? "Guardando…" : "Confirmar asistencias"}
                    </PillButton>
                    {mensajeConfirmar && (
                      <p
                        className={`text-xs font-semibold ${
                          mensajeConfirmar.includes("correctamente")
                            ? "text-[var(--oc-ok)]"
                            : "text-[var(--oc-alert-text)]"
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
          </>
        )}

        {/* Plantilla de MATERIA para calificaciones (CURP | NOMBRE). No es
            asistencia: comparte panel por historia. Quien no califica no la ve
            (2026-11-16). */}
        {mostrarPlantillaMateria && (
          <div className="flex flex-col gap-2 border-t border-[var(--oc-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <PillButton
              onClick={() => void onDescargarPlantillaMateria()}
              disabled={!grado || !grupo || descargandoMateria}
            >
              {descargandoMateria
                ? "Generando…"
                : "Descargar plantilla de materia (calificaciones)"}
            </PillButton>
            {mensajeDescargaMateria && (
              <p className="text-xs font-semibold text-[var(--oc-text)]" role="status">
                {mensajeDescargaMateria}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
