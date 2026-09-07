"use client";

// PROMPT-3/T4 — Cambio forzado de clave en el primer acceso (A4).
// Si la sesión trae debeCambiarCredenciales, el profesor/directivo/técnico NO
// puede usar el portal hasta definir una nueva clave. La Server Action
// (actionCambiarClaveProfesor, capacidad profesor.cambiar_clave_propia) valida
// la identidad SOLO por cookie (profesorId) y limpia el flag en la BD y en la
// cookie. Este componente se usa en las consolas que aterrizan tras el login
// (profesor/directivo ya lo tenían embebido; configuracion lo usa para el
// rol técnico).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { actionCambiarClaveProfesor } from "@/app/actions/profesores";
import { FrutigerBackdrop } from "@/app/components/ui/frutiger-backdrop";
import { GlossyPersonIcon } from "@/app/components/ui/glossy-person-icon";

function GreyActionPill({
  children,
  className = "",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/** Pantalla completa (cabecera + formulario) para cuando una página server
 *  detecta debeCambiarCredenciales y bloquea antes de montar la consola. */
export function PantallaCambioClaveForzado({
  nombre,
  uidAvatar,
}: {
  nombre: string;
  uidAvatar: string;
}) {
  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        <div className="mb-6 flex flex-col items-stretch gap-4 sm:mb-8 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] border-[3px] border-sky-900/70 bg-white/75 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.2),inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-md sm:h-32 sm:w-32">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/90 to-sky-300/50">
              <GlossyPersonIcon
                uid={uidAvatar}
                genero="femenino"
                className="h-[82%] w-[82%] drop-shadow-[0_6px_12px_rgba(2,132,199,0.4)]"
              />
              <div
                className="pointer-events-none absolute inset-x-2 top-1 h-[40%] rounded-b-[100%] bg-linear-to-b from-white/60 to-transparent"
                aria-hidden
              />
            </div>
          </div>
          <div className="flex min-h-[4.5rem] min-w-0 flex-1 items-stretch overflow-hidden rounded-full border-[3px] border-sky-900/70 bg-linear-to-r from-sky-900 via-sky-900 to-sky-900/90 shadow-[0_8px_24px_rgba(2,6,23,0.12)] backdrop-blur-sm sm:min-h-[5.5rem]">
            <div className="w-10 shrink-0 bg-sky-950 sm:w-12" aria-hidden />
            <div className="relative flex flex-1 items-center justify-center bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4">
              <span className="text-lg font-extrabold tracking-wide text-white drop-shadow-sm sm:text-xl">
                {nombre}
              </span>
              <div
                className="pointer-events-none absolute inset-x-6 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/35 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        </div>
        <CambioClaveForzado />
      </div>
    </FrutigerBackdrop>
  );
}

export function CambioClaveForzado() {
  const router = useRouter();
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [mensajeClave, setMensajeClave] = useState<string | null>(null);

  async function onGuardarClave() {
    setMensajeClave(null);
    if (nuevaClave.trim().length < 6) {
      setMensajeClave("La nueva clave debe tener al menos 6 caracteres.");
      return;
    }
    if (nuevaClave !== confirmarClave) {
      setMensajeClave("Las claves no coinciden.");
      return;
    }
    setGuardandoClave(true);
    const r = await actionCambiarClaveProfesor(nuevaClave);
    setGuardandoClave(false);
    if (r.ok) {
      router.refresh();
    } else {
      setMensajeClave(r.error);
    }
  }

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-amber-400/60 bg-amber-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md sm:p-6">
        <p className="mb-2 text-center text-xs font-extrabold uppercase tracking-wide text-amber-800">
          Cambia tu clave para continuar
        </p>
        <p className="mb-4 text-center text-xs font-semibold text-amber-900">
          La administración te pidió definir una nueva clave antes de usar el
          portal.
        </p>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={nuevaClave}
            onChange={(e) => setNuevaClave(e.target.value)}
            placeholder="Nueva clave (mínimo 6 caracteres)"
            className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
          />
          <input
            type="password"
            value={confirmarClave}
            onChange={(e) => setConfirmarClave(e.target.value)}
            placeholder="Confirmar clave"
            className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
          />
          <div className="flex justify-center">
            <GreyActionPill onClick={() => void onGuardarClave()} disabled={guardandoClave}>
              {guardandoClave ? "Guardando…" : "Guardar clave"}
            </GreyActionPill>
          </div>
        </div>
        {mensajeClave && (
          <p className="mt-3 text-center text-xs font-semibold text-red-700" role="alert">
            {mensajeClave}
          </p>
        )}
      </div>
    </div>
  );
}
