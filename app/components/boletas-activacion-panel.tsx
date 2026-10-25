"use client";

/**
 * boletas-activacion-panel.tsx — Grupos/Boleta › Boleta del directivo (PROMPT X,
 * 2026-10-24). Sustituye a la subida manual de boletas, que desapareció.
 *
 *   Activación                 — las activaciones VIGENTES (con «Desactivar») y el
 *                                formulario: parcial · para quién (todo el
 *                                plantel, un grado o un grupo) · Activar.
 *   Consultar boleta de alumno — grupo → alumno → su boleta, esté activada o no.
 *
 * Qué modo es cuál lo decide `vistaBoletas` (contenido-directivo). El servidor
 * vuelve a validar todo con `validarActivacion`; aquí solo se elige. Las clases
 * van en constantes y no en componentes con nombre: C11 vigila las copias.
 */
import { useEffect, useState } from "react";
import {
  actionActivarBoleta,
  actionAlumnosDeGrupoBoleta,
  actionContextoActivacionBoletas,
  actionDesactivarBoleta,
} from "@/app/actions/boletas";
import { BoletaAlumnoPanel } from "@/app/components/boleta-vista";
import type { ContextoActivacionBoletas } from "@/lib/escolar/administracion/boleta";
import type { AlcanceBoleta } from "@/lib/escolar/administracion/boleta-puro";
import { vistaBoletas } from "@/lib/navegacion/contenido-directivo";

const CLASE_CAJA = "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-5";
const CLASE_TITULO = "mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]";
const CLASE_ETIQUETA = "mb-1 block px-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]";
const CLASE_CAMPO =
  "w-full rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]";
const CLASE_BOTON =
  "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const CLASE_BOTON_PRINCIPAL =
  "rounded-full bg-[var(--oc-mint)] px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-mint-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const CLASE_AVISO =
  "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]";
const CLASE_ERROR =
  "rounded-xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-3 py-2 text-xs font-semibold text-[var(--oc-alert-text)]";
const CLASE_OK = "rounded-xl border border-[var(--oc-ok)]/50 bg-[var(--oc-ok)]/15 px-3 py-2 text-xs font-semibold text-[var(--oc-ok)]";

const ALCANCES: { valor: AlcanceBoleta; rotulo: string }[] = [
  { valor: "plantel", rotulo: "Todo el plantel" },
  { valor: "grado", rotulo: "Un grado" },
  { valor: "grupo", rotulo: "Un grupo" },
];

type Contexto = Extract<ContextoActivacionBoletas, { ok: true }>;

export function BoletasActivacionPanel({ modo }: { modo: string | null }) {
  const [version, setVersion] = useState(0);
  const [ctx, setCtx] = useState<ContextoActivacionBoletas | null>(null);

  useEffect(() => {
    let vivo = true;
    actionContextoActivacionBoletas().then((ctx) => {
      if (vivo) setCtx(ctx);
    });
    return () => {
      vivo = false;
    };
  }, [version]);

  // Mientras se recarga tras activar o desactivar, se sigue enseñando lo anterior.
  if (!ctx) return <p className={CLASE_AVISO}>Cargando la configuración de boletas…</p>;
  if (!ctx.ok) return <p className={CLASE_ERROR}>{ctx.error}</p>;

  return vistaBoletas(modo) === "consultar" ? (
    <ConsultaBoletaPorGrupo ctx={ctx} />
  ) : (
    <ActivacionDeBoletas ctx={ctx} onCambio={() => setVersion((v) => v + 1)} />
  );
}

