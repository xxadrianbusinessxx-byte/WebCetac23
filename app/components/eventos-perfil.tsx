"use client";

import { useEffect, useRef, useState } from "react";
import { EventosCarrusel } from "@/app/components/eventos-carrusel";
import { fetchAppJson } from "@/lib/client/fetch-app";
import {
  eventosConImagen,
  type EventoInicioConImagen,
  type UrlsEventosInicio,
} from "@/lib/escolar/eventos-inicio";
import { asegurarHttpsEnUrlsNoticias } from "@/lib/urls/seguras";

export function EventosPerfil() {
  const [eventos, setEventos] = useState<EventoInicioConImagen[]>([]);
  const [cargando, setCargando] = useState(true);
  const cargadoRef = useRef(false);

  useEffect(() => {
    if (cargadoRef.current) return;
    cargadoRef.current = true;

    let cancelado = false;
    setCargando(true);

    void fetchAppJson<UrlsEventosInicio>("/api/noticias-inicio")
      .then((urls) => {
        if (cancelado) return;
        setEventos(eventosConImagen(asegurarHttpsEnUrlsNoticias(urls)));
      })
      .catch(() => {
        if (!cancelado) setEventos([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (cargando) {
    return (
      <p className="py-4 text-center text-xs font-semibold text-sky-900/80">
        Cargando eventos…
      </p>
    );
  }

  return <EventosCarrusel eventos={eventos} compacto />;
}
