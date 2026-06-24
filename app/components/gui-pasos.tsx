"use client";

type Props = {
  titulo: string;
  pasos: readonly string[];
  className?: string;
};

export function GuiPasos({ titulo, pasos, className = "" }: Props) {
  return (
    <details
      className={`rounded-2xl border border-sky-800/25 bg-sky-50/60 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${className}`}
    >
      <summary className="cursor-pointer list-none px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-sky-900 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="text-sky-600">
            ?
          </span>
          {titulo}
        </span>
      </summary>
      <ol className="list-decimal space-y-1.5 border-t border-sky-200/80 px-5 py-3 text-xs font-semibold leading-relaxed text-sky-950/90">
        {pasos.map((paso, i) => (
          <li key={i}>{paso}</li>
        ))}
      </ol>
    </details>
  );
}
