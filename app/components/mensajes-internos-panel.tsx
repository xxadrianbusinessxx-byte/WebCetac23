"use client";

/**
 * mensajes-internos-panel.tsx — mensajería privada entre personal: directivo,
 * técnico y profesor.
 *
 * ── Qué NO es ──────────────────────────────────────────────────────────────
 * No es el chat global que se retiró: aquel era alumno↔profesor y quedó
 * descartado por decisión del responsable. Este alcance es solo personal, y por
 * eso el destinatario se elige de una lista que el SERVIDOR calcula
 * (`actionDestinatariosInternos`) y no de una caja donde escribir un id.
 *
 * El remitente nunca viaja desde aquí: lo pone el servidor con la sesión.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionBandejaInterna,
  actionDestinatariosInternos,
  actionEnviarMensajeInterno,
  actionHiloInterno,
  type Destinatario,
} from "@/app/actions/mensajes-internos";
import type { HiloResumen, MensajeInternoRow } from "@/lib/escolar/mensajes-internos";

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
      {children}
    </p>
  );
}

export function MensajesInternosPanel() {
  const [hilos, setHilos] = useState<HiloResumen[] | null>(null);
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeInternoRow[]>([]);
  const [borrador, setBorrador] = useState("");
  const [nuevoPara, setNuevoPara] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const cargarBandeja = useCallback(() => {
    return Promise.resolve()
      .then(() => Promise.all([actionBandejaInterna(), actionDestinatariosInternos()]))
      .then(([h, d]) => {
        setHilos(h);
        setDestinatarios(d);
      });
  }, []);
  useEffect(() => { void cargarBandeja(); }, [cargarBandeja]);

  const abrirHilo = (hiloId: string) => {
    setAbierto(hiloId);
    void actionHiloInterno(hiloId).then((m) => {
      setMensajes(m);
      // Abrir marca leído en el servidor; refrescar la bandeja quita el
      // contador sin recargar la página.
      void cargarBandeja();
    });
  };

  const nombreDe = (id: number) => destinatarios.find((d) => d.id === id)?.nombre ?? `#${id}`;

  const enviar = (paraProfesor: number, hiloId: string | null) => {
    void actionEnviarMensajeInterno({ paraProfesor, cuerpo: borrador, hiloId }).then((r) => {
      if (!r.ok) return setMsg(r.error);
      setBorrador("");
      setMsg(null);
      abrirHilo(r.hiloId);
    });
  };

  if (hilos === null) return <Aviso>Cargando la bandeja…</Aviso>;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Bandeja */}
      <div className="flex flex-col gap-3 lg:w-80 lg:shrink-0">
        <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">
            Nuevo mensaje
          </h3>
          <select
            value={nuevoPara}
            onChange={(e) => setNuevoPara(e.target.value)}
            aria-label="Destinatario"
            className="w-full rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
          >
            <option value="">Elige a quién escribir…</option>
            {destinatarios.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
                {d.permisos ? ` · ${d.permisos}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!nuevoPara}
            onClick={() => {
              setAbierto(null);
              setMensajes([]);
            }}
            className="mt-3 w-full rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Empezar conversación
          </button>
        </div>

        {hilos.length === 0 ? (
          <Aviso>No tienes conversaciones.</Aviso>
        ) : (
          <div className="flex flex-col gap-2">
            {hilos.map((h) => (
              <button
                key={h.hiloId}
                type="button"
                onClick={() => abrirHilo(h.hiloId)}
                className={`rounded-lg border p-3 text-left transition hover:brightness-110 ${
                  abierto === h.hiloId
                    ? "border-[var(--oc-border-active)] bg-[var(--oc-surface)]"
                    : "border-[var(--oc-border)] bg-[var(--oc-input)]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-bold text-[var(--oc-text)]">
                    {nombreDe(h.conQuien)}
                  </p>
                  {h.sinLeer > 0 && (
                    <span className="shrink-0 rounded-full bg-[var(--oc-mint)] px-2 text-[10px] font-extrabold text-[var(--oc-navy)]">
                      {h.sinLeer}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-[var(--oc-muted)]">{h.ultimoCuerpo}</p>
                <p className="mt-1 text-[10px] text-[var(--oc-muted)]">{hora(h.ultimoAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Conversación */}
      <div className="flex min-h-[20rem] flex-1 flex-col gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        {msg && <Aviso>{msg}</Aviso>}
        {abierto === null && !nuevoPara ? (
          <Aviso>Elige una conversación, o empieza una nueva.</Aviso>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {mensajes.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-3"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
                    {nombreDe(m.de_profesor)} · {hora(m.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--oc-text)]">{m.cuerpo}</p>
                </div>
              ))}
              {abierto !== null && mensajes.length === 0 && <Aviso>Sin mensajes en este hilo.</Aviso>}
            </div>

            <div className="flex gap-2">
              <input
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                placeholder="Escribe un mensaje…"
                className="flex-1 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
              />
              <button
                type="button"
                disabled={!borrador.trim()}
                onClick={() => {
                  // Con hilo abierto se responde a quien está al otro lado;
                  // sin hilo, al destinatario elegido en el selector.
                  const destino = abierto
                    ? hilos.find((h) => h.hiloId === abierto)?.conQuien
                    : Number(nuevoPara);
                  if (destino === undefined || Number.isNaN(destino)) {
                    setMsg("Elige un destinatario.");
                    return;
                  }
                  enviar(destino, abierto);
                }}
                className="rounded-full border border-[var(--oc-mint)] bg-[var(--oc-mint)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-navy)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
