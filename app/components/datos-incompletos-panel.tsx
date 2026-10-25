"use client";

/**
 * datos-incompletos-panel.tsx — Notificaciones de Administración escolar:
 * a qué alumnos del ciclo les falta información primordial. 2026-10-25.
 *
 * Qué pinta y por qué así. La medición del día que se escribió (472 alumnos,
 * 454 inscritos) decía: 0 sin nombre, 0 con CURP mal formada y 471 sin número
 * de control. Un aviso por alumno habría sido la misma frase 471 veces, así que
 * esto es un RESUMEN arriba —que es lo que se lee— y la lista debajo, filtrable
 * por el dato que falta.
 *
 * Es solo lectura. Corregir el dato se sigue haciendo en el expediente del
 * alumno (Alumnos › Datos personales, y el número de control en Trámites), que
 * es donde vive esa escritura: duplicarla aquí sería un segundo camino para lo
 * mismo.
 *
 * Las clases se declaran como constantes y no como componentes con nombre: C11
 * (`test-orden`) vigila que una pieza de presentación no se redeclare en `app/`.
 */
import { useEffect, useState } from "react";
import { actionDatosIncompletosDelCiclo } from "@/app/actions/administracion";
import type { DatosIncompletosDelCiclo } from "@/lib/escolar/alumno/datos-incompletos";
import {
  CAMPOS_PRIMORDIALES,
  ROTULO_CAMPO,
  filtrarPorCampo,
  mensajeDatosIncompletos,
  type CampoPrimordial,
} from "@/lib/escolar/alumno/datos-incompletos-puro";

const CLASE_CAJA = "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6";
const CLASE_AVISO = "rounded-2xl border border-amber-400/50 bg-amber-100 px-4 py-3 text-[11px] font-semibold text-amber-900";
const CLASE_OK = "rounded-2xl border border-emerald-400/50 bg-emerald-100 px-4 py-3 text-[11px] font-semibold text-emerald-900";
const CLASE_ERROR = "rounded-2xl border border-red-300/70 bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-800";
const CLASE_ETIQUETA = "mb-1 block px-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]";
const CLASE_DATO = "text-[11px] font-semibold text-[var(--oc-text)]";
const CLASE_CHIP =
  "rounded-full border border-amber-400/60 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-900";

/** El modo del mapa de navegación decide qué dato filtra la lista. */
function campoDelModo(modo: string | null): CampoPrimordial | null {
  const m = (modo ?? "").toLowerCase();
  if (m.startsWith("número de control") || m.startsWith("numero de control")) return "numero_control";
  if (m.startsWith("nombre")) return "nombre";
  if (m.startsWith("curp")) return "curp";
  return null;
}

export function DatosIncompletosPanel({ modo }: { modo: string | null }) {
  const [datos, setDatos] = useState<DatosIncompletosDelCiclo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noAutorizado, setNoAutorizado] = useState(false);

  // Una sola lectura al montar. `cargando` ya nace en true: ponerlo aquí sería
  // un setState síncrono dentro del efecto (y el lint lo rechaza, con razón).
  useEffect(() => {
    let vivo = true;
    actionDatosIncompletosDelCiclo().then((r) => {
      if (!vivo) return;
      if (!r) setNoAutorizado(true);
      else setDatos(r);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (cargando) return <p className={CLASE_DATO}>Revisando el roster del ciclo…</p>;
  if (noAutorizado) return <p className={CLASE_ERROR}>No autorizado.</p>;
  if (!datos) return null;
  if (!datos.ok) {
    return <p className={CLASE_ERROR}>{datos.error ?? "No se pudo revisar el roster."}</p>;
  }

  const campo = campoDelModo(modo);
  const lista = filtrarPorCampo(datos.alumnos, campo);
  const mensaje = mensajeDatosIncompletos(datos.resumen);

  return (
    <div className="flex flex-col gap-4">
      <div className={CLASE_CAJA}>
        <p className={CLASE_ETIQUETA}>Ciclo {datos.ciclo ?? "operativo"}</p>
        {mensaje ? <p className={CLASE_AVISO}>{mensaje}</p> : null}
        {!mensaje ? (
          <p className={CLASE_OK}>
            Los {datos.resumen.revisados} alumnos del ciclo tienen CURP, nombre completo y número de control.
          </p>
        ) : null}
        {mensaje ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {CAMPOS_PRIMORDIALES.filter((c) => datos.resumen.porCampo[c] > 0).map((c) => (
              <li key={c} className={CLASE_CHIP}>
                {datos.resumen.porCampo[c]} sin {ROTULO_CAMPO[c]}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 px-2 text-[10px] font-semibold text-[var(--oc-muted)]">
          Se revisa el roster ACTIVO del ciclo operativo. El número de control se captura en Trámites
          escolares › Constancias; el nombre y la CURP, en Alumnos › Datos personales.
        </p>
      </div>

      {lista.length > 0 ? (
        <div className={CLASE_CAJA}>
          <p className={CLASE_ETIQUETA}>
            {campo ? `Alumnos sin ${ROTULO_CAMPO[campo]}` : "Alumnos con algo pendiente"} · {lista.length}
          </p>
          <ul className="flex flex-col gap-2">
            {lista.map((a) => (
              <li key={a.curp} className="flex flex-wrap items-center gap-2">
                <span className={CLASE_DATO}>
                  {a.nombre}
                  {a.grupo ? ` · ${a.grupo}` : ""} · {a.curp}
                </span>
                {a.faltantes.map((f) => (
                  <span key={f} className={CLASE_CHIP}>
                    falta {ROTULO_CAMPO[f]}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mensaje && lista.length === 0 && campo ? (
        <p className={CLASE_OK}>Ningún alumno del ciclo tiene pendiente «{ROTULO_CAMPO[campo]}».</p>
      ) : null}
    </div>
  );
}
