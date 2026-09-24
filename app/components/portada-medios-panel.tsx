"use client";

/**
 * portada-medios-panel.tsx — «Configuración → Video e imágenes», para directivo y
 * técnico. PROMPT N, 2026-09-23.
 *
 * Tres bloques: el carrusel de la portada (hasta 5 imágenes, cada una con su
 * versión opcional para teléfono), un video por carrera y los enlaces de contacto.
 *
 * ── Cómo sube un archivo ───────────────────────────────────────────────────
 * 1. Se mide en el navegador y se valida con las MISMAS reglas que el servidor
 *    (`portada-puro.ts`): si no cumple, se avisa antes de esperar la subida.
 * 2. El servidor firma (`actionFirmarSubidaPortada`) y el archivo va DIRECTO a
 *    Cloudinary, con barra de progreso: por una action no cabe más de 1 MB.
 * 3. El servidor lo registra comprobándolo contra el archivo real y, si no
 *    cumple, lo borra. El paso 1 es cortesía; el 3 es el que manda.
 *
 * ── Toda llamada a una action maneja su error ──────────────────────────────
 * El 23 de septiembre se midió que 31 de 35 componentes no lo hacían: un 500 se
 * veía como «cargando» para siempre, y así estuvo producción seis días. Aquí,
 * cualquier fallo termina en un mensaje y el panel vuelve a quedar usable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actionEliminarMedioPortada,
  actionFirmarSubidaPortada,
  actionGuardarAjustesPortada,
  actionListarMediosPortada,
  actionRegistrarMedioPortada,
  actionReordenarPortada,
} from "@/app/actions/portada";
import type { CarreraPortada, EstadoPortada, ImagenPortada } from "@/lib/escolar/portada/portada";
import {
  AJUSTES_PORTADA,
  MAX_DURACION_VIDEO_S,
  MAX_IMAGENES,
  MEDIDAS,
  RECOMENDADO_BYTES_VIDEO,
  siguienteOrdenLibre,
  validarImagen,
  validarVideo,
  type Destino,
  type Variante,
} from "@/lib/escolar/portada/portada-puro";
import { medirImagen, medirVideo } from "@/lib/imagen/medir-archivo";
import { subirConFirma } from "@/lib/cloudinary/subida-navegador";

/* ── Estilos (constantes, no componentes: ver C11) ─────────────────────── */

const TARJETA = "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4";
const TITULO_BLOQUE = "text-sm font-extrabold uppercase tracking-wide text-[var(--oc-text)]";
const NOTA = "text-xs leading-relaxed text-[var(--oc-muted)]";
const BTN_PRIMARIO =
  "rounded-full border border-[var(--oc-mint)] bg-[var(--oc-mint)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-navy)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECUNDARIO =
  "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:border-[var(--oc-border-active)] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PELIGRO =
  "rounded-full border border-red-400/60 bg-transparent px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40";
const ENTRADA =
  "w-full rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]";

type Mensaje = { tipo: "ok" | "error"; texto: string } | null;

const MB = 1024 * 1024;
const enMB = (b: number) => `${Math.round(b / MB)} MB`;

/** El destino pendiente de elegir archivo, con lo que se necesita para registrarlo. */
type Pendiente = Destino & { textoAlt?: string };

