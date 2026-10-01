"use client";

/**
 * contenido-alumno-oceano.tsx — las PIEZAS REALES del alumno montadas en el
 * shell Océano (Fase 2). Es un envoltorio: NO reimplementa ningún componente,
 * los monta con **los mismos props y las mismas Server Actions** que la ruta
 * viva `/perfil` (que permanece en pie, R8).
 *
 * Qué pieza va en cada hueco lo decide `lib/navegacion/contenido-alumno.ts`; el
 * shell solo pregunta por el hueco activo. Aquí se conserva el cableado de
 * estado que la pieza ya necesitaba (materia seleccionada, vista y pesos),
 * copiado de `perfil-client.tsx` **sin cambiar acciones ni contratos**.
 *
 * Sin consultas nuevas: son las acciones que ya usaba `/perfil`. Los efectos
 * están guardados por pieza para no disparar una consulta en un hueco que no la
 * necesita (regla de rendimiento del prompt).
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { actionVistaCalificacionesAlumno } from "@/app/actions/calificaciones-normalizadas";
import type { VistaCalificacionesAlumno } from "@/app/actions/calificaciones-normalizadas";
import { actionGuardarCamposPersonales } from "@/app/actions/etiquetas-dinamicas";
import { MensajesTutorPanel } from "@/app/components/mensajes-tutor-panel";
import { NumeroControlAlumno } from "./numero-control-alumno";
import { AsistenciaTabularAlumno } from "./asistencia-tabular-alumno";
import { NotificacionesAlumno } from "./notificaciones-alumno";
import { CalendarioAsistenciaAlumno } from "@/app/components/calendario-asistencia-alumno";
import { EtiquetasDinamicasPanel } from "@/app/components/etiquetas-dinamicas-panel";
import { HorarioAlumnoResumen } from "@/app/components/horario-alumno-resumen";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import { camposDeGrupo, type GrupoCampoPersonal } from "@/lib/escolar/alumno/grupos-campos-personales";
import { comentarioPersonalDesdeFila, type CampoPersonalPrimario } from "@/lib/escolar/alumno/etiquetas";
import { informacionPersonalDesdeEtiquetas } from "@/lib/escolar/alumno/informacion-personal";
import type { PiezaAlumno } from "@/lib/navegacion/contenido-alumno";
import type { AlumnoEtiquetaRow } from "@/lib/escolar/alumno/etiquetas-dinamicas";
import type { VistaRegistroAlumno } from "@/lib/escolar/alumno/registro-alumno";
import { DocumentosPanel } from "@/app/components/documentos-panel";
import { ActividadesPanel } from "@/app/components/actividades-panel";
import { SesionesProgramadasPanel } from "@/app/components/sesiones-programadas-panel";
import { SolicitudesConstanciaPanel } from "@/app/components/solicitudes-constancia-panel";
import type { MateriaConNombreVisible } from "@/lib/escolar/materia/nombres-visibles";
import type { ComentarioRow, EtiquetasPersonalesRow } from "@/lib/escolar/types";


/** Datos que ya resolvió `actionObtenerPerfilAlumno` (la misma de /perfil). */
export type DatosAlumnoOceano = {
  curp: string;
  nombre: string;
  /** Fase 3.1 — identidad del propio alumno (CLAVE de ALUMNOS). */
  clave: string;
  /** Fase 3.1 — foto de perfil ya resuelta (Cloudinary). */
  fotoPerfilUrl: string | null;
  materias: readonly MateriaConNombreVisible[];
  registro: VistaRegistroAlumno;
  etiquetas: EtiquetasPersonalesRow | null;
  comentarios: readonly ComentarioRow[];
  etiquetasDinamicas: AlumnoEtiquetaRow[];
  /** Fase 3.1 — contacto del tutor principal (o null si no hay vínculo). */
  tutorContacto: {
    nombre: string;
    telefono: string | null;
    correo: string | null;
  } | null;
  puedeEditarEtiquetas: boolean;
  puedeImportarEtiquetas: boolean;
  /** Fase 4 — el TUTOR puede editar los campos personales; el alumno no. El
   *  flag lo resuelve la action (`resolverAccesoAlumno`), no la UI. */
  puedeEditarDatosPersonales: boolean;
  /** 2026-09-24 — número de control (matrícula). Lo ve quien ve la ficha; lo edita
   *  quien tenga `alumno.editar_numero_control`, resuelto en el servidor. */
  numeroControl: string | null;
  puedeEditarNumeroControl: boolean;
  /** UIs pendientes (2026-09-17) — Materias › Actividades.
   *  Los dos flags los resuelve el SERVIDOR con `puede()`; el componente no
   *  pregunta por el rol. Y la materia elegida viaja aquí porque el apartado
   *  «Actividades» cuelga de la materia que el alumno tenga abierta. */
  materiaSeleccionada?: string | null;
  materiaSeleccionadaNombre?: string | null;
  puedeEditarActividades: boolean;
  puedeEntregarActividades: boolean;
};

