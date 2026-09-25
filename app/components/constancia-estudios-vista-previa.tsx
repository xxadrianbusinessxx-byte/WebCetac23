"use client";

/**
 * constancia-estudios-vista-previa.tsx — «Trámites escolares › Constancias de
 * estudios». La constancia del alumno elegido con el formato oficial del plantel,
 * lista para imprimir o guardar como PDF (2026-09-24).
 *
 * ── Una hoja, dos usos ─────────────────────────────────────────────────────
 * La misma `HojaConstancia` se pinta dos veces: en la pantalla, escalada al ancho
 * disponible, y en un portal directo en <body> que SOLO existe al imprimir. Todas
 * las medidas van en `cqw` (unidades del contenedor), así que la hoja es la misma
 * a cualquier tamaño: en pantalla, proporcional; impresa, tamaño carta exacto.
 * Imprimir desde el portal evita páginas en blanco por el resto del shell.
 *
 * El texto lo arma `constancia-puro.ts`. Aquí no se decide nada: se dibuja.
 * La firma y el sello se dejan en blanco para el director (ver ese módulo).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CARPETA_DECORACIONES_PUBLIC } from "@/lib/decoraciones/config";
import {
  armarConstancia,
  PLANTEL,
  type ConstanciaArmada,
  type DatosConstancia,
} from "@/lib/escolar/administracion/constancia-puro";

const img = (archivo: string) => `${CARPETA_DECORACIONES_PUBLIC}/${encodeURIComponent(archivo)}`;

/** `<img>` y no next/image: al imprimir, una imagen diferida sale en blanco. */
function ImagenHoja({ archivo, alt, style }: { archivo: string; alt: string; style: React.CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element -- ver comentario de la función
  return <img src={img(archivo)} alt={alt} loading="eager" decoding="sync" style={style} />;
}

function HojaConstancia({ c, guias }: { c: ConstanciaArmada; guias: boolean }) {
  const cuerpo: React.CSSProperties = { fontSize: "1.72cqw", lineHeight: 1.5, textAlign: "justify" };
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "8.5 / 11",
        background: "#fff",
        color: "#111",
        fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {/* Encabezado: Gobierno de México | Educación · las cuatro líneas · la bandera */}
      <div style={{ display: "flex", alignItems: "center", padding: "3.2cqw 7.5cqw 0 7.8cqw" }}>
        <ImagenHoja
          archivo="GobiernoDeMexicoLogo.png"
          alt="Gobierno de México"
          style={{ width: "18cqw", height: "7.4cqw", objectFit: "cover" }}
        />
        <ImagenHoja archivo="SepConstanciaLogo.png" alt="Educación, Secretaría de Educación Pública" style={{ width: "15cqw", marginLeft: "-0.8cqw" }} />
        <div style={{ flex: 1, textAlign: "right", fontSize: "1.55cqw", lineHeight: 1.45, paddingRight: "1.2cqw" }}>
          {PLANTEL.encabezado.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        <ImagenHoja archivo="ChicaBanderaLogoConstancia.jpeg" alt="" style={{ width: "9.8cqw", height: "10cqw", objectFit: "cover" }} />
      </div>

      <div style={{ padding: "0 15cqw 0 13cqw" }}>
        <p style={{ marginTop: "4.6cqw", textAlign: "right", fontWeight: 700, fontSize: "1.6cqw", letterSpacing: "0.12em" }}>
          ASUNTO: C O N S T A N C I A
        </p>

        <p style={{ marginTop: "6.4cqw", fontWeight: 700, fontSize: "1.6cqw", letterSpacing: "0.45em" }}>
          A QUIEN CORRESPONDA
        </p>

        <p style={{ ...cuerpo, marginTop: "4.3cqw" }}>
          El suscrito director del {PLANTEL.nombre}, C.C.T. {PLANTEL.cct}, ubicado en {PLANTEL.ubicacion}, por medio de
          la presente
        </p>

        <p style={{ marginTop: "7cqw", textAlign: "center", fontWeight: 700, fontSize: "1.6cqw" }}>HACE CONSTAR:</p>

        <p style={{ ...cuerpo, marginTop: "5.6cqw" }}>
          Que {c.tratamiento}&nbsp;&nbsp; <b>{c.nombre}</b>&nbsp;&nbsp; con el número de control {c.numeroControl} CURP{" "}
          {c.curp}, se encuentra <b>{c.inscrito}</b> actualmente en el <b>{c.semestre}</b> semestre de{" "}
          {PLANTEL.bachillerato}, en la carrera de <b>{c.carrera}</b>. Semestre del <b>{c.periodo}.</b>
        </p>

        <p style={{ ...cuerpo, marginTop: "8.4cqw" }}>
          Para los usos y fines legales que {c.interesado} convengan, se extiende la presente en {PLANTEL.lugarExpedicion},
          a {c.fechaEnLetras}.
        </p>

        {/* Firma: el nombre del director y un hueco encima para la firma a mano. */}
        <div style={{ position: "relative", marginTop: "8cqw", textAlign: "center", fontSize: "1.62cqw" }}>
          <p style={{ fontWeight: 700 }}>ATENTAMENTE</p>
          <div style={{ height: "8.6cqw", margin: "0 auto", width: "30cqw", border: guias ? "1px dashed #c9a227" : "none" }}>
            {guias && <span style={{ fontSize: "1.1cqw", color: "#a07d10" }}>firma del director</span>}
          </div>
          <p>{PLANTEL.director.nombre}</p>
          <p style={{ fontWeight: 700 }}>{PLANTEL.director.cargo}</p>
          {guias && (
            <div
              style={{
                position: "absolute", right: "-9cqw", top: "1.5cqw", width: "10cqw", height: "14cqw",
                border: "1px dashed #c9a227", borderRadius: "50%", fontSize: "1.1cqw", color: "#a07d10",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              sello
            </div>
          )}
        </div>
      </div>

      {/* Pie: 2026 año de Margarita Maza · domicilio y correo · raya gruesa */}
      <div style={{ position: "absolute", left: "10.5cqw", right: "14.5cqw", bottom: "8.6cqw", display: "flex", alignItems: "flex-end", gap: "6cqw" }}>
        <ImagenHoja archivo="2026AñoMragaritaMasaLogo.jpeg" alt="2026, año de Margarita Maza" style={{ width: "15cqw" }} />
        <div style={{ flex: 1 }}>
          {PLANTEL.pie.map((l) => (
            <div key={l} style={{ fontSize: "1.12cqw", lineHeight: 1.45, textAlign: "center" }}>
              {l}
            </div>
          ))}
          <div style={{ height: "0.55cqw", background: "#111", marginTop: "0.6cqw" }} />
        </div>
      </div>
    </div>
  );
}

export function ConstanciaEstudiosVistaPrevia({ datos }: { datos: Omit<DatosConstancia, "fecha"> }) {
  // La fecha se fija al montar: la constancia no debe cambiar de día a mitad de lectura.
  const [fecha] = useState(() => new Date());
  const c = armarConstancia({ ...datos, fecha });
  const lista = c.faltantes.length === 0;

  // El portal de impresión solo existe en el navegador (no en el render del servidor).
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMontado(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  function imprimir() {
    // El título de la página es el nombre que el navegador propone al guardar el PDF.
    const antes = document.title;
    document.title = `Constancia de estudios - ${c.nombre}`;
    window.print();
    document.title = antes;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3">
        {lista ? (
          <p className="text-sm text-[var(--oc-text)]">
            Lista para imprimir. Al imprimirla, déjala para la <strong>firma y el sello</strong> del director.
          </p>
        ) : (
          <p className="text-sm text-[var(--oc-alert-text)]">
            Faltan datos para emitirla: {c.faltantes.join(", ")}.
          </p>
        )}
        <button
          type="button"
          onClick={imprimir}
          disabled={!lista}
          className="rounded-full bg-[var(--oc-mint)] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[var(--oc-mint-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Imprimir / guardar PDF
        </button>
      </div>

      {/* En pantalla: la hoja escalada, con guías de dónde van firma y sello. */}
      <div className="mx-auto w-full max-w-3xl shadow-lg [container-type:inline-size]">
        <HojaConstancia c={c} guias />
      </div>

      {montado &&
        createPortal(
          <div id="constancia-impresion" style={{ containerType: "inline-size" }}>
            <HojaConstancia c={c} guias={false} />
          </div>,
          document.body,
        )}
      <style>{`
        #constancia-impresion { display: none; }
        @media print {
          @page { size: letter; margin: 0; }
          body > *:not(#constancia-impresion) { display: none !important; }
          #constancia-impresion { display: block !important; width: 8.5in; }
          html, body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
