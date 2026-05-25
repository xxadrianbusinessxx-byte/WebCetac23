"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  actionEnviarMensajeChat,
  actionListarMensajesChat,
  actionSubirImagenChat,
} from "@/app/actions/chat";
import { imagenAClaveGuardado } from "@/lib/chat/comentario-codigo";
import { prepararFormDataImagen } from "@/lib/imagen/form-data-cliente";
import {
  archivoAPreviewDataUrl,
  revocarPreviewSiBlob,
} from "@/lib/imagen/preview-cliente";
import { demoProfilePorOrigen } from "@/lib/auth/demo-profiles";
import type { PortalSessionPayload } from "@/lib/auth/types";
import { CHAT_ORIGEN_NAV } from "@/lib/chat/constants";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type { ChatOrigen, MensajeChat } from "@/lib/chat/types";
import { ImagenEager } from "../components/imagen-eager";
import { FrutigerBackdrop } from "../components/frutiger-backdrop";
import { GlossyNavPill } from "../components/glossy-nav-pill";
import { GlossyPersonIcon } from "../components/glossy-person-icon";

function GreyPill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

function formatFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function MensajeFila({ mensaje }: { mensaje: MensajeChat }) {
  return (
    <li className="flex gap-3 sm:gap-4">
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-[3px] border-sky-900/60 bg-white/80 p-1.5 shadow-[0_6px_16px_rgba(14,165,233,0.15),inset_0_2px_0_rgba(255,255,255,0.95)] sm:h-[4.5rem] sm:w-[4.5rem]">
        <GlossyPersonIcon
          uid={`chat-${mensaje.id}`}
          genero={mensaje.genero}
          className="h-full w-full drop-shadow-[0_4px_8px_rgba(2,132,199,0.35)]"
        />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <GreyPill className="mb-2">
          {mensaje.remitenteNombre.toUpperCase()}
        </GreyPill>
        <div className="relative overflow-hidden rounded-full border border-white/60 bg-slate-400/40 px-4 py-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-sm">
          <p className="text-sm font-bold text-sky-950">{mensaje.texto}</p>
          {mensaje.imagenUrl && (
            <ImagenEager
              src={mensaje.imagenUrl}
              alt=""
              className="mt-2 max-h-40 rounded-xl object-contain"
            />
          )}
          <p className="mt-1 text-[10px] font-semibold text-slate-600">
            {formatFecha(mensaje.fecha)}
          </p>
          <div
            className="pointer-events-none absolute inset-x-6 top-1 h-[30%] rounded-b-[100%] bg-linear-to-b from-white/35 to-transparent"
            aria-hidden
          />
        </div>
      </div>
    </li>
  );
}

function parseOrigen(raw: string | null): ChatOrigen {
  if (raw === "profesor" || raw === "directivo") return raw;
  return "perfil";
}

type Props = { sesion: PortalSessionPayload | null };

