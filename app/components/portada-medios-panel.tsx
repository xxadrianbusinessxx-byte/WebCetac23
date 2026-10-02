"use client";

/**
 * portada-medios-panel.tsx — «Configuración → Video e imágenes», para directivo y
 * técnico. PROMPT N, 2026-09-23.
 *
 * Tres bloques: el carrusel de la portada (hasta 5 imágenes, cada una con su
 * versión opcional para teléfono), la oferta educativa —el video y el texto de
 * cada carrera— y los enlaces de contacto.
 *
 * ── La oferta educativa (PROMPT U, 2026-10-01) ─────────────────────────────
 * El video ya no se sube: se pega un enlace de YouTube o TikTok. Mientras se
 * escribe, el navegador lo analiza con la MISMA regla que el servidor
 * (`analizarEnlaceVideo`) para decir qué es y enseñar la vista previa; al
 * guardar, el servidor además pregunta a la plataforma si existe y se puede
 * insertar.
 *
 * ── Cómo sube una imagen ───────────────────────────────────────────────────
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
  actionGuardarCarreraPortada,
  actionListarMediosPortada,
  actionRegistrarMedioPortada,
  actionReordenarPortada,
} from "@/app/actions/portada";
import type { CarreraPortada, EstadoPortada, ImagenPortada } from "@/lib/escolar/portada/portada";
import {
  AJUSTES_PORTADA,
  ETIQUETA_FORMATO,
  FORMATOS_BANDA,
  MAX_IMAGENES,
  MAX_LARGO_DESCRIPCION_CARRERA,
  MAX_LARGO_ENLACE_VIDEO,
  MEDIDAS,
  analizarEnlaceVideo,
  describirEnlace,
  siguienteOrdenLibre,
  urlInsercionVideo,
  validarImagen,
  type Destino,
  type FormatoVideo,
  type Variante,
} from "@/lib/escolar/portada/portada-puro";
import { medirImagen } from "@/lib/imagen/medir-archivo";
import { subirConFirma } from "@/lib/cloudinary/subida-navegador";
import { VideoIncrustado } from "@/app/components/ui/video-incrustado";

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

/** El destino pendiente de elegir archivo, con lo que se necesita para registrarlo. */
type Pendiente = Destino & { textoAlt?: string };

