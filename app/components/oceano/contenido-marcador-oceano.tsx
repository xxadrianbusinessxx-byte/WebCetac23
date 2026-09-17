/**
 * contenido-marcador-oceano.tsx — cuerpo del shell Océano (MARCADOR).
 *
 * Fase 1 no mete componentes reales: aquí solo se declara DÓNDE estamos
 * (rol → pestaña → apartado → modo) para que las fases 2-7 puedan sustituir
 * este bloque por el componente verdadero sin tocar la navegación.
 *
 * Dos casos que NO son el mismo y se dibujan distinto:
 *   · Pestaña sin apartado activo (p. ej. Chat, cuyo único apartado está
 *     apagado) → se muestra el texto exacto del mapa (`textoApagado`).
 *   · Apartado apagado → nunca llega aquí: no es navegable.
 *
 * La tira «paleta en uso» es un artefacto de la Fase 1: sirve para revisar el
 * contraste de los tokens nuevos sobre superficie oscura y para dejar a la
 * vista las dos reglas críticas (--oc-alert solo como punto; su texto es
 * --oc-alert-text). Desaparece cuando entre el contenido real.
 */
import Link from "next/link";
import type { PortalRole } from "@/lib/auth/types";
import { textoApagado, type Apartado, type Pestana } from "@/lib/navegacion/mapa-navegacion";
import { ROTULO_ROL } from "./nav-superior-oceano";

function MuestraPaleta() {
  const filas: { papel: string; token: string; nota: string }[] = [
    { papel: "Superficie", token: "--oc-surface", nota: "tarjetas de contenido" },
    { papel: "Sidebar", token: "--oc-sidebar", nota: "panel lateral" },
    { papel: "Campo", token: "--oc-input", nota: "inputs y grupos" },
    { papel: "Texto", token: "--oc-text", nota: "títulos y cuerpo" },
    { papel: "Secundario", token: "--oc-muted", nota: "metadatos (6.9:1)" },
    { papel: "Borde", token: "--oc-border", nota: "separadores" },
  ];
  return (
    <div className="mt-6 rounded-xl border border-[var(--oc-border)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--oc-muted)]">
        Paleta en uso (revisión de contraste · artefacto de Fase 1)
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filas.map((f) => (
          <li key={f.token} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-6 w-6 shrink-0 rounded-md border border-[var(--oc-border)]"
              style={{ background: `var(${f.token})` }}
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[var(--oc-text)]">
                {f.papel}
              </span>
              <span className="block truncate text-[10px] text-[var(--oc-muted)]">{f.nota}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--oc-border)] pt-3">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--oc-alert)]" />
          <span className="text-xs font-semibold text-[var(--oc-alert-text)]">
            Inasistencia (--oc-alert-text)
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--oc-ok)]" />
          <span className="text-xs font-semibold text-[var(--oc-text)]">Vigente (--oc-ok)</span>
        </span>
        <span className="text-[10px] text-[var(--oc-muted)]">
          «Punto» y «texto de estado» usan tokens distintos: no se intercambian.
        </span>
      </div>
    </div>
  );
}

function PanelMarcador({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-6 sm:p-8">
      {children}
    </section>
  );
}

export function ContenidoMarcadorOceano({
  rol,
  pestana,
  apartado,
  modo,
  piezaSinDatos = false,
}: {
  rol: PortalRole | null;
  /** Pestaña activa del mapa. */
  pestana: Pestana | null;
  /** Apartado activo (nunca uno apagado). */
  apartado: Apartado | null;
  modo: string | null;
  /** Fase 2 — este hueco YA tiene pieza real, pero la sesión no trajo datos
   *  (el cableado de datos de ese rol llega en su propia fase). */
  piezaSinDatos?: boolean;
}) {
  if (!rol) {
    return (
      <PanelMarcador>
        <h1 className="text-xl font-bold text-[var(--oc-text)]">Sin sesión</h1>
        <p className="mt-2 text-sm text-[var(--oc-muted)]">
          El shell Océano se parametriza por rol; sin sesión no hay pestañas que dibujar.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-[var(--oc-mint)] px-5 py-2 text-sm font-bold text-[var(--oc-mint-ink)]"
        >
          Ir al acceso
        </Link>
      </PanelMarcador>
    );
  }

  if (!pestana) {
    return (
      <PanelMarcador>
        <h1 className="text-xl font-bold text-[var(--oc-text)]">Sin pestañas</h1>
        <p className="mt-2 text-sm text-[var(--oc-muted)]">
          El mapa de navegación no define ninguna pestaña para el rol {ROTULO_ROL[rol]}.
        </p>
      </PanelMarcador>
    );
  }

  if (!apartado) {
    // La pestaña existe para este rol, pero todos sus apartados están apagados.
    const aviso = pestana.apartados.map(textoApagado).find((t) => t !== null) ?? null;
    return (
      <PanelMarcador>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--oc-muted)]">
          {ROTULO_ROL[rol]} · {pestana.label}
        </p>
        <h1 className="mt-2 text-xl font-bold text-[var(--oc-text)]">{pestana.label}</h1>
        <p className="mt-2 text-sm text-[var(--oc-muted)]">
          {aviso ?? "Esta pestaña aún no tiene apartados activos."}
        </p>
      </PanelMarcador>
    );
  }

  return (
    <PanelMarcador>
      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--oc-muted)]">
        {ROTULO_ROL[rol]} · {pestana.label}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--oc-text)]">{apartado.label}</h1>
      <p className="mt-1 text-sm text-[var(--oc-muted)]">
        {modo ? `Sub-vista: ${modo}` : "Sin sub-vistas en este apartado."}
      </p>

      <p className="mt-5 rounded-xl border border-dashed border-[var(--oc-border)] p-4 text-sm text-[var(--oc-muted)]">
        <span className="font-semibold text-[var(--oc-text)]">Marcador de contenido.</span>{" "}
        {piezaSinDatos
          ? "Este hueco ya tiene su pieza reubicada (Fase 2), pero la sesión no trajo los datos: el cableado de datos de este rol llega en su propia fase (4 y 5-6)."
          : "Aquí entra el componente real del apartado (fases 2-7)."}{" "}
        Identificador para cablearlo:{" "}
        <code className="font-mono text-xs text-[var(--oc-text)]">
          {pestana.id} / {apartado.id}
          {modo ? ` / ${modo}` : ""}
        </code>
        .
      </p>

      <MuestraPaleta />
    </PanelMarcador>
  );
}
