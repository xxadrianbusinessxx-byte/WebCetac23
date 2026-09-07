"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * FASE 9 — Instrumentación mínima de Web Vitals.
 *
 * Objetivo: distinguir el problema por capa (DB / servidor / red / JavaScript /
 * render-hydration). Sin dependencias nuevas y sin red adicional:
 *
 *  - Desarrollo: registra TTFB/FCP/LCP/CLS/INP en la consola del navegador.
 *  - Producción: solo si `NEXT_PUBLIC_WEB_VITALS === "1"` (opt-in), para no
 *    añadir carga con 1,000 usuarios concurrentes.
 *
 * Montado UNA sola vez en el layout raíz (no afecta el render; devuelve null).
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    const activo =
      process.env.NODE_ENV === "development" ||
      process.env.NEXT_PUBLIC_WEB_VITALS === "1";
    if (!activo) return;
    const valor =
      metric.name === "CLS"
        ? metric.value.toFixed(4)
        : `${Math.round(metric.value)} ms`;
    console.info(`[web-vitals] ${metric.name}: ${valor} (id=${metric.id})`);
  });
  return null;
}