export function ChatClient({ sesion }: Props) {
  const searchParams = useSearchParams();
  const origen = parseOrigen(searchParams.get("origen"));
  const nav = CHAT_ORIGEN_NAV[origen];
  const demo = demoProfilePorOrigen(origen);
  const usuario = sesion
    ? {
        matricula: sesion.matricula,
        nombre: sesion.nombre ?? sesion.matricula,
        genero: demo.genero,
      }
    : demo;

  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const [imagenArchivo, setImagenArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const inputImagenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let activo = true;
    actionListarMensajesChat().then((lista) => {
      if (activo) setMensajes(lista);
    });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

  async function onImagenElegida(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    revocarPreviewSiBlob(imagenPreview);
    setImagenArchivo(file);
    try {
      setImagenPreview(await archivoAPreviewDataUrl(file));
      setError(null);
    } catch (e) {
      setImagenArchivo(null);
      setImagenPreview(null);
      setError(e instanceof Error ? e.message : "No se pudo previsualizar.");
    }
    event.target.value = "";
  }

  function limpiarBorradorImagen() {
    revocarPreviewSiBlob(imagenPreview);
    setImagenPreview(null);
    setImagenArchivo(null);
  }

  function quitarAdjuntoAntesDeEnviar() {
    limpiarBorradorImagen();
  }

  async function onEnviar() {
    const contenido = texto.trim();
    if (!contenido && !imagenArchivo) return;

    setEnviando(true);
    setError(null);

    let urlCloudinary: string | null = null;
    if (imagenArchivo) {
      const fd = prepararFormDataImagen(imagenArchivo);
      const subida = await actionSubirImagenChat(fd);
      if (!subida.ok) {
        setEnviando(false);
        setError(subida.error);
        return;
      }
      urlCloudinary = subida.url;
    }

    const imagenClave = urlCloudinary
      ? imagenAClaveGuardado(urlCloudinary)
      : null;
    const imagenMostrar = urlCloudinary ?? imagenPreview;

    const textoMostrar = contenido || "(imagen)";

    const local: MensajeChat = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      remitenteMatricula: usuario.matricula,
      remitenteNombre: usuario.nombre.toUpperCase(),
      genero: usuario.genero,
      texto: textoMostrar,
      imagenUrl: imagenMostrar,
    };

    setMensajes((prev) => [...prev, local]);
    setTexto("");
    limpiarBorradorImagen();

    const resultado = await actionEnviarMensajeChat({
      texto: contenido,
      remitenteMatricula: usuario.matricula,
      remitenteNombre: usuario.nombre,
      genero: usuario.genero,
      imagenClave,
      imagenUrl: imagenClave,
    });

    setEnviando(false);

    if (!resultado.ok) {
      setError(resultado.error);
      setMensajes((prev) => prev.filter((m) => m.id !== local.id));
    } else {
      setMensajes((prev) =>
        prev.map((m) =>
          m.id === local.id
            ? {
                ...resultado.mensaje,
                remitenteNombre: resultado.mensaje.remitenteNombre.toUpperCase(),
                imagenUrl:
                  resultado.mensaje.imagenUrl ?? local.imagenUrl ?? null,
              }
            : m,
        ),
      );
    }
  }

  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        <div className="mb-6 flex h-14 items-center justify-center gap-3 rounded-full border-[3px] border-sky-800/55 bg-sky-200/45 px-3 py-2 shadow-[0_8px_28px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150 sm:mb-8 sm:h-16 sm:justify-between sm:px-6">
          <GlossyNavPill href={nav.href}>{nav.label}</GlossyNavPill>
          <GlossyNavPill href={`/chat?origen=${origen}`} active>
            Chat
          </GlossyNavPill>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150">
          <ul
            ref={listaRef}
            className="flex max-h-[min(52vh,28rem)] flex-1 flex-col gap-4 overflow-y-auto p-4 pr-3 sm:max-h-[min(58vh,32rem)] sm:gap-5 sm:p-6 [scrollbar-color:#0369a1_#e0f2fe] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sky-800 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-sky-100/80"
            aria-label="Mensajes del chat"
          >
            {mensajes.length === 0 ? (
              <li className="flex flex-1 items-center justify-center py-16 text-center text-sm font-semibold text-slate-600">
                Escribe un mensaje abajo para iniciar la conversación.
              </li>
            ) : (
              mensajes.map((m) => <MensajeFila key={m.id} mensaje={m} />)
            )}
          </ul>

          <footer className="border-t-[3px] border-sky-900/70 bg-linear-to-b from-sky-800 to-sky-950 p-4 sm:p-5">
            <GreyPill className="mb-3">{usuario.nombre.toUpperCase()}</GreyPill>

            {imagenPreview && (
              <div className="mb-3 flex items-center gap-2">
                <ImagenEager
                  src={imagenPreview}
                  alt="Vista previa"
                  decoding="sync"
                  className="max-h-20 rounded-xl border border-white/40 object-cover"
                />
                <button
                  type="button"
                  onClick={quitarAdjuntoAntesDeEnviar}
                  className="text-xs font-bold text-sky-100 underline"
                >
                  Quitar
                </button>
              </div>
            )}

            <label className="sr-only" htmlFor="chat-texto">
              Comentario
            </label>
            <textarea
              id="chat-texto"
              value={texto}
              maxLength={COMENTARIO_MAX_LENGTH}
              onChange={(e) =>
                setTexto(e.target.value.slice(0, COMENTARIO_MAX_LENGTH))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onEnviar();
                }
              }}
              placeholder="Comentario"
              rows={3}
              className="mb-1 w-full resize-none rounded-[1.25rem] border border-white/50 bg-slate-400/50 px-4 py-3 text-sm font-bold text-sky-950 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-sky-300/60"
            />
            <p className="mb-3 text-right text-[10px] font-semibold text-sky-100/90">
              {texto.length}/{COMENTARIO_MAX_LENGTH}
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => inputImagenRef.current?.click()}
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105"
              >
                Subir imagen
              </button>
              <button
                type="button"
                disabled={enviando || (!texto.trim() && !imagenArchivo)}
                onClick={onEnviar}
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:opacity-60"
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </div>

            {error && (
              <p className="mt-2 text-center text-xs font-semibold text-amber-200">
                {error}
              </p>
            )}

            <input
              ref={inputImagenRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onImagenElegida}
              aria-label="Subir imagen al chat"
            />
          </footer>
        </div>
      </div>
    </FrutigerBackdrop>
  );
}
