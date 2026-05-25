"use client";

import { useCallback, useEffect, useState } from "react";
import { EventosCarrusel } from "@/app/components/eventos-carrusel";
import { fetchAppJson } from "@/lib/client/fetch-app";
import {
  eventosConImagen,
  type EventoInicioConImagen,
  type UrlsEventosInicio,
} from "@/lib/escolar/eventos-inicio";
import { urlEventoConCache } from "@/lib/escolar/preview-evento";
import { asegurarHttpsEnUrlsNoticias } from "@/lib/urls/seguras";

/** Versión en la URL de Cloudinary (/v123/) o timestamp de subida. */
function versionDesdeUrlCloudinary(url: string): number {
  const m = url.match(/\/v(\d+)\//);
  if (m) return Number(m[1]);
  const updated = url.match(/[?&]v=(\d+)/);
  if (updated) return Number(updated[1]);
  return Date.now();
}

function eventosDesdeUrls(urls: UrlsEventosInicio): EventoInicioConImagen[] {
  return eventosConImagen(urls).map((ev) => ({
    slot: ev.slot,
    url:
      urlEventoConCache(ev.url, versionDesdeUrlCloudinary(ev.url)) ?? ev.url,
  }));
}

export function EventosPerfil() {
  const [eventos, setEventos] = useState<EventoInicioConImagen[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargarEventos = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const urls = asegurarHttpsEnUrlsNoticias(
        await fetchAppJson<UrlsEventosInicio>(
          `/api/noticias-inicio?_=${Date.now()}`,
        ),
      );
      setEventos(eventosDesdeUrls(urls));
    } catch {
      setEventos([]);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      await cargarEventos();
      if (cancelado) return;
    })();

    const alEnfocar = () => {
      if (!cancelado) void cargarEventos(true);
    };
    window.addEventListener("focus", alEnfocar);
    return () => {
      cancelado = true;
      window.removeEventListener("focus", alEnfocar);
    };
  }, [cargarEventos]);

  if (cargando) {
    return (
      <p className="py-4 text-center text-xs font-semibold text-sky-900/80">
        Cargando eventos…
      </p>
    );
  }

  return <EventosCarrusel eventos={eventos} compacto />;
}
