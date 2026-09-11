"use client";

/**
 * selector-alumno-oceano.tsx — selector del ALUMNO VINCULADO (Fase 4).
 *
 * Va en el sidebar, por encima de los apartados, y fija DE QUIÉN son los datos
 * de toda la navegación: al cambiar de pestaña o de apartado, el alumno elegido
 * se conserva (el estado vive en el shell y el alumno en la URL).
 *
 * Es presentación pura: no decide sobre qué alumnos se puede consultar. La lista
 * llega ya resuelta por el servidor (`actionListarAlumnosDelTutor`, que valida
 * la relación contra `tutor_alumnos`) y la LISTA determina lo que se puede
 * elegir. No compara roles: lo que no llega, no se dibuja.
 *
 * Sin alumnos vinculados no se queda mudo: lo dice con una frase.
 */
export function SelectorAlumnoOceano({
  alumnos,
  seleccionado,
  onSeleccionar,
}: {
  alumnos: readonly { curp: string; nombre: string }[];
  /** CURP del alumno activo (o null). */
  seleccionado: string | null;
  onSeleccionar: (curp: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
        Alumno
      </p>

      {alumnos.length === 0 ? (
        <p className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-[11px] font-semibold text-[var(--oc-muted)]">
          No tienes alumnos vinculados.
        </p>
      ) : alumnos.length === 1 ? (
        // Con un solo alumno no hay nada que elegir: se muestra y ya.
        <p className="truncate rounded-xl border border-[var(--oc-border-active)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-text)]">
          {alumnos[0]!.nombre || alumnos[0]!.curp}
        </p>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="sr-only">Elegir alumno</span>
          <select
            value={seleccionado ?? ""}
            onChange={(e) => onSeleccionar(e.target.value)}
            className="w-full rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
          >
            {alumnos.map((a) => (
              <option key={a.curp} value={a.curp}>
                {a.nombre || a.curp}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