export function PortadaMediosPanel() {
  const [estado, setEstado] = useState<EstadoPortada | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [altNueva, setAltNueva] = useState("");
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const pendiente = useRef<Pendiente | null>(null);

  const aplicarEstado = useCallback((e: EstadoPortada) => {
    setEstado(e);
    setAjustes(Object.fromEntries(AJUSTES_PORTADA.map((a) => [a.clave, e.ajustes[a.clave] ?? ""])));
  }, []);

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionListarMediosPortada())
      .then((r) => {
        if (r.ok) aplicarEstado(r.estado);
        else setMensaje({ tipo: "error", texto: r.error });
      })
      .catch(() => setMensaje({ tipo: "error", texto: "No se pudo cargar la portada. Recarga la página." }));
  }, [aplicarEstado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Abre el selector de archivos para un destino concreto. */
  const elegirArchivo = (destino: Pendiente) => {
    pendiente.current = destino;
    const input = entradaArchivo.current;
    if (!input) return;
    input.accept = destino.tipo === "video" ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp";
    input.value = "";
    input.click();
  };

  const subir = async (archivo: File) => {
    const destino = pendiente.current;
    if (!destino) return;
    const clave = `${destino.tipo}-${destino.orden ?? destino.carreraId}-${destino.variante ?? ""}`;
    setMensaje(null);
    setOcupado(clave);
    setProgreso(null);
    try {
      // 1 · Medir y avisar a tiempo. Si no se puede medir, decide el servidor.
      const medida = destino.tipo === "video" ? await medirVideo(archivo) : await medirImagen(archivo);
      if (medida) {
        const previa =
          destino.tipo === "video"
            ? validarVideo({ ...medida, bytes: archivo.size })
            : validarImagen({ ...medida, bytes: archivo.size, variante: destino.variante as Variante });
        if (!previa.ok) {
          setMensaje({ tipo: "error", texto: previa.error });
          return;
        }
      }

      // 2 · Firma y subida directa a Cloudinary.
      const f = await actionFirmarSubidaPortada({
        tipo: destino.tipo,
        variante: destino.variante ?? null,
        orden: destino.orden ?? null,
        carreraId: destino.carreraId ?? null,
      });
      if (!f.ok) {
        setMensaje({ tipo: "error", texto: f.error });
        return;
      }
      setProgreso(0);
      const hecha = await subirConFirma(f.firma, archivo, setProgreso);

      // 3 · Registro: el servidor lo comprueba contra el archivo real.
      const r = await actionRegistrarMedioPortada({
        tipo: destino.tipo,
        variante: destino.variante ?? null,
        orden: destino.orden ?? null,
        carreraId: destino.carreraId ?? null,
        public_id: hecha.public_id,
        textoAlt: destino.textoAlt?.trim() || null,
      });
      if (!r.ok) {
        setMensaje({ tipo: "error", texto: r.error });
        return;
      }
      aplicarEstado(r.estado);
      setAltNueva("");
      setMensaje({ tipo: "ok", texto: destino.tipo === "video" ? "Video publicado en la portada." : "Imagen publicada en la portada." });
    } catch (e) {
      setMensaje({ tipo: "error", texto: `No se pudo completar la subida. ${e instanceof Error ? e.message : ""}`.trim() });
    } finally {
      setOcupado(null);
      setProgreso(null);
      pendiente.current = null;
    }
  };

  /** Ejecuta una acción que devuelve el estado nuevo, con su mensaje y su error. */
  const ejecutar = async (clave: string, accion: () => Promise<{ ok: true; estado: EstadoPortada } | { ok: false; error: string }>, exito: string) => {
    setMensaje(null);
    setOcupado(clave);
    try {
      const r = await accion();
      if (r.ok) {
        aplicarEstado(r.estado);
        setMensaje({ tipo: "ok", texto: exito });
      } else {
        setMensaje({ tipo: "error", texto: r.error });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo completar la operación. Inténtalo de nuevo." });
    } finally {
      setOcupado(null);
    }
  };

  const mover = (img: ImagenPortada, delta: -1 | 1) => {
    if (!estado) return;
    const ids = estado.imagenes.map((i) => i.id);
    const i = ids.indexOf(img.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void ejecutar(`mover-${img.id}`, () => actionReordenarPortada({ ids }), "Orden del carrusel actualizado.");
  };

  const eliminar = (clave: string, entrada: { id: string; variante?: "movil" }, pregunta: string, exito: string) => {
    if (!window.confirm(pregunta)) return;
    void ejecutar(clave, () => actionEliminarMedioPortada(entrada), exito);
  };

  if (!estado) {
    return (
      <div className={TARJETA}>
        {mensaje ? <p className="text-sm text-red-300">{mensaje.texto}</p> : <p className={NOTA}>Cargando la portada…</p>}
      </div>
    );
  }

  const libre = siguienteOrdenLibre(estado.imagenes.map((i) => i.orden));
  const esc = MEDIDAS.escritorio;
  const mov = MEDIDAS.movil;

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={entradaArchivo}
        type="file"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void subir(archivo);
        }}
      />

      {mensaje && (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            mensaje.tipo === "ok"
              ? "border-[var(--oc-mint)]/60 text-[var(--oc-mint)]"
              : "border-red-400/60 text-red-300"
          }`}
        >
          {mensaje.texto}
        </p>
      )}
      {progreso !== null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--oc-input)]" aria-label={`Subiendo: ${progreso} %`}>
          <div className="h-full bg-[var(--oc-mint)] transition-all" style={{ width: `${progreso}%` }} />
        </div>
      )}

      {/* ── Carrusel ─────────────────────────────────────────────────────── */}
      <section className={TARJETA}>
        <h2 className={TITULO_BLOQUE}>Carrusel de la portada · {estado.imagenes.length} de {MAX_IMAGENES}</h2>
        <p className={`${NOTA} mt-1`}>
          Escritorio: <strong>{esc.ideal.ancho} × {esc.ideal.alto} px</strong> (proporción 7:3; mínimo {esc.minimo.ancho} × {esc.minimo.alto}).
          Teléfono, opcional: <strong>{mov.ideal.ancho} × {mov.ideal.alto} px</strong> (4:5, vertical). JPG, PNG o WebP de hasta 10 MB.
          Deja libre <strong>el 25 % inferior</strong> —ahí va «Conoce nuestra oferta educativa»— y un margen a los lados para las flechas.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {estado.imagenes.map((img, i) => (
            <PosicionCarrusel
              key={img.id}
              img={img}
              primera={i === 0}
              ultima={i === estado.imagenes.length - 1}
              ocupado={ocupado}
              onReemplazar={() => elegirArchivo({ tipo: "imagen", variante: "escritorio", orden: img.orden })}
              onMovil={() => elegirArchivo({ tipo: "imagen", variante: "movil", orden: img.orden })}
              onQuitarMovil={() =>
                eliminar(`movil-${img.id}`, { id: img.id, variante: "movil" }, "¿Quitar la versión para teléfono? Los teléfonos mostrarán la horizontal.", "Versión para teléfono quitada.")
              }
              onEliminar={() => eliminar(`del-${img.id}`, { id: img.id }, `¿Eliminar la imagen ${img.orden} del carrusel?`, "Imagen eliminada.")}
              onMover={(d) => mover(img, d)}
            />
          ))}

          {libre !== null && (
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-dashed border-[var(--oc-border)] p-4">
              <div>
                <p className="text-sm font-bold text-[var(--oc-text)]">Posición {libre}</p>
                <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
                  Descripción (para lectores de pantalla)
                  <input
                    className={`${ENTRADA} mt-1`}
                    value={altNueva}
                    maxLength={300}
                    placeholder="Ej.: Visión y valores del CETAC 23"
                    onChange={(e) => setAltNueva(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className={BTN_PRIMARIO}
                disabled={ocupado !== null}
                onClick={() => elegirArchivo({ tipo: "imagen", variante: "escritorio", orden: libre, textoAlt: altNueva })}
              >
                Subir imagen
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Videos ───────────────────────────────────────────────────────── */}
      <section className={TARJETA}>
        <h2 className={TITULO_BLOQUE}>Video por carrera</h2>
        <p className={`${NOTA} mt-1`}>
          Uno por carrera. MP4 (o MOV de iPhone), <strong>horizontal 16:9</strong>, de hasta {MAX_DURACION_VIDEO_S / 60} minutos.
          Procura no pasar de {enMB(RECOMENDADO_BYTES_VIDEO)}: cada reproducción completa consume ese peso del plan de Cloudinary.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {estado.carreras.map((c) => (
            <VideoCarreraTarjeta
              key={c.id}
              carrera={c}
              ocupado={ocupado}
              onSubir={() => elegirArchivo({ tipo: "video", carreraId: c.id })}
              onEliminar={() =>
                c.video && eliminar(`del-${c.video.id}`, { id: c.video.id }, `¿Quitar el video de ${c.rotulo}?`, "Video quitado.")
              }
            />
          ))}
        </div>
      </section>

      {/* ── Enlaces y contacto ───────────────────────────────────────────── */}
      <section className={TARJETA}>
        <h2 className={TITULO_BLOQUE}>Enlaces y contacto</h2>
        <p className={`${NOTA} mt-1`}>Aparecen en la barra superior y en el pie de la portada. Lo que dejes vacío no se muestra.</p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ejecutar("ajustes", () => actionGuardarAjustesPortada({ ajustes }), "Enlaces y contacto guardados.");
          }}
        >
          {AJUSTES_PORTADA.map((a) => (
            <label key={a.clave} className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
              {a.etiqueta}
              <input
                className={`${ENTRADA} mt-1`}
                value={ajustes[a.clave] ?? ""}
                placeholder={a.ejemplo}
                maxLength={300}
                onChange={(e) => setAjustes((prev) => ({ ...prev, [a.clave]: e.target.value }))}
              />
            </label>
          ))}
          <div className="md:col-span-2">
            <button type="submit" className={BTN_PRIMARIO} disabled={ocupado !== null}>
              Guardar enlaces y contacto
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ── Una posición del carrusel ─────────────────────────────────────────── */

function PosicionCarrusel(p: {
  img: ImagenPortada;
  primera: boolean;
  ultima: boolean;
  ocupado: string | null;
  onReemplazar: () => void;
  onMovil: () => void;
  onQuitarMovil: () => void;
  onEliminar: () => void;
  onMover: (delta: -1 | 1) => void;
}) {
  const bloqueado = p.ocupado !== null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--oc-text)]">Posición {p.img.orden}</p>
        <div className="flex gap-1">
          <button type="button" className={BTN_SECUNDARIO} disabled={bloqueado || p.primera} onClick={() => p.onMover(-1)} aria-label="Mover antes">
            ↑
          </button>
          <button type="button" className={BTN_SECUNDARIO} disabled={bloqueado || p.ultima} onClick={() => p.onMover(1)} aria-label="Mover después">
            ↓
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de Cloudinary, ya optimizada en la URL */}
        <img src={p.img.urlEscritorio} alt={p.img.textoAlt} className="aspect-[7/3] w-3/4 rounded-lg object-cover" />
        {p.img.urlMovil ? (
          // eslint-disable-next-line @next/next/no-img-element -- ídem
          <img src={p.img.urlMovil} alt={`${p.img.textoAlt} (teléfono)`} className="aspect-[4/5] w-1/4 rounded-lg object-cover" />
        ) : (
          <div className="flex aspect-[4/5] w-1/4 items-center justify-center rounded-lg border border-dashed border-[var(--oc-border)] text-center text-[9px] font-bold uppercase text-[var(--oc-muted)]">
            Sin versión teléfono
          </div>
        )}
      </div>
      <p className="truncate text-[11px] text-[var(--oc-muted)]" title={p.img.textoAlt}>
        {p.img.textoAlt}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_SECUNDARIO} disabled={bloqueado} onClick={p.onReemplazar}>
          Reemplazar
        </button>
        <button type="button" className={BTN_SECUNDARIO} disabled={bloqueado} onClick={p.onMovil}>
          {p.img.urlMovil ? "Cambiar teléfono" : "Añadir teléfono"}
        </button>
        {p.img.urlMovil && (
          <button type="button" className={BTN_SECUNDARIO} disabled={bloqueado} onClick={p.onQuitarMovil}>
            Quitar teléfono
          </button>
        )}
        <button type="button" className={BTN_PELIGRO} disabled={bloqueado} onClick={p.onEliminar}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

/* ── El video de una carrera ───────────────────────────────────────────── */

function VideoCarreraTarjeta(p: {
  carrera: CarreraPortada;
  ocupado: string | null;
  onSubir: () => void;
  onEliminar: () => void;
}) {
  const v = p.carrera.video;
  const bloqueado = p.ocupado !== null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
      <p className="text-sm font-bold text-[var(--oc-text)]">{p.carrera.rotulo}</p>
      {v ? (
        <video src={v.url} poster={v.poster} controls preload="none" playsInline className="aspect-video w-full rounded-lg bg-black" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-[var(--oc-border)] text-[10px] font-bold uppercase text-[var(--oc-muted)]">
          Sin video: en la portada solo se verá el nombre de la carrera
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARIO} disabled={bloqueado} onClick={p.onSubir}>
          {v ? "Reemplazar video" : "Subir video"}
        </button>
        {v && (
          <button type="button" className={BTN_PELIGRO} disabled={bloqueado} onClick={p.onEliminar}>
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}