/** Lo que el panel manda a guardar de una carrera. */
type EntradaCarrera = { carreraId: string; enlace: string; formato: FormatoVideo | null; descripcion: string };

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

  /** Abre el selector de archivos para un destino concreto. Solo imágenes: el video es un enlace. */
  const elegirArchivo = (destino: Pendiente) => {
    pendiente.current = destino;
    const input = entradaArchivo.current;
    if (!input) return;
    input.accept = "image/jpeg,image/png,image/webp";
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
      const medida = await medirImagen(archivo);
      if (medida) {
        const previa = validarImagen({ ...medida, bytes: archivo.size, variante: destino.variante as Variante });
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
      setMensaje({ tipo: "ok", texto: "Imagen publicada en la portada." });
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

      {/* ── Oferta educativa ─────────────────────────────────────────────── */}
      <section className={TARJETA}>
        <h2 className={TITULO_BLOQUE}>Oferta educativa</h2>
        <p className={`${NOTA} mt-1`}>
          Por cada carrera: el <strong>enlace de un video de YouTube o TikTok</strong> y un texto que la describa y diga su objetivo.
          El video tiene que ser público (o «no listado» en YouTube) y permitir insertarse. La banda de la portada toma su forma:
          horizontal 16:9 o vertical 9:16 (Shorts y TikTok). No consume el plan de Cloudinary.
        </p>
        {estado.faltaSqlCarreras && (
          <p className="mt-3 rounded-xl border border-red-400/60 px-4 py-3 text-sm font-semibold text-red-300">
            Falta ejecutar <code>supabase/crear-portada-carreras.sql</code> en el SQL Editor de Supabase. Hasta entonces no se pueden
            guardar enlaces ni textos; la portada se sigue viendo como siempre.
          </p>
        )}
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {estado.carreras.map((c) => (
            <OfertaCarreraTarjeta
              // La clave cambia con lo guardado: tras guardar, la tarjeta se
              // rehace con lo que devolvió el servidor, no con lo que se tecleó.
              key={`${c.id}|${c.video?.urlCanonica ?? ""}|${c.video?.formato ?? ""}|${c.descripcion ?? ""}`}
              carrera={c}
              bloqueado={ocupado !== null || estado.faltaSqlCarreras}
              onGuardar={(entrada) =>
                void ejecutar(`carrera-${c.id}`, () => actionGuardarCarreraPortada(entrada), `${c.rotulo}: guardado en la portada.`)
              }
              onQuitarVideo={() => {
                if (!window.confirm(`¿Quitar el video de ${c.rotulo}? El texto se conserva.`)) return;
                void ejecutar(
                  `carrera-${c.id}`,
                  () => actionGuardarCarreraPortada({ carreraId: c.id, enlace: "", formato: null, descripcion: c.descripcion ?? "" }),
                  "Video quitado.",
                );
              }}
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

/* ── El video y el texto de una carrera ─────────────────────────────── */

function OfertaCarreraTarjeta(p: {
  carrera: CarreraPortada;
  bloqueado: boolean;
  onGuardar: (entrada: EntradaCarrera) => void;
  onQuitarVideo: () => void;
}) {
  const guardado = p.carrera.video;
  const [enlace, setEnlace] = useState(guardado?.urlCanonica ?? "");
  const [formato, setFormato] = useState<FormatoVideo>(guardado?.formato ?? "horizontal");
  const [descripcion, setDescripcion] = useState(p.carrera.descripcion ?? "");

  // La MISMA regla que aplicará el servidor. Aquí solo sirve para avisar y
  // para la vista previa: el servidor vuelve a analizar y además pregunta a la
  // plataforma.
  const analisis = enlace.trim() ? analizarEnlaceVideo(enlace) : null;
  const hayVideo = analisis !== null && analisis.tipo !== "error";

  const cambiarEnlace = (texto: string) => {
    setEnlace(texto);
    const a = texto.trim() ? analizarEnlaceVideo(texto) : null;
    // El formato se propone con cada enlace nuevo; quien edita puede corregirlo.
    if (a?.tipo === "video") setFormato(a.enlace.formatoSugerido);
    if (a?.tipo === "corto-tiktok") setFormato("vertical");
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
      <p className="text-sm font-bold text-[var(--oc-text)]">{p.carrera.rotulo}</p>

      <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
        Enlace del video (YouTube o TikTok)
        <input
          className={`${ENTRADA} mt-1`}
          value={enlace}
          maxLength={MAX_LARGO_ENLACE_VIDEO}
          placeholder="https://www.youtube.com/watch?v=… · https://www.tiktok.com/@cuenta/video/…"
          onChange={(e) => cambiarEnlace(e.target.value)}
        />
      </label>
      {analisis && (
        <p className={`text-xs ${analisis.tipo === "error" ? "text-red-300" : "text-[var(--oc-muted)]"}`}>
          {analisis.tipo === "error"
            ? analisis.error
            : analisis.tipo === "corto-tiktok"
              ? "Enlace corto de TikTok: se comprobará al guardar."
              : describirEnlace(analisis.enlace)}
        </p>
      )}

      {hayVideo && (
        <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          Formato de la banda
          <select className={`${ENTRADA} mt-1`} value={formato} onChange={(e) => setFormato(e.target.value as FormatoVideo)}>
            {FORMATOS_BANDA.map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FORMATO[f]}
              </option>
            ))}
          </select>
        </label>
      )}

      {analisis?.tipo === "video" ? (
        <VideoIncrustado
          src={urlInsercionVideo(analisis.enlace.plataforma, analisis.enlace.id)}
          formato={formato}
          titulo={`Vista previa del video de ${p.carrera.rotulo}`}
          className="mx-auto rounded-lg"
        />
      ) : (
        !analisis && (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-[var(--oc-border)] p-3 text-center text-[10px] font-bold uppercase text-[var(--oc-muted)]">
            Sin video: en la portada solo se verá el nombre de la carrera{descripcion.trim() ? " y su texto" : ""}
          </div>
        )
      )}

      <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
        Descripción de la carrera y su objetivo
        <textarea
          className={`${ENTRADA} mt-1 resize-y normal-case tracking-normal`}
          rows={5}
          value={descripcion}
          maxLength={MAX_LARGO_DESCRIPCION_CARRERA}
          placeholder={"Ej.: Formamos técnicos que diseñan, instalan y mantienen sistemas automatizados.\nObjetivo: …"}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>
      <p className={`${NOTA} -mt-2 text-right`}>
        {descripcion.length} / {MAX_LARGO_DESCRIPCION_CARRERA}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BTN_PRIMARIO}
          disabled={p.bloqueado || analisis?.tipo === "error"}
          onClick={() => p.onGuardar({ carreraId: p.carrera.id, enlace, formato: hayVideo ? formato : null, descripcion })}
        >
          Guardar
        </button>
        {guardado && (
          <button type="button" className={BTN_PELIGRO} disabled={p.bloqueado} onClick={p.onQuitarVideo}>
            Quitar video
          </button>
        )}
      </div>
    </div>
  );
}
