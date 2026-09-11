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
import { actionObtenerVistaMateria } from "@/app/actions/escolar";
import { actionObtenerMapeoColumnasMateria } from "@/app/actions/materias";
import { AsistenciaTabularAlumno } from "./asistencia-tabular-alumno";
import { NotificacionesAlumno } from "./notificaciones-alumno";
import { CalendarioAsistenciaAlumno } from "@/app/components/calendario-asistencia-alumno";
import { EtiquetasDinamicasPanel } from "@/app/components/etiquetas-dinamicas-panel";
import { HorarioAlumnoResumen } from "@/app/components/horario-alumno-resumen";
import { MateriaCalificacionesAlumno } from "@/app/components/materia-calificaciones-alumno";
import { MateriaSelector } from "@/app/components/materia-selector";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import {
  camposDeGrupo,
  type GrupoCampoPersonal,
} from "@/lib/escolar/alumno/grupos-campos-personales";
import { informacionPersonalDesdeEtiquetas } from "@/lib/escolar/alumno/informacion-personal";
import type { PiezaAlumno } from "@/lib/navegacion/contenido-alumno";
import type { AlumnoEtiquetaRow } from "@/lib/escolar/alumno/etiquetas-dinamicas";
import type { VistaRegistroAlumno } from "@/lib/escolar/alumno/registro-alumno";
import type { MateriaConNombreVisible } from "@/lib/escolar/materia/nombres-visibles";
import type { ComentarioRow, EtiquetasPersonalesRow, MateriaTablaVista } from "@/lib/escolar/types";

/** Rótulos de las sub-vistas de «Calendario › Asistencia»: los manda el mapa
 *  de navegación (`apartado("alumno","calendario","asistencia").modos`). */
const MODO_DATOS_CRUDOS = "Datos crudos";

/** Datos que ya resolvió `actionObtenerPerfilAlumno` (la misma de /perfil). */
export type DatosAlumnoOceano = {
  curp: string;
  nombre: string;
  materias: readonly MateriaConNombreVisible[];
  registro: VistaRegistroAlumno;
  etiquetas: EtiquetasPersonalesRow | null;
  comentarios: readonly ComentarioRow[];
  etiquetasDinamicas: AlumnoEtiquetaRow[];
  puedeEditarEtiquetas: boolean;
  puedeImportarEtiquetas: boolean;
};

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
 * Campos ESTRUCTURADOS de ETIQUETAS PERSONALES de un grupo (Fase 3, punto A).
 * Qué campo es médico lo decide `lib/escolar/alumno/grupos-campos-personales.ts`;
 * aquí NO hay ninguna condición de dominio, solo el render. Las etiquetas
 * amigables salen de `informacion-personal.ts`, la fuente que ya existía.
 */
function CamposDeGrupo({
  etiquetas,
  grupo,
}: {
  etiquetas: EtiquetasPersonalesRow | null;
  grupo: GrupoCampoPersonal;
}) {
  const porClave = new Map(
    informacionPersonalDesdeEtiquetas(etiquetas).map((c) => [String(c.clave), c]),
  );
  const campos = camposDeGrupo(grupo)
    .map((clave) => porClave.get(clave))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {campos.map((c) => (
        <li
          key={String(c.clave)}
          className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
            {c.etiqueta}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--oc-text)]">{c.valor}</p>
        </li>
      ))}
    </ul>
  );
}

export function ContenidoAlumnoOceano({
  pieza,
  modo = null,
  datos,
}: {
  pieza: PiezaAlumno;
  /** Modo activo del apartado (barra de modo). Solo lo usa la sub-vista doble. */
  modo?: string | null;
  datos: DatosAlumnoOceano;
}) {
  const { curp, nombre, materias, registro, etiquetas, comentarios, etiquetasDinamicas } = datos;

  // Estado de la pieza Materias (idéntico al de perfil-client.tsx: la selección
  // y la vista de la materia se piden al cambiar de materia).
  const [materiaSeleccionada, setMateriaSeleccionada] = useState("");
  const [vistaMateria, setVistaMateria] = useState<MateriaTablaVista | null>(null);
  const [pesosMateria, setPesosMateria] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (pieza !== "materias-calificacion") return;
    const primera = materias[0]?.idInterno ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMateriaSeleccionada((prev) =>
      prev && materias.some((m) => m.idInterno === prev) ? prev : primera,
    );
  }, [pieza, materias]);

  useEffect(() => {
    if (pieza !== "materias-calificacion" || !materiaSeleccionada) return;
    let activo = true;
    void actionObtenerVistaMateria(materiaSeleccionada).then((v) => {
      if (activo) setVistaMateria(v);
    });
    void actionObtenerMapeoColumnasMateria(materiaSeleccionada).then((m) => {
      if (activo) setPesosMateria(m?.pesosActividades ?? null);
    });
    return () => {
      activo = false;
    };
  }, [pieza, materiaSeleccionada]);

  const nombreVisibleSeleccionada =
    materias.find((m) => m.idInterno === materiaSeleccionada)?.nombreVisible ??
    materiaSeleccionada;

  if (pieza === "materias-calificacion") {
    if (materias.length === 0) {
      return (
        <Tira>
          <Aviso>
            No hay materias cargadas para tu grado, grupo y carrera.
          </Aviso>
        </Tira>
      );
    }
    return (
      <div className="flex flex-col gap-4 lg:flex-row">
        <MateriaSelector
          materias={materias}
          seleccionada={materiaSeleccionada}
          onSeleccionar={setMateriaSeleccionada}
          iniciarColapsado={materias.length > 30}
          className="lg:w-80 lg:shrink-0"
        />
        <div className="flex min-h-[220px] flex-1 flex-col rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-6 sm:min-h-[280px]">
          <MateriaCalificacionesAlumno
            vista={vistaMateria}
            materiaNombre={nombreVisibleSeleccionada}
            pesosActividades={pesosMateria}
          />
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
        <CalendarioAsistenciaAlumno curp={curp} nombreAlumno={nombre} />
      </Tira>
    );
  }

  if (pieza === "perfil-informacion-personal") {
    return (
      <div className="flex flex-col gap-4">
        <Tira>
          <CamposDeGrupo etiquetas={etiquetas} grupo="personal" />
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
        <CamposDeGrupo etiquetas={etiquetas} grupo="medico" />
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

  // Sus dos sub-vistas son EXCLUYENTES y comparten la misma acción de lectura.
  if (pieza === "asistencia-subvistas") {
    return modo === MODO_DATOS_CRUDOS ? (
      <AsistenciaTabularAlumno curp={curp} nombreAlumno={nombre} />
    ) : (
      <Tira>
        <CalendarioAsistenciaAlumno curp={curp} nombreAlumno={nombre} />
      </Tira>
    );
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