function ActivacionDeBoletas({ ctx, onCambio }: { ctx: Contexto; onCambio: () => void }) {
  const [evaluacionId, setEvaluacionId] = useState("");
  const [alcance, setAlcance] = useState<AlcanceBoleta>("plantel");
  const [grado, setGrado] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  // La vigente que una activación nueva SUSTITUIRÍA (mismo alcance, mismo dato).
  const sustituye = ctx.vigentes.find(
    (a) =>
      a.alcance === alcance &&
      (alcance !== "grado" || a.grado === grado) &&
      (alcance !== "grupo" || a.grupoId === grupoId),
  );
  const completo =
    Boolean(evaluacionId) && (alcance !== "grado" || Boolean(grado)) && (alcance !== "grupo" || Boolean(grupoId));

  // Revisar → confirmar, como el resto de las escrituras: «Activar» enseña qué se
  // va a activar y solo «Confirmar» escribe. Cambiar cualquier campo cancela la
  // revisión, porque lo revisado ya no es lo que se enviaría.
  const claveFormulario = [evaluacionId, alcance, grado, grupoId].join("|");
  const [revisado, setRevisado] = useState<string | null>(null);
  const enRevision = completo && revisado === claveFormulario;
  const resumen = (() => {
    const parcial = ctx.parciales.find((p) => p.id === evaluacionId)?.nombre ?? "";
    if (alcance === "grado") return `${parcial} · Grado ${grado}`;
    if (alcance === "grupo") return `${parcial} · Grupo ${ctx.grupos.find((g) => g.id === grupoId)?.etiqueta ?? ""}`;
    return `${parcial} · Todo el plantel`;
  })();

  async function activar() {
    setEnviando(true);
    setMensaje(null);
    const r = await actionActivarBoleta({ evaluacionId, alcance, grado, grupoId });
    setEnviando(false);
    setRevisado(null);
    setMensaje(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    if (r.ok) onCambio();
  }

  async function desactivar(id: string) {
    setEnviando(true);
    setMensaje(null);
    const r = await actionDesactivarBoleta({ id });
    setEnviando(false);
    setConfirmando(null);
    setMensaje(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    if (r.ok) onCambio();
  }

  return (
    <div className="flex flex-col gap-4">
      {!ctx.esquema && (
        <p className={CLASE_ERROR}>
          Falta aplicar <code>supabase/crear-boletas-activacion.sql</code> en Supabase. Hasta entonces se puede
          consultar la boleta de un alumno, pero no activarla.
        </p>
      )}

      <section className={CLASE_CAJA}>
        <p className={CLASE_TITULO}>Boletas activadas · ciclo {ctx.periodo.nombre}</p>
        {ctx.vigentes.length === 0 ? (
          <p className="text-xs font-semibold text-[var(--oc-muted)]">
            Ninguna. Los alumnos y sus tutores no ven ninguna boleta.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ctx.vigentes.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
              >
                <span className="text-xs font-semibold text-[var(--oc-text)]">
                  <span className="font-extrabold">{a.rotulo.parcial}</span> · {a.rotulo.alcance}
                  {a.rotulo.desde ? <span className="text-[var(--oc-muted)]"> · desde {a.rotulo.desde}</span> : null}
                </span>
                {confirmando === a.id ? (
                  <span className="flex gap-2">
                    <button type="button" className={CLASE_BOTON} disabled={enviando} onClick={() => void desactivar(a.id)}>
                      Sí, desactivar
                    </button>
                    <button type="button" className={CLASE_BOTON} disabled={enviando} onClick={() => setConfirmando(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button type="button" className={CLASE_BOTON} disabled={enviando} onClick={() => setConfirmando(a.id)}>
                    Desactivar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] font-semibold text-[var(--oc-muted)]">
          Si a un alumno le cubren varias, ve la de su grupo; si no hay, la de su grado; y si no, la del plantel.
        </p>
      </section>

      <section className={CLASE_CAJA}>
        <p className={CLASE_TITULO}>Activar una boleta</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={CLASE_ETIQUETA}>Parcial</span>
            <select className={CLASE_CAMPO} value={evaluacionId} onChange={(e) => setEvaluacionId(e.target.value)}>
              <option value="">Elige el parcial</option>
              {ctx.parciales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className={CLASE_ETIQUETA}>Para quién</legend>
            <div className="flex flex-wrap gap-2">
              {ALCANCES.map((a) => (
                <label
                  key={a.valor}
                  className={`cursor-pointer rounded-full border px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide ${
                    alcance === a.valor
                      ? "border-[var(--oc-border-active)] bg-[var(--oc-input)] text-[var(--oc-text)]"
                      : "border-[var(--oc-border)] text-[var(--oc-muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="alcance-boleta"
                    value={a.valor}
                    checked={alcance === a.valor}
                    onChange={() => setAlcance(a.valor)}
                    className="sr-only"
                  />
                  {a.rotulo}
                </label>
              ))}
            </div>
          </fieldset>
          {alcance === "grado" && (
            <label>
              <span className={CLASE_ETIQUETA}>Grado</span>
              <select className={CLASE_CAMPO} value={grado} onChange={(e) => setGrado(e.target.value)}>
                <option value="">Elige el grado</option>
                {ctx.grados.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          )}
          {alcance === "grupo" && (
            <label>
              <span className={CLASE_ETIQUETA}>Grupo</span>
              <select className={CLASE_CAMPO} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                <option value="">Elige el grupo</option>
                {ctx.grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {sustituye && completo && (
          <p className="mt-3 text-xs font-semibold text-[var(--oc-text)]">
            Sustituye a la que está vigente para ese alcance: {sustituye.rotulo.parcial} · {sustituye.rotulo.alcance}.
          </p>
        )}
        {enRevision && (
          <p className="mt-3 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-text)]">
            Vas a activar <span className="font-extrabold">{resumen}</span>. Los alumnos que cubre y sus tutores la
            verán en Perfil › Boleta en cuanto confirmes.
          </p>
        )}
        {mensaje && <p className={`mt-3 ${mensaje.ok ? CLASE_OK : CLASE_ERROR}`}>{mensaje.texto}</p>}
        <div className="mt-4 flex justify-end gap-2">
          {enRevision ? (
            <>
              <button type="button" className={CLASE_BOTON} disabled={enviando} onClick={() => setRevisado(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={CLASE_BOTON_PRINCIPAL}
                disabled={enviando || !ctx.esquema}
                onClick={() => void activar()}
              >
                {enviando ? "Guardando…" : "Confirmar activación"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={CLASE_BOTON_PRINCIPAL}
              disabled={!completo || enviando || !ctx.esquema}
              onClick={() => {
                setMensaje(null);
                setRevisado(claveFormulario);
              }}
            >
              Activar
            </button>
          )}
        </div>
        <p className="mt-3 text-[11px] font-semibold text-[var(--oc-muted)]">
          La boleta enseña las calificaciones que los profesores tengan subidas en el momento en que se consulta, hasta
          que la desactives.
        </p>
      </section>
    </div>
  );
}

function ConsultaBoletaPorGrupo({ ctx }: { ctx: Contexto }) {
  const [grupoId, setGrupoId] = useState("");
  const [respuesta, setRespuesta] = useState<{
    grupoId: string;
    r: Awaited<ReturnType<typeof actionAlumnosDeGrupoBoleta>>;
  } | null>(null);
  const [curp, setCurp] = useState("");

  useEffect(() => {
    if (!grupoId) return;
    let vivo = true;
    actionAlumnosDeGrupoBoleta({ grupoId }).then((r) => {
      if (vivo) setRespuesta({ grupoId, r });
    });
    return () => {
      vivo = false;
    };
  }, [grupoId]);

  const lista = respuesta?.grupoId === grupoId ? respuesta.r : null;
  const elegido = lista?.ok ? lista.alumnos.find((a) => a.curp === curp) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <section className={CLASE_CAJA}>
        <label className="block max-w-md">
          <span className={CLASE_ETIQUETA}>Grupo</span>
          <select
            className={CLASE_CAMPO}
            value={grupoId}
            onChange={(e) => {
              setGrupoId(e.target.value);
              setCurp("");
            }}
          >
            <option value="">Elige el grupo</option>
            {ctx.grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.etiqueta}
              </option>
            ))}
          </select>
        </label>

        {grupoId && !lista && <p className="mt-3 text-xs font-semibold text-[var(--oc-muted)]">Cargando alumnos…</p>}
        {lista && !lista.ok && <p className={`mt-3 ${CLASE_ERROR}`}>{lista.error}</p>}
        {lista?.ok && lista.alumnos.length === 0 && (
          <p className="mt-3 text-xs font-semibold text-[var(--oc-muted)]">El grupo no tiene alumnos inscritos.</p>
        )}
        {lista?.ok && lista.alumnos.length > 0 && (
          <ul className="mt-3 grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {lista.alumnos.map((a) => (
              <li key={a.curp}>
                <button
                  type="button"
                  onClick={() => setCurp(a.curp)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold transition hover:brightness-110 ${
                    a.curp === curp
                      ? "border-[var(--oc-border-active)] bg-[var(--oc-input)] text-[var(--oc-text)]"
                      : "border-[var(--oc-border)] text-[var(--oc-text)]"
                  }`}
                >
                  {a.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {elegido ? (
        <BoletaAlumnoPanel key={elegido.curp} curp={elegido.curp} />
      ) : (
        grupoId && lista?.ok && lista.alumnos.length > 0 && <p className={CLASE_AVISO}>Elige un alumno para ver su boleta.</p>
      )}
    </div>
  );
}
