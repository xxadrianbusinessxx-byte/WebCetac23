"use client";

/**
 * PANEL DE ETIQUETAS DINÁMICAS (FASE 2)
 *
 * Tabla editable estilo «título / valor» (hasta 20), con agregar, editar,
 * eliminar, reordenar y guardar. Incluye la importación individual desde Excel
 * (el alumno ya es el contexto del perfil). La autorización de escritura se
 * valida SIEMPRE en el servidor (resolverAccesoAlumno); aquí solo se reflejan
 * los permisos para presentación.
 */
import { useEffect, useRef, useState } from "react";
import {
  actionGuardarEtiquetasDinamicas,
  actionImportarEtiquetasIndividual,
} from "@/app/actions/etiquetas-dinamicas";
import {
  MAX_ETIQUETAS_POR_ALUMNO,
  type AlumnoEtiquetaRow,
} from "@/lib/escolar/etiquetas-dinamicas";

type FilaEditable = {
  id: string | null;
  titulo: string;
  valor: string;
  orden: number;
};

type Mensaje = { ok: boolean; texto: string } | null;

function PillButton({
  children,
  onClick,
  disabled,
  tone = "sky",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "sky" | "grey";
}) {
  const fondo =
    tone === "sky"
      ? "bg-linear-to-b from-sky-500 via-sky-600 to-sky-700"
      : "bg-linear-to-b from-slate-400 via-slate-500 to-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border border-white/70 ${fondo} px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export function EtiquetasDinamicasPanel({
  curp,
  iniciales,
  puedeEditar,
  puedeImportar,
}: {
  curp: string;
  iniciales: AlumnoEtiquetaRow[];
  puedeEditar: boolean;
  puedeImportar: boolean;
}) {
  const [filas, setFilas] = useState<FilaEditable[]>(() =>
    iniciales.map((f) => ({
      id: f.id,
      titulo: f.titulo,
      valor: f.valor,
      orden: f.orden,
    })),
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  // Sincroniza el estado editable cuando cambia el alumno visto (p. ej. el
  // tutor cambia de hijo): iniciales viene del payload del perfil.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilas(
      iniciales.map((f) => ({
        id: f.id,
        titulo: f.titulo,
        valor: f.valor,
        orden: f.orden,
      })),
    );
  }, [iniciales]);

  function cambiar(indice: number, campo: "titulo" | "valor", valor: string) {
    setFilas((prev) =>
      prev.map((f, i) => (i === indice ? { ...f, [campo]: valor } : f)),
    );
  }

  function agregar() {
    if (filas.length >= MAX_ETIQUETAS_POR_ALUMNO) {
      setMensaje({
        ok: false,
        texto: `Máximo ${MAX_ETIQUETAS_POR_ALUMNO} etiquetas por alumno.`,
      });
      return;
    }
    setFilas((prev) => [
      ...prev,
      { id: null, titulo: "", valor: "", orden: prev.length },
    ]);
  }

  function quitar(indice: number) {
    setFilas((prev) => prev.filter((_, i) => i !== indice));
  }

  function mover(indice: number, delta: number) {
    setFilas((prev) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      const [fila] = copia.splice(indice, 1);
      copia.splice(destino, 0, fila);
      return copia;
    });
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    // El orden final lo reasigna el servicio a 0..n-1 según la posición.
    const r = await actionGuardarEtiquetasDinamicas(
      curp,
      filas.map((f, i) => ({ titulo: f.titulo, valor: f.valor, orden: i })),
    );
    setGuardando(false);
    if (r.ok) {
      setFilas(
        r.data.map((f) => ({
          id: f.id,
          titulo: f.titulo,
          valor: f.valor,
          orden: f.orden,
        })),
      );
      setMensaje({ ok: true, texto: "Etiquetas guardadas." });
    } else {
      setMensaje({ ok: false, texto: r.error });
    }
  }

  async function onArchivoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    setMensaje(null);
    const fd = new FormData();
    fd.set("archivo", file);
    const r = await actionImportarEtiquetasIndividual(fd, curp);
    if (r.ok) {
      setFilas(
        r.etiquetas.map((f) => ({
          id: f.id,
          titulo: f.titulo,
          valor: f.valor,
          orden: f.orden,
        })),
      );
      setMensaje({
        ok: true,
        texto: `Importación: ${r.resumen.agregadas} nuevas · ${r.resumen.actualizadas} actualizadas.`,
      });
    } else {
      setMensaje({ ok: false, texto: r.error });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
          Etiquetas personales ({filas.length}/{MAX_ETIQUETAS_POR_ALUMNO})
        </p>
        {puedeImportar && (
          <>
            <input
              ref={inputArchivoRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => void onArchivoElegido(e)}
              aria-label="Importar etiquetas desde Excel"
            />
            <PillButton tone="grey" onClick={() => inputArchivoRef.current?.click()}>
              Importar desde Excel
            </PillButton>
          </>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="text-center text-xs font-semibold text-slate-600">
          Aún no hay etiquetas personales.
          {puedeEditar ? " Agrega una con el botón «+ Agregar»." : ""}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/55 bg-slate-400/25 p-2 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <table className="w-full text-left text-[11px] font-semibold text-slate-700">
            <thead>
              <tr className="border-b border-white/60 text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                <th className="px-2 py-1">Título</th>
                <th className="px-2 py-1">Valor</th>
                <th className="px-2 py-1 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr
                  key={fila.id ?? `nueva-${i}`}
                  className="border-b border-white/40 last:border-0"
                >
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={fila.titulo}
                      disabled={!puedeEditar}
                      onChange={(e) => cambiar(i, "titulo", e.target.value)}
                      placeholder="Ej. Deporte"
                      className="w-full min-w-[7rem] rounded-xl border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-inner outline-none focus:border-sky-600 disabled:bg-white/50 disabled:text-slate-600"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={fila.valor}
                      disabled={!puedeEditar}
                      onChange={(e) => cambiar(i, "valor", e.target.value)}
                      placeholder="Ej. Fútbol"
                      className="w-full min-w-[7rem] rounded-xl border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-inner outline-none focus:border-sky-600 disabled:bg-white/50 disabled:text-slate-600"
                    />
                  </td>
                  <td className="px-1 py-1">
                    {puedeEditar ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => mover(i, -1)}
                          disabled={i === 0}
                          aria-label="Subir"
                          className="rounded-lg border border-white/70 bg-white/80 px-2 py-1 text-[11px] font-extrabold text-sky-800 hover:bg-white disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(i, 1)}
                          disabled={i === filas.length - 1}
                          aria-label="Bajar"
                          className="rounded-lg border border-white/70 bg-white/80 px-2 py-1 text-[11px] font-extrabold text-sky-800 hover:bg-white disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => quitar(i)}
                          aria-label="Eliminar"
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-700 hover:bg-red-100"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="block text-right text-[10px] text-slate-500">
                        {fila.orden + 1}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <PillButton tone="grey" onClick={agregar}>
            + Agregar etiqueta
          </PillButton>
          <PillButton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar etiquetas"}
          </PillButton>
        </div>
      )}

      {mensaje && (
        <p
          className={`text-center text-xs font-semibold ${mensaje.ok ? "text-sky-900" : "text-red-700"}`}
          role={mensaje.ok ? "status" : "alert"}
        >
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}

