"use client";

/**
 * boleta-vista.tsx — la boleta de calificaciones de UN alumno, armada en el
 * navegador (PROMPT X, 2026-10-24). La ven el alumno y su tutor en Perfil ›
 * Boleta, Administración escolar en Alumnos › Boleta y el directivo en Grupos/
 * Boleta › Consultar boleta de alumno: es la MISMA pieza, y qué ve cada uno lo
 * decide el servidor (`actionBoletaAlumno`).
 *
 * ── Solo pantalla ──────────────────────────────────────────────────────────
 * Es una vista previa informativa: no hay botón de imprimir y, si alguien imprime
 * la página, la hoja se oculta y queda un aviso. Se pide al servidor CADA VEZ que
 * se monta: lo que se ve es lo que hay ahora, no una copia guardada.
 *
 * El texto lo arma `boleta-puro.ts`; aquí no se decide nada, se dibuja. Mismo
 * molde que la constancia: medidas en `cqw` para que la hoja sea la misma a
 * cualquier tamaño, `<img>` y no next/image, colores de papel y no del tema.
 */
import { useEffect, useState } from "react";
import { actionBoletaAlumno } from "@/app/actions/boletas";
import { VisorConZoom } from "@/app/components/ui/visor-con-zoom";
import { CARPETA_DECORACIONES_PUBLIC } from "@/lib/decoraciones/config";
import type { VistaBoleta } from "@/lib/escolar/administracion/boleta";
import type { BoletaArmada } from "@/lib/escolar/administracion/boleta-puro";

/** Logo de la SEP: 364×160 y 10.6 KB, el mismo archivo que ya descarga la portada. */
const LOGO_SEP = `${CARPETA_DECORACIONES_PUBLIC}/SEPLogo.png`;

const CLASE_AVISO =
  "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]";
const CLASE_ERROR =
  "rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-4 py-3 text-xs font-semibold text-[var(--oc-alert-text)]";
const CLASE_SELECT =
  "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]";

const BORDE = "0.12cqw solid #444";

