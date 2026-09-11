/**
 * barra-modo-oceano.tsx — NIVEL 3 del shell Océano (barra de modo).
 *
 * Sub-vistas del apartado, arriba a la derecha del contenido
 * («Configurar citas · Citas pendientes · Citas programadas» es su forma
 * canónica en Administración escolar).
 *
 * Es obligatoria aunque el alumno apenas la use: sin ella el shell no sirve
 * para directivo ni para técnico. Los modos salen de `apartado(...).modos` del
 * mapa; un apartado sin sub-vistas no dibuja barra (no hay nada que elegir),
 * y los modos apagados no existen: el mapa los lista solo cuando la sub-vista
 * existe de verdad.
 *
 * Menta NO se usa aquí: el acento es único y esta fase lo reserva para el CTA
 * primario y el ítem de navegación activo de NIVEL 1 (TOKENS-OCEANO.css).
 */
export function BarraModoOceano({
  modos,
  modoActivo,
  onModo,
}: {
  modos: readonly string[];
  modoActivo: string | null;
  onModo: (modo: string) => void;
}) {
  if (modos.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Sub-vistas del apartado"
      className="mb-4 flex flex-wrap items-center justify-end gap-1.5"
    >
      {modos.map((m) => {
        const activo = m === modoActivo;
        return (
          <button
            key={m}
            type="button"
            aria-current={activo ? "true" : undefined}
            onClick={() => onModo(m)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide transition ${
              activo
                ? "border-[var(--oc-border-active)] bg-[var(--oc-input)] text-[var(--oc-text)]"
                : "border-[var(--oc-border)] text-[var(--oc-muted)] hover:bg-[var(--oc-input)] hover:text-[var(--oc-text)]"
            }`}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}