/**
 * Foto de perfil (Fase 3.1). Presentación pura: si no hay URL —o la imagen no
 * carga— se muestra un marcador explícito, nunca un hueco mudo. El alumno no
 * puede subirla (`puedeSubirFoto` es false para él), así que esto es solo lectura.
 */
function FotoAlumno({ url, nombre }: { url: string | null; nombre: string }) {
  const [rota, setRota] = useState(false);
  if (!url || rota) {
    return (
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)]">
        <span className="text-center text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          Sin foto
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Foto de ${nombre}`}
      width={192}
      height={192}
      onError={() => setRota(true)}
      className="h-24 w-24 shrink-0 rounded-2xl border border-[var(--oc-border)] object-cover"
    />
  );
}

function DatoIdentidad({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
        {etiqueta}
      </p>
      <p className="truncate text-sm font-semibold text-[var(--oc-text)]">{valor || "—"}</p>
    </div>
  );
}

function Tira({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6">
      {children}
    </div>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="text-center text-xs font-semibold text-[var(--oc-muted)]">{children}</p>
  );
}

/**
 * Un grupo de notas (actividades, parciales, resultado) en la forma de lista
 * que ya usaba la pieza. `clave` es el encabezado del Excel; `valor` null es
 * «no hay nota» y se pinta «—», nunca `0` (que es «sacó cero»).
 */
function listaNotas({
  titulo,
  items,
}: {
  titulo: string;
  items: { clave: string | null; valor: number | null }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-3xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3 sm:p-4">
      <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
        {titulo}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li
            key={`${it.clave ?? "sin-clave"}-${i}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-3 py-2"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
              {it.clave ?? "—"}
            </span>
            <span className="text-sm font-extrabold text-[var(--oc-text)]">
              {it.valor ?? "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Campos ESTRUCTURADOS de ETIQUETAS PERSONALES de un grupo (Fase 3, punto A).
 * Qué campo es médico lo decide `lib/escolar/alumno/grupos-campos-personales.ts`;
 * aquí NO hay ninguna condición de dominio, solo el render. Las etiquetas
 * amigables salen de `informacion-personal.ts`, la fuente que ya existía.
 */
function CamposDeGrupo({
  etiquetas,
  grupo,
  curp,
  puedeEditar,
}: {
  etiquetas: EtiquetasPersonalesRow | null;
  grupo: GrupoCampoPersonal;
  curp: string;
  /** Flag del servidor: el tutor sí, el alumno no. */
  puedeEditar: boolean;
}) {
  const porClave = new Map(
    informacionPersonalDesdeEtiquetas(etiquetas).map((c) => [String(c.clave), c]),
  );
  const campos = camposDeGrupo(grupo).map((clave) => {
    const c = porClave.get(clave);
    return { clave, etiqueta: c?.etiqueta ?? clave, valor: c?.valor ?? "—" };
  });

  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [valores, setValores] = useState<Partial<Record<CampoPersonalPrimario, string>>>({});

  function abrir() {
    const inicial: Partial<Record<CampoPersonalPrimario, string>> = {};
    for (const c of campos) inicial[c.clave] = c.valor === "—" ? "" : c.valor;
    setValores(inicial);
    setMensaje(null);
    setEditando(true);
  }

  async function guardar() {
    setGuardando(true);
    // El guardado envía SOLO las claves de este grupo: `patchCamposPersonales`
    // aplica las presentes y no toca las demás (por eso los dos apartados
    // pueden editar su mitad sin pisarse).
    const r = await actionGuardarCamposPersonales(curp, valores);
    setGuardando(false);
    if (r.ok) {
      setMensaje("Datos guardados.");
      setEditando(false);
    } else {
      setMensaje(r.error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {mensaje ? (
            <span className="text-[10px] font-semibold text-[var(--oc-muted)]">{mensaje}</span>
          ) : (
            <span />
          )}
          {editando ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardar()}
                className="rounded-full bg-[var(--oc-mint)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-mint-ink)] disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  setEditando(false);
                  setMensaje(null);
                }}
                className="rounded-full border border-[var(--oc-border)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={abrir}
              className="rounded-full border border-[var(--oc-border)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]"
            >
              Editar
            </button>
          )}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {campos.map((c) => (
          <li
            key={String(c.clave)}
            className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
          >
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
              {c.etiqueta}
            </p>
            {editando ? (
              <input
                type="text"
                value={valores[c.clave] ?? ""}
                onChange={(e) =>
                  setValores((prev) => ({ ...prev, [c.clave]: e.target.value }))
                }
                className="mt-0.5 w-full rounded-lg border border-[var(--oc-border)] bg-[var(--oc-surface)] px-2 py-1 text-sm font-semibold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
              />
            ) : (
              <p className="mt-0.5 text-sm font-semibold text-[var(--oc-text)]">{c.valor}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContenidoAlumnoOceano({
  pieza,
  modo = null,
  permitirJustificacion = false,
  datos,
}: {
  pieza: PiezaAlumno;
  /** Modo activo del apartado (barra de modo). Solo lo usa la sub-vista doble. */
  modo?: string | null;
  /** Fase 4 — opción del HUECO (no del rol): el calendario permite justificar. */
  permitirJustificacion?: boolean;
  datos: DatosAlumnoOceano;
}) {
  const { curp, nombre, materias, registro, etiquetas, comentarios, etiquetasDinamicas } = datos;

  // Estado de la pieza Materias: la lista sale del modelo nuevo (una materia =
  // un `grupoMateriaId`), y las notas de la materia elegida se piden al cambiar.
  const [vistaAlumno, setVistaAlumno] = useState<VistaCalificacionesAlumno | null>(null);
  const [materiaActiva, setMateriaActiva] = useState("");
  const [notasMateria, setNotasMateria] = useState<VistaCalificacionesAlumno | null>(null);

  useEffect(() => {
    if (pieza !== "materias-calificacion") return;
    let activo = true;
    void actionVistaCalificacionesAlumno(curp).then((v) => {
      if (!activo) return;
      setVistaAlumno(v);
      const lista = v?.materias ?? [];
      setMateriaActiva((prev) =>
        prev && lista.some((m) => m.grupoMateriaId === prev)
          ? prev
          : lista[0]?.grupoMateriaId ?? "",
      );
    });
    return () => {
      activo = false;
    };
  }, [pieza, curp]);

  useEffect(() => {
    if (pieza !== "materias-calificacion" || !materiaActiva) return;
    let activo = true;
    void actionVistaCalificacionesAlumno(curp, materiaActiva).then((v) => {
      if (activo) setNotasMateria(v);
    });
    return () => {
      activo = false;
    };
  }, [pieza, curp, materiaActiva]);

  // ENCENDIDAS el 2026-09-17. Antes eran maqueta (actividades) y apagado
  // (sesiones programadas).
  if (pieza === "materias-actividades") {
    // `puedeEditar` y `puedeEntregar` llegan RESUELTOS del servidor con la
    // misma `puede()` de la matriz: este componente no pregunta por el rol.
    return (
      <ActividadesPanel
        materiaInterna={datos.materiaSeleccionada ?? ""}
        nombreVisible={datos.materiaSeleccionadaNombre ?? "Actividades"}
        puedeEditar={datos.puedeEditarActividades}
        puedeEntregar={datos.puedeEntregarActividades}
      />
    );
  }

  if (pieza === "materias-recursos") {
    return <DocumentosPanel materiaInterna={datos.materiaSeleccionada ?? undefined} />;
  }

  if (pieza === "perfil-sesiones-programadas") {
    return <SesionesProgramadasPanel curpAlumno={curp} />;
  }

  if (pieza === "perfil-constancias") {
    return <SolicitudesConstanciaPanel curpAlumno={curp} />;
  }

  if (pieza === "materias-calificacion") {
    const lista = vistaAlumno?.materias ?? [];
    if (lista.length === 0) {
      return (
        <Tira>
          <Aviso>
            No hay materias cargadas para tu grado, grupo y carrera.
          </Aviso>
        </Tira>
      );
    }

    const materiaActual = lista.find((m) => m.grupoMateriaId === materiaActiva) ?? lista[0];
    const notas = notasMateria;
    const actividades = notas?.actividades ?? [];
    const parciales = notas?.parciales ?? [];
    const resultado: { clave: string | null; valor: number | null }[] = [
      ...(notas?.promedio != null ? [{ clave: "Promedio", valor: notas.promedio }] : []),
      ...(notas?.final != null ? [{ clave: "Final", valor: notas.final }] : []),
    ];
    const hayNotas =
      actividades.length > 0 ||
      parciales.length > 0 ||
      resultado.length > 0 ||
      notas?.promedioActividades != null;

    return (
      <div className="flex flex-col gap-4 lg:flex-row">
        <ul className="flex flex-col gap-1.5 lg:w-80 lg:shrink-0">
          {lista.map((m) => {
            const activa = m.grupoMateriaId === materiaActual.grupoMateriaId;
            const facetas = [m.grado, m.grupo].filter(Boolean).join(" · ");
            return (
              <li key={m.grupoMateriaId}>
                <button
                  type="button"
                  onClick={() => setMateriaActiva(m.grupoMateriaId)}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border bg-[var(--oc-input)] px-3 py-2 text-left transition-colors ${
                    activa
                      ? "border-[var(--oc-border-active)]"
                      : "border-[var(--oc-border)] hover:border-[var(--oc-border-active)]"
                  }`}
                >
                  <span className="text-sm font-semibold text-[var(--oc-text)]">
                    {m.nombreVisible ?? m.nombre}
                  </span>
                  {facetas && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
                      {facetas}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex min-h-[220px] flex-1 flex-col rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-6 sm:min-h-[280px]">
          <p className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
            {materiaActual.nombreVisible ?? materiaActual.nombre}
          </p>
          {hayNotas ? (
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {listaNotas({ titulo: "Actividades", items: actividades })}
              {listaNotas({ titulo: "Evaluaciones", items: parciales })}
              {listaNotas({ titulo: "Resultado", items: resultado })}
              {notas?.promedioActividades != null && (
                <div className="sm:col-span-2">
                  <div className="rounded-3xl border border-[var(--oc-border-active)] bg-[var(--oc-input)] p-3 sm:p-4">
                    <p className="mb-1 text-center text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
                      Promedio calculado
                    </p>
                    <p className="text-center text-2xl font-extrabold text-[var(--oc-text)]">
                      {notas?.promedioActividades}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="w-full text-center text-sm font-semibold text-[var(--oc-muted)]">
              Tu profesor aún no ha subido calificaciones de esta materia.
            </p>
          )}
        </div>
      </div>
    );
  }


  if (pieza === "calendario-horario") {
    return (
      <Tira>
        <HorarioAlumnoResumen curp={curp} />
      </Tira>
    );
  }

  if (pieza === "calendario-asistencia") {
    return (
      <Tira>
        <CalendarioAsistenciaAlumno
          curp={curp}
          nombreAlumno={nombre}
          permitirJustificacion={permitirJustificacion}
        />
      </Tira>
    );
  }

  if (pieza === "perfil-informacion-personal") {
    return (
      <div className="flex flex-col gap-4">
        {/* Fase 3.1 — foto e identidad del propio alumno (CLAVE y CURP). Son
            lecturas de lo que la action ya devolvía a /perfil. */}
        <Tira>
          <div className="flex flex-wrap items-center gap-4">
            <FotoAlumno url={datos.fotoPerfilUrl} nombre={nombre} />
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DatoIdentidad etiqueta="Nombre" valor={nombre} />
              <DatoIdentidad etiqueta="Clave" valor={datos.clave} />
              <DatoIdentidad etiqueta="CURP" valor={curp} />
              <NumeroControlAlumno
                key={curp}
                curp={curp}
                valor={datos.numeroControl}
                puedeEditar={datos.puedeEditarNumeroControl}
              />
            </div>
          </div>
        </Tira>

        <Tira>
          <CamposDeGrupo
            etiquetas={etiquetas}
            grupo="personal"
            curp={curp}
            puedeEditar={datos.puedeEditarDatosPersonales}
          />
        </Tira>

        {/* Fase 3.1 — contacto del tutor. Si no hay vínculo se dice con una
            frase; no se deja el bloque mudo. */}
        <Tira>
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
            Tutor
          </p>
          {datos.tutorContacto ? (
            <div className="flex flex-col gap-2">
              <DatoIdentidad etiqueta="Nombre" valor={datos.tutorContacto.nombre} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DatoIdentidad
                  etiqueta="Teléfono"
                  valor={datos.tutorContacto.telefono ?? ""}
                />
                <DatoIdentidad etiqueta="Correo" valor={datos.tutorContacto.correo ?? ""} />
              </div>
            </div>
          ) : (
            <Aviso>Sin tutor vinculado.</Aviso>
          )}
        </Tira>

        {/* Fase 3.1 — comentario personal del alumno, solo lectura. */}
        <Tira>
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
            Comentario personal
          </p>
          <textarea
            readOnly
            rows={3}
            value={comentarioPersonalDesdeFila(etiquetas)}
            className="w-full resize-none rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm font-semibold text-[var(--oc-text)]"
          />
        </Tira>

        <Tira>
          <EtiquetasDinamicasPanel
            curp={curp}
            iniciales={etiquetasDinamicas}
            puedeEditar={datos.puedeEditarEtiquetas}
            puedeImportar={datos.puedeImportarEtiquetas}
          />
        </Tira>
      </div>
    );
  }

  if (pieza === "perfil-seguimiento-medico") {
    return (
      <Tira>
        <CamposDeGrupo
          etiquetas={etiquetas}
          grupo="medico"
          curp={curp}
          puedeEditar={datos.puedeEditarDatosPersonales}
        />
      </Tira>
    );
  }

  // Solo lectura, sobre el array `materias` que ya viene cargado: sin consulta
  // nueva y sin interacción.
  if (pieza === "perfil-seguimiento-semestral") {
    return (
      <Tira>
        {materias.length === 0 ? (
          <Aviso>No hay materias cargadas para tu grado, grupo y carrera.</Aviso>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {materias.map((m) => {
              const facetas = [m.grado, m.grupo, m.carrera].filter(Boolean).join(" · ");
              return (
                <li
                  key={m.idInterno}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
                >
                  <span className="text-sm font-semibold text-[var(--oc-text)]">
                    {m.nombreVisible}
                  </span>
                  {facetas && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
                      {facetas}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tira>
    );
  }

  if (pieza === "perfil-notificaciones") {
    return <NotificacionesAlumno curp={curp} comentarios={comentarios} modo={modo} />;
  }

  // Fase 3.1 — este apartado ya NO tiene sub-vistas: es la tabla de datos
  // crudos. El calendario visual se monta, único, en «Calendario escolar».
  if (pieza === "asistencia-tabular") {
    return <AsistenciaTabularAlumno curp={curp} nombreAlumno={nombre} />;
  }

  // Fase 9 — la bandeja del tutor. NO recibe `curp`: es lo único de esta
  // pestaña que no depende del alumno seleccionado, porque los mensajes van
  // dirigidos al tutor y cruzan a todos sus vinculados.
  if (pieza === "perfil-mensajes-tutor") {
    return <MensajesTutorPanel />;
  }

  // perfil-registro-calificaciones: lo que hoy sirven «Estatus» y «Boleta»
  // (el mismo `MateriaTablaVistaPanel` con la fila del alumno destacada).
  const tieneGrupo = Boolean(registro.grado || registro.grupo || registro.carrera);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-4 text-center">
        <p className="text-sm font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
          Registro de calificaciones
        </p>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          {nombre}
          {registro.nombreTabla ? ` · ${registro.nombreTabla}` : ""}
        </p>
        {tieneGrupo && (
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
            {registro.grado} · Grupo {registro.grupo}
            {registro.carrera ? ` · ${registro.carrera}` : ""}
          </p>
        )}
      </div>

      {!tieneGrupo ? (
        <Aviso>
          Sin inscripción activa en el catálogo. El registro aparecerá cuando el
          directivo registre grado, grupo y carrera.
        </Aviso>
      ) : (
        <Tira>
          {registro.mensaje && (
            <p className="mb-2 text-center text-xs font-semibold text-[var(--oc-alert-text)]">
              {registro.mensaje}
            </p>
          )}
          <MateriaTablaVistaPanel
            vista={
              registro.filas.length
                ? { encabezados: registro.encabezados, filas: registro.filas }
                : null
            }
            materiaNombre={registro.nombreTabla ?? "Registro de calificaciones"}
            filaDestacada={registro.filaAlumnoIndice}
          />
        </Tira>
      )}
    </div>
  );
}