/** La hoja: carta horizontal, en blanco y negro, como un documento. */
export function HojaBoleta({ b }: { b: BoletaArmada }) {
  const dato = (rotulo: string, valor: string) => (
    <div style={{ display: "flex", gap: "0.8cqw", alignItems: "baseline" }}>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{rotulo}:</span>
      <span>{valor}</span>
    </div>
  );
  const celda: React.CSSProperties = { border: BORDE, padding: "0.55cqw 1cqw" };

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "11 / 8.5",
        background: "#fff",
        color: "#111",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: "3.2cqw 4.5cqw 3cqw",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "1.8cqw",
      }}
    >
      {/* Encabezado: logo SEP arriba a la izquierda; el título y el plantel al centro. */}
      <div style={{ display: "flex", alignItems: "center", gap: "2cqw" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- como la constancia: una imagen diferida sale en blanco */}
        <img src={LOGO_SEP} alt="Secretaría de Educación Pública" loading="eager" decoding="sync" style={{ width: "17cqw", height: "auto" }} />
        <div style={{ flex: 1, textAlign: "center", paddingRight: "17cqw" }}>
          <div style={{ fontSize: "2.3cqw", fontWeight: 800, letterSpacing: "0.12em" }}>{b.titulo}</div>
          <div style={{ fontSize: "1.35cqw", fontWeight: 700, marginTop: "0.6cqw" }}>{b.institucion}</div>
          <div style={{ fontSize: "1.15cqw", marginTop: "0.3cqw" }}>C.C.T. {b.cct}</div>
          <div style={{ fontSize: "1.4cqw", fontWeight: 700, marginTop: "0.8cqw" }}>
            {b.parcial}
            {b.duracion ? <span style={{ fontWeight: 400 }}> · {b.duracion}</span> : null}
          </div>
        </div>
      </div>

      {/* Datos del alumno. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "0.7cqw 3cqw",
          fontSize: "1.3cqw",
          borderTop: BORDE,
          borderBottom: BORDE,
          padding: "1.2cqw 0",
        }}
      >
        {dato("Nombre", b.nombre)}
        {dato("No. de control", b.numeroControl)}
        {dato("CURP", b.curp)}
        {dato("Grado y grupo", b.gradoGrupo)}
        <div style={{ gridColumn: "1 / -1" }}>{dato("Carrera", b.carrera)}</div>
      </div>

      {/* Materias y su calificación. */}
      <table style={{ width: "72%", margin: "0 auto", borderCollapse: "collapse", fontSize: "1.3cqw" }}>
        <thead>
          <tr style={{ background: "#e6e6e6" }}>
            <th style={{ ...celda, textAlign: "left" }}>Materia</th>
            <th style={{ ...celda, width: "26%", textAlign: "center" }}>Calificación</th>
          </tr>
        </thead>
        <tbody>
          {b.filas.length === 0 ? (
            <tr>
              <td style={{ ...celda, textAlign: "center", fontStyle: "italic" }} colSpan={2}>
                El grupo no tiene materias activas.
              </td>
            </tr>
          ) : (
            // El índice entra en la clave: dos materias del grupo pueden llamarse igual.
            b.filas.map((f, i) => (
              <tr key={`${i}-${f.materia}`}>
                <td style={celda}>{f.materia}</td>
                <td style={{ ...celda, textAlign: "center", fontStyle: f.estado === "calificada" ? "normal" : "italic" }}>
                  {f.calificacion}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr style={{ background: "#f2f2f2", fontWeight: 700 }}>
            <td style={celda}>Promedio general</td>
            <td style={{ ...celda, textAlign: "center" }}>{b.promedioGeneral}</td>
          </tr>
          <tr style={{ background: "#f2f2f2", fontWeight: 700 }}>
            <td style={celda}>Asistencia del parcial</td>
            <td style={{ ...celda, textAlign: "center" }}>{b.asistencia}</td>
          </tr>
        </tfoot>
      </table>

      <p style={{ textAlign: "center", fontSize: "1.15cqw", fontStyle: "italic", marginTop: "-0.6cqw" }}>{b.leyenda}</p>
    </div>
  );
}

/**
 * La boleta de un alumno, pedida al servidor al montar y cada vez que el personal
 * cambia de parcial. La familia no ve selector: su parcial lo pone la activación.
 */
export function BoletaAlumnoPanel({ curp }: { curp: string }) {
  const [pedido, setPedido] = useState("");
  const [respuesta, setRespuesta] = useState<{ clave: string; vista: VistaBoleta } | null>(null);
  const clave = `${curp}|${pedido}`;

  useEffect(() => {
    let vivo = true;
    actionBoletaAlumno({ curp, evaluacionId: pedido }).then((vista) => {
      if (vivo) setRespuesta({ clave: `${curp}|${pedido}`, vista });
    });
    return () => {
      vivo = false;
    };
  }, [curp, pedido]);

  // Al cambiar de parcial se sigue enseñando la boleta anterior hasta que llega la
  // nueva: sin esto el selector desaparecería a mitad del cambio.
  const vista = respuesta?.vista ?? null;
  const actualizando = Boolean(respuesta) && respuesta?.clave !== clave;

  return (
    <div className="flex flex-col gap-3">
      {!vista ? (
        <p className={CLASE_AVISO}>Armando la boleta…</p>
      ) : !vista.ok ? (
        <p className={CLASE_ERROR}>{vista.error}</p>
      ) : !vista.disponible ? (
        <p className={CLASE_AVISO}>{vista.mensaje}</p>
      ) : (
        <>
          {vista.puedeElegirParcial && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3">
              <label className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                Parcial
                <select className={CLASE_SELECT} value={vista.evaluacionId} onChange={(e) => setPedido(e.target.value)}>
                  {vista.parciales.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs font-semibold text-[var(--oc-text)]">
                {actualizando ? "Actualizando… " : ""}
                {vista.activada
                  ? `Activada para este alumno${vista.parcialActivado ? ` (en ${vista.parcialActivado})` : ""}.`
                  : "No está activada para este alumno: ni el alumno ni su tutor la ven todavía."}
              </span>
            </div>
          )}
          <div className="boleta-solo-pantalla">
            <VisorConZoom etiqueta="la boleta">
              <div className="shadow-lg [container-type:inline-size]">
                <HojaBoleta b={vista.boleta} />
              </div>
            </VisorConZoom>
          </div>
          <p className="boleta-aviso-impresion">La boleta solo se consulta en pantalla.</p>
          <style>{`
            .boleta-aviso-impresion { display: none; }
            @media print {
              .boleta-solo-pantalla { display: none !important; }
              .boleta-aviso-impresion { display: block !important; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
