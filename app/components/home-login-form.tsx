"use client";

import { useActionState } from "react";
import { loginWithNombreCompleto, type LoginFormState } from "@/app/actions/login";

import { GuiPasos } from "@/app/components/gui-pasos";

const PASOS_LOGIN = [
  "Escribe tu nombre completo (tal como aparece en el plantel).",
  "Escribe tu clave en el segundo campo.",
  "Pulsa «Entrar».",
  "Alumnos van a su perfil; profesores y directivos a su panel correspondiente.",
] as const;

function BubbleField({
  label,
  variant,
}: {
  label: string;
  variant: "nombreCompleto" | "clave";
}) {
  const isClave = variant === "clave";
  const shell = isClave
    ? "border-white/40 bg-linear-to-b from-sky-600 via-sky-700 to-sky-900 text-white placeholder:text-sky-100/85 shadow-[0_8px_24px_rgba(2,132,199,0.35),inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-3px_0_rgba(0,0,0,0.2)]"
    : "border-white/60 bg-linear-to-b from-slate-100 via-slate-200/95 to-slate-300/90 text-slate-800 placeholder:text-slate-500 shadow-[0_6px_20px_rgba(15,23,42,0.08),inset_0_2px_0_rgba(255,255,255,0.9),inset_0_-2px_0_rgba(15,23,42,0.06)]";

  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <input
        type={isClave ? "password" : "text"}
        name={isClave ? "clave" : "nombreCompleto"}
        required
        placeholder={label}
        autoComplete={isClave ? "current-password" : "name"}
        className={`w-full rounded-full border px-6 py-4 text-center text-sm font-extrabold uppercase tracking-widest outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 ${shell}`}
      />
      <span
        className="pointer-events-none absolute inset-x-8 top-1 h-[32%] rounded-b-[100%] bg-linear-to-b from-white/45 to-transparent opacity-80"
        aria-hidden
      />
    </label>
  );
}

const initialState: LoginFormState = {};

export function HomeLoginForm() {
  const [state, formAction, pending] = useActionState(
    loginWithNombreCompleto,
    initialState,
  );

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <GuiPasos titulo="¿Cómo iniciar sesión?" pasos={PASOS_LOGIN} />
      <form className="flex flex-col gap-4" action={formAction} noValidate>
      <BubbleField label="Nombre completo" variant="nombreCompleto" />
      <BubbleField label="Clave" variant="clave" />
      {state.error ? (
        <p
          className="text-center text-xs font-semibold uppercase tracking-wide text-red-600"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="relative mt-2 overflow-hidden rounded-full border border-white/50 bg-linear-to-b from-sky-300 via-sky-500 to-sky-700 px-8 py-3.5 text-sm font-extrabold uppercase tracking-widest text-white shadow-[0_8px_24px_rgba(14,165,233,0.45),inset_0_2px_0_rgba(255,255,255,0.55),inset_0_-3px_0_rgba(0,0,0,0.4)] transition enabled:active:scale-[0.98] disabled:opacity-60 before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-[44%] before:rounded-b-[100%] before:bg-linear-to-b before:from-white/65 before:to-transparent"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
      </form>
    </div>
  );
}
