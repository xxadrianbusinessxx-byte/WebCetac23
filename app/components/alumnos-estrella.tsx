import { GlossyPersonIcon } from "./glossy-person-icon";
import type { AlumnoEstrella } from "@/lib/escolar/etiquetas-status";

function StarStudentCell({ item }: { item: AlumnoEstrella }) {
  const promedioTxt =
    item.promedio > 0 ? item.promedio.toFixed(2) : "\u2014";
  return (
    <div
      className="flex flex-col gap-1"
      title={`${item.nombre} \u2014 Promedio: ${promedioTxt}`}
    >
      <div className="aspect-square rounded-3xl border-2 border-sky-900/35 bg-white/80 p-2 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_6px_16px_rgba(14,165,233,0.15)]">
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/80 to-sky-200/40">
          <GlossyPersonIcon
            uid={item.alumno.CURP}
            className="h-[78%] w-[78%] drop-shadow-[0_4px_8px_rgba(2,132,199,0.35)]"
          />
          <div
            className="pointer-events-none absolute inset-x-2 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/55 to-transparent"
            aria-hidden
          />
        </div>
      </div>
      <p className="line-clamp-2 text-center text-[9px] font-bold uppercase leading-tight text-sky-900">
        {item.nombre}
      </p>
      <p className="text-center text-[10px] font-extrabold text-sky-700">
        {promedioTxt}
      </p>
    </div>
  );
}

export function AlumnosEstrellaPanel({
  alumnos,
}: {
  alumnos: AlumnoEstrella[];
}) {
  if (!alumnos.length) {
    return (
      <p className="text-center text-xs font-semibold text-sky-800/80">
        Sin datos de promedio aún. Carga la tabla ETIQUETAS (STATUS) en Supabase
        con la columna CURP y los promedios por ciclo.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {alumnos.map((a) => (
        <StarStudentCell key={a.alumno.CURP} item={a} />
      ))}
    </div>
  );
}
