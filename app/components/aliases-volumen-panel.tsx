"use client";

// PROMPT-4/T2 — Edición EN VOLUMEN de aliases de materia con el patrón del
// repo: previsualizar → confirmar. Sube un archivo (materia;nombre_visible;
// vacío en la 2ª columna = quitar alias), ve qué cambiará y confirma.
// Reutiliza materia.editar_alias (quitar un alias es editarlo; sin capacidad
// nueva) y la acción de quitar NUNCA borra (activo=false, R8).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  actionAplicarAliasArchivo,
  actionPrevisualizarAliasArchivo,
  type FilaAliasVolumen,
} from "@/app/actions/materias";

type Estado =
  | { fase: "inicio" }
  | { fase: "preview"; filas: FilaAliasVolumen[] }
  | { fase: "aplicado"; mensaje: string };

export function AliasesVolumenPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function previsualizar(file: File) {
    setTrabajando(true);
    setError(null);
    const fd = new FormData();
    fd.set("archivo", file);
    const r = await actionPrevisualizarAliasArchivo(fd);
    setTrabajando(false);
    if (r.ok) {
      if (r.filas.length === 0) {
        setError("El archivo no trajo filas de materias válidas.");
        return;
      }
      setEstado({ fase: "preview", filas: r.filas });
    } else {
      setError(r.error);
    }
  }

  async function confirmar() {
    if (estado.fase !== "preview") return;
    const aAplicar = estado.filas.filter((f) => f.ok);
    setTrabajando(true);
    setError(null);
    const r = await actionAplicarAliasArchivo(aAplicar);
    setTrabajando(false);
    if (r.ok) {
      setEstado({
        fase: "aplicado",
        mensaje: `Aliases: ${r.aplicados} actualizados · ${r.quitados} quitados · ${r.errores} con error.`,
      });
      router.refresh();
    } else {
      setError(r.error);
    }
  }

  return (
    <div className="rounded-3xl border border-sky-300/60 bg-sky-100/60 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.7)]">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-sky-900">
        Edición en volumen de nombres visibles
      </p>
      <p className="mb-2 text-[11px] font-semibold text-sky-900/80">
        Sube un archivo con dos columnas: <b>materia</b> (idInterno o nombre
        técnico) y <b>nombre_visible</b>. Dejar la segunda columna vacía quita
        el alias (la materia vuelve a mostrarse por su idInterno). Nada se
        escribe hasta confirmar la previsualización.
      </p>

      {error && (
        <p className="mb-2 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-800" role="alert">
          {error}
        </p>
      )}

      {estado.fase === "inicio" && (
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={trabajando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void previsualizar(f);
            e.target.value = "";
          }}
          className="max-w-xs rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
        />
      )}

      {estado.fase === "preview" && (
        <>
          <p className="mb-2 text-[11px] font-extrabold text-sky-900">
            Previsualización — {estado.filas.length} filas (
            {estado.filas.filter((f) => f.ok).length} aplicables)
          </p>
          <div className="max-h-56 overflow-auto rounded-xl border border-white/60 bg-white/70">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-sky-100 text-sky-950">
                <tr>
                  <th className="px-2 py-1 font-extrabold">Materia (idInterno)</th>
                  <th className="px-2 py-1 font-extrabold">Hoy</th>
                  <th className="px-2 py-1 font-extrabold">Resultado</th>
                </tr>
              </thead>
              <tbody className="font-semibold text-slate-700">
                {estado.filas.map((f, i) => (
                  <tr
                    key={`${f.idInterno}-${i}`}
                    className="border-t border-sky-200/60"
                  >
                    <td className="px-2 py-1 font-bold text-sky-900">
                      {f.idInterno}
                    </td>
                    <td className="px-2 py-1">{f.actual}</td>
                    <td className="px-2 py-1">
                      {!f.ok ? (
                        <span className="text-rose-700">{f.error}</span>
                      ) : !f.propuesto ? (
                        <span className="font-extrabold text-amber-700">
                          quitar alias → {f.idInterno}
                        </span>
                      ) : f.propuesto === f.actual ? (
                        <span className="text-slate-500">sin cambio</span>
                      ) : (
                        <span className="font-extrabold text-emerald-700">
                          {f.propuesto}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={trabajando}
              onClick={() => void confirmar()}
              className="rounded-full border border-white/70 bg-linear-to-b from-emerald-400 via-emerald-500 to-emerald-600 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {trabajando ? "Aplicando…" : "Confirmar cambios"}
            </button>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => setEstado({ fase: "inicio" })}
              className="rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-800 transition hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </>
      )}

      {estado.fase === "aplicado" && (
        <>
          <p className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-800">
            {estado.mensaje}
          </p>
          <button
            type="button"
            onClick={() => {
              setEstado({ fase: "inicio" });
              setError(null);
            }}
            className="mt-3 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-800 transition hover:bg-white"
          >
            Subir otro archivo
          </button>
        </>
      )}

      {trabajando && estado.fase === "inicio" && (
        <p className="mt-2 text-xs font-semibold text-sky-900">
          Leyendo archivo…
        </p>
      )}
    </div>
  );
}

