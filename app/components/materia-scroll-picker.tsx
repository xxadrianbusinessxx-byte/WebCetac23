"use client";

type Props = {
  materias: readonly string[];
  seleccionada: string;
  onSeleccionar: (nombre: string) => void;
  className?: string;
};

/** Selector con scroll de todas las materias (1RO, 2DO, 3RO, …). */
export function MateriaScrollPicker({
  materias,
  seleccionada,
  onSeleccionar,
  className = "",
}: Props) {
  return (
    <div className={className}>
      <label className="sr-only" htmlFor="materia-scroll-select">
        Materia
      </label>
      <select
        id="materia-scroll-select"
        value={seleccionada}
        onChange={(e) => onSeleccionar(e.target.value)}
        className="max-h-40 w-full min-w-[12rem] cursor-pointer rounded-2xl border border-white/70 bg-white/95 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none focus:ring-2 focus:ring-sky-400/50 sm:max-h-48 sm:text-xs"
        size={6}
      >
        {materias.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
