"use client";

/**
 * contenido-docente-oceano.tsx — monta las piezas REALES de las pestañas que
 * comparten maestro y directivo en el shell Océano.
 *
 * Traduce el id de pieza que decide `lib/navegacion/contenido-docente.ts` a un
 * componente React. Aquí NO se decide qué hueco lleva qué: eso vive en el
 * módulo puro, y este archivo solo pinta.
 *
 * Los cuatro componentes que monta ya existían y funcionan; esta fase los
 * reubica y no cambia ni una firma. El ALCANCE —qué materias ve un maestro—
 * lo resuelve el servidor (R-4), así que la lista llega ya filtrada y esta
 * pantalla nunca pide «todo el catálogo».
 */
import { useCallback, useEffect, useState } from "react";
import { actionObtenerVistaMateria } from "@/app/actions/escolar";
import { AsistenciasPanel } from "@/app/components/asistencias-panel";
import { BuscadorAlumnoProfesor } from "@/app/components/buscador-alumno-profesor";
import { CalendarioEscolarPanel } from "@/app/components/calendario-escolar-panel";
import { JustificacionesAdmin } from "@/app/components/justificaciones-admin";
import {
  MateriaMapeoColumnas,
  useMateriaMapeo,
} from "@/app/components/materia-mapeo-columnas";
import { MateriaSelector } from "@/app/components/materia-selector";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import { esModoConfiguracion, type PiezaDocente } from "@/lib/navegacion/contenido-docente";
import type { MateriaConNombreVisible } from "@/lib/escolar/materia/nombres-visibles";
import type { MateriaTablaVista } from "@/lib/escolar/types";

/** Datos ya resueltos por el servidor. Ninguno se consulta desde aquí. */
export type DatosDocenteOceano = {
  /** Catálogo YA filtrado por el servidor según R-4. */
  materias: readonly MateriaConNombreVisible[];
  /** Identidad de presentación; la real la resuelve el servidor. */
  profesorClave: string;
  nombreProfesor: string;
  /**
   * ¿Puede resolver justificaciones? Lo decide el SERVIDOR con la misma
   * `puede()` de la matriz, y llega ya resuelto. El componente no pregunta por
   * el rol: si preguntara, habría dos sitios decidiendo permisos.
   *
   * Es una capacidad que solo tiene el directivo (`justificacion.resolver`), y
   * por eso el mismo hueco —Calendario/Asistencias › Asistencias— enseña el
   * buscador a los dos roles y añade el panel de aprobación solo a quien puede
   * aprobar.
   */
  puedeResolverJustificaciones: boolean;
  /** Nombre del ciclo en curso, para que el calendario abra donde toca. Puede
   *  venir vacío si no hay operativo: el panel cae entonces al primero de la
   *  lista, que es lo que ya hacía. */
  cicloOperativo: string;
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
      {children}
    </p>
  );
}

export function ContenidoDocenteOceano({
  pieza,
  modo,
  datos,
}: {
  pieza: PiezaDocente;
  modo: string | null;
  datos: DatosDocenteOceano;
}) {
  const [seleccionada, setSeleccionada] = useState("");
  const [vista, setVista] = useState<MateriaTablaVista | null>(null);
  const [cargando, setCargando] = useState(false);
  const { asistente, abrir, cerrar } = useMateriaMapeo();

  const refrescar = useCallback(async (idInterno: string) => {
    if (!idInterno) {
      setVista(null);
      return;
    }
    setCargando(true);
    // Misma action que usa /profesor. El maestro no pasa curp: el alcance por
    // fila solo aplica al alumno y al tutor.
    const v = await actionObtenerVistaMateria(idInterno);
    setVista(v);
    setCargando(false);
  }, []);

  // Solo el hueco de calificaciones necesita la vista: los demás no disparan
  // ninguna consulta al montarse.
  useEffect(() => {
    if (pieza !== "materia-avance") return;
    void refrescar(seleccionada);
  }, [pieza, seleccionada, refrescar]);

  if (pieza === "asistencia-alumnos") {
    return (
      <div className="flex flex-col gap-6">
        <BuscadorAlumnoProfesor profesorClave={datos.profesorClave} />
        {/* El frame del directivo muestra aquí las solicitudes de justificación
            con Aceptar y Rechazar. El maestro ve el mismo hueco sin ese panel:
            no tiene `justificacion.resolver`. */}
        {datos.puedeResolverJustificaciones ? <JustificacionesAdmin /> : null}
      </div>
    );
  }

  if (pieza === "materia-asistencia") {
    return <AsistenciasPanel nombreProfesor={datos.nombreProfesor} />;
  }

  if (pieza === "calendario-escolar") {
    // Mismo panel que usa el técnico, en modo lectura: se ve el mes con sus
    // días marcados y se puede consultar cada uno, pero no se dibuja nada que
    // llame a una action de escritura.
    return (
      <CalendarioEscolarPanel cicloInicial={datos.cicloOperativo || undefined} soloLectura />
    );
  }

  // pieza === "materia-avance": catálogo a la izquierda, contenido a la derecha.
  const nombreVisible =
    datos.materias.find((m) => m.idInterno === seleccionada)?.nombreVisible ?? "";

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <MateriaSelector
        materias={datos.materias}
        seleccionada={seleccionada}
        onSeleccionar={setSeleccionada}
        iniciarColapsado={datos.materias.length > 30}
        className="lg:w-80 lg:shrink-0"
      />

      <div className="flex min-h-[16rem] flex-1 flex-col gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        {!seleccionada ? (
          <Aviso>Elige una materia del catálogo para ver su avance.</Aviso>
        ) : esModoConfiguracion(modo) ? (
          asistente ? (
            <MateriaMapeoColumnas
              asistente={asistente}
              onCancelar={cerrar}
              onCompletado={() => {
                cerrar();
                void refrescar(seleccionada);
              }}
            />
          ) : (
            <>
              <Aviso>
                La configuración de columnas se abre con el archivo que vas a
                subir: elige el Excel y te preguntaré qué columna es cada cosa.
              </Aviso>
              <label className="w-fit cursor-pointer rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110">
                Elegir archivo
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void abrir(f, seleccionada);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )
        ) : cargando ? (
          <Aviso>Cargando el avance de {nombreVisible}…</Aviso>
        ) : (
          <MateriaTablaVistaPanel
            vista={vista}
            materiaNombre={nombreVisible || seleccionada}
            mostrarDetalleColumnas
          />
        )}
      </div>
    </div>
  );
}
