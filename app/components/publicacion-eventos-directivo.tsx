"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  actionEliminarNoticiaInicio,
  actionPublicarNoticiaInicio,
} from "@/app/actions/noticias";
import { EventosCarrusel } from "@/app/components/eventos-carrusel";
import { ImagenEager } from "@/app/components/imagen-eager";
import { fetchAppJson } from "@/lib/client/fetch-app";
import {
  EVENTOS_INICIO_SLOTS,
  type EventoInicioSlot,
  type UrlsEventosInicio,
} from "@/lib/escolar/eventos-inicio";
import {
  actualizarVersionesTrasUrls,
  eventosConImagenConCache,
  resolverUrlPreviewEvento,
  slotTieneImagenPublicada,
} from "@/lib/escolar/preview-evento";
import { prepararFormDataImagen } from "@/lib/imagen/form-data-cliente";
import {
  archivoAPreviewDataUrl,
  revocarPreviewSiBlob,
} from "@/lib/imagen/preview-cliente";
import { asegurarHttpsEnUrlsNoticias } from "@/lib/urls/seguras";

function PanelTab({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]">
      {children}
    </span>
  );
}

function GreyActionPill({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  const extra =
    variant === "danger"
      ? "from-rose-500 via-rose-600 to-rose-800"
      : "from-slate-400 via-slate-500 to-slate-600";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border border-white/70 bg-linear-to-b ${extra} px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export function PublicacionEventosDirectivo() {
  const [slot, setSlot] = useState<EventoInicioSlot>(1);
  const [urlsPublicadas, setUrlsPublicadas] = useState<UrlsEventosInicio | null>(
    null,
  );
  const [versionPorSlot, setVersionPorSlot] = useState<
    Partial<Record<EventoInicioSlot, number>>
  >({});
  const [previewLocal, setPreviewLocal] = useState<string | null>(null);
  const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(true);
  const [publicando, setPublicando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cargaInicialHecha = useRef(false);

  const cargarUrls = useCallback(
    async (opts?: { forzarVersionSlot?: EventoInicioSlot; silencioso?: boolean }) => {
      if (!opts?.silencioso) setCargando(true);
      setError(null);
      try {
        const urls = asegurarHttpsEnUrlsNoticias(
          await fetchAppJson<UrlsEventosInicio>(
            `/api/noticias-inicio?_=${Date.now()}`,
          ),
        );
        setUrlsPublicadas(urls);
        setVersionPorSlot((prev) =>
          actualizarVersionesTrasUrls(urls, prev, opts?.forzarVersionSlot),
        );
      } catch (e) {
        setUrlsPublicadas(null);
        setError(
          e instanceof Error ? e.message : "No se pudieron cargar los eventos.",
        );
      } finally {
        if (!opts?.silencioso) setCargando(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (cargaInicialHecha.current) return;
    cargaInicialHecha.current = true;
    void cargarUrls();
  }, [cargarUrls]);

  const limpiarBorrador = useCallback(() => {
    revocarPreviewSiBlob(previewLocal);
    setPreviewLocal(null);
    setArchivoNuevo(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [previewLocal]);

  const seleccionarSlot = useCallback(
    (nuevo: EventoInicioSlot) => {
      limpiarBorrador();
      setSlot(nuevo);
      setMensaje(null);
    },
    [limpiarBorrador],
  );

  const urlPreview = useMemo(
    () =>
      resolverUrlPreviewEvento({
        slot,
        urlsPublicadas,
        previewLocal,
        versionPorSlot,
      }),
    [slot, urlsPublicadas, previewLocal, versionPorSlot],
  );

  const tienePublicada = slotTieneImagenPublicada(urlsPublicadas, slot);
  const tieneBorrador = Boolean(archivoNuevo);

  async function onArchivoElegido(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    revocarPreviewSiBlob(previewLocal);
    setArchivoNuevo(file);

    if (!file) {
      setPreviewLocal(null);
      event.target.value = "";
      return;
    }

    try {
      setPreviewLocal(await archivoAPreviewDataUrl(file));
      setMensaje(
        tienePublicada
          ? `Nueva imagen lista — pulsa «Reemplazar» en evento ${slot}`
          : `Lista para publicar en evento ${slot}`,
      );
      setError(null);
    } catch (e) {
      setPreviewLocal(null);
      setArchivoNuevo(null);
      setMensaje(
        e instanceof Error ? e.message : "No se pudo previsualizar.",
      );
    }
    event.target.value = "";
  }

  function abrirSelector() {
    inputRef.current?.click();
  }

  async function onPublicarOReemplazar() {
    if (!archivoNuevo) {
      abrirSelector();
      setMensaje("Elige la imagen que quieres publicar o reemplazar.");
      return;
    }

    setPublicando(true);
    setMensaje(null);
    const fd = prepararFormDataImagen(archivoNuevo);
    const r = await actionPublicarNoticiaInicio(slot, fd);
    setPublicando(false);

    if (!r.ok) {
      setMensaje(r.error);
      return;
    }

    limpiarBorrador();
    await cargarUrls({ forzarVersionSlot: slot, silencioso: true });
    setMensaje(
      tienePublicada
        ? `Imagen del evento ${slot} reemplazada correctamente.`
        : `Imagen publicada en evento ${slot}.`,
    );
  }

  async function onEliminar() {
    if (!tienePublicada) return;
    setEliminando(true);
    setMensaje(null);

    const r = await actionEliminarNoticiaInicio(slot);
    setEliminando(false);

    if (!r.ok) {
      setMensaje(r.error);
      return;
    }

    limpiarBorrador();
    setUrlsPublicadas((prev) => {
      if (!prev) return prev;
      return { ...prev, [slot]: null };
    });
    setVersionPorSlot((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    await cargarUrls({ silencioso: true });
    setMensaje(`Imagen del evento ${slot} eliminada de Cloudinary.`);
  }

  const eventosCarrusel = useMemo(
    () =>
      urlsPublicadas
        ? eventosConImagenConCache(urlsPublicadas, versionPorSlot)
        : [],
    [urlsPublicadas, versionPorSlot],
  );

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section
        className="relative overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
        aria-label="Publicar evento"
      >
        <PanelTab>Sube o reemplaza noticias (inicio y perfiles)</PanelTab>

        <div className="relative z-[1] flex max-w-full flex-wrap items-center gap-2 px-1 pb-2">
          <GreyActionPill onClick={abrirSelector}>
            {tienePublicada ? "Elegir nueva imagen" : "Elegir imagen"}
          </GreyActionPill>
          <GreyActionPill
            onClick={onPublicarOReemplazar}
            disabled={publicando || !tieneBorrador}
          >
            {publicando
              ? "Subiendo…"
              : tienePublicada
                ? "Reemplazar"
                : "Publicar"}
          </GreyActionPill>
          {tienePublicada && (
            <GreyActionPill
              variant="danger"
              onClick={onEliminar}
              disabled={eliminando || tieneBorrador}
            >
              {eliminando ? "Eliminando…" : "Eliminar"}
            </GreyActionPill>
          )}
          <div className="flex max-w-full flex-wrap gap-1 rounded-full border border-white/60 bg-white/50 p-1">
            {EVENTOS_INICIO_SLOTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => seleccionarSlot(n)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${
                  slot === n ? "bg-sky-800 text-white" : "text-sky-900"
                } ${urlsPublicadas?.[n] ? "ring-1 ring-emerald-600/50" : ""}`}
              >
                Ev. {n}
              </button>
            ))}
          </div>
        </div>

        {tienePublicada && !tieneBorrador && (
          <p className="relative z-[1] px-2 pb-2 text-center text-[10px] font-semibold text-emerald-900">
            Evento {slot} tiene imagen en Cloudinary — puedes reemplazarla o
            eliminarla.
          </p>
        )}

        <div className="relative z-[1] min-h-[200px] overflow-hidden rounded-3xl border border-white/55 bg-slate-400/25 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          {urlPreview ? (
            <div className="relative min-h-[200px] w-full">
              <ImagenEager
                key={urlPreview}
                src={urlPreview}
                alt={`Vista previa evento ${slot}`}
                decoding="sync"
                className="absolute inset-0 h-full w-full object-contain"
              />
              <span className="absolute bottom-2 left-2 rounded-full bg-sky-950/80 px-2.5 py-1 text-[10px] font-bold uppercase text-white">
                Evento {slot}
                {tieneBorrador ? " · borrador" : " · publicada"}
              </span>
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center px-4 text-center text-sm font-semibold text-slate-700">
              {cargando
                ? "Cargando…"
                : `Sin imagen en evento ${slot} — elige una para publicar`}
            </div>
          )}
        </div>

        {(mensaje || error || cargando) && (
          <p className="relative z-[1] mt-2 px-2 text-center text-xs font-semibold text-sky-900">
            {cargando ? "Consultando Cloudinary…" : (mensaje ?? error)}
          </p>
        )}

        <input
          key={`file-evento-${slot}`}
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onArchivoElegido}
          aria-label="Seleccionar imagen del evento"
        />
      </section>

      <section
        className="relative overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
        aria-label="Vista de todos los eventos publicados"
      >
        <div className="relative z-[1] mb-3 flex justify-center">
          <PanelTab>Publicados (carrusel)</PanelTab>
        </div>
        <div className="relative z-[1] rounded-3xl border border-white/55 bg-slate-400/25 p-3 backdrop-blur-md">
          <EventosCarrusel eventos={eventosCarrusel} compacto />
        </div>
      </section>
    </div>
  );
}
