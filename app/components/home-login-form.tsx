"use client";

import { useActionState } from "react";
import { loginWithNombreCompleto, type LoginFormState } from "@/app/actions/login";

/**
 * Formulario de acceso. La lógica NO cambió en el rediseño Océano: sigue
 * enviando a `loginWithNombreCompleto`, con los mismos campos
 * (`identificador`, `clave`) y el mismo mecanismo de sesión.
 *
 * Lo que cambió es el envoltorio. El tema claro construía cada campo con un
 * degradado de tres paradas y un brillo superior simulado con un `<span>`
 * absoluto — la burbuja Frutiger Aero. Sobre superficie oscura ese brillo es
 * una raya, así que desaparece: los campos son planos, con el borde del
 * sistema, y el foco se marca con `--oc-border-active` en vez de un anillo de
 * color.
 */
function Campo({ label, variant }: { label: string; variant: "identificador" | "clave" }) {
  const esClave = variant === "clave";
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--oc-muted)]">{label}</span>
      <input
        type={esClave ? "password" : "text"}
        name={esClave ? "clave" : "identificador"}
        required
        placeholder={esClave ? "••••••••" : "Ej. Juan Pérez López"}
        autoComplete={esClave ? "current-password" : "name"}
        className="w-full rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm text-[var(--oc-text)] outline-none transition placeholder:text-[var(--oc-muted)] focus:border-[var(--oc-border-active)]"
      />
    </label>
  );
}

const initialState: LoginFormState = {};

export function HomeLoginForm() {
  const [state, formAction, pending] = useActionState(loginWithNombreCompleto, initialState);

  return (
    <form className="flex flex-col gap-5" action={formAction} noValidate>
      <Campo label="Nombre completo" variant="identificador" />
      <Campo label="Clave" variant="clave" />

      {state.error ? (
        <p className="text-center text-xs font-semibold text-[var(--oc-alert-text)]" role="alert">
          {state.error}
        </p>
      ) : null}

      {/* CTA primario: el único uso de la menta en esta pantalla. */}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-[var(--oc-mint)] px-8 py-3 text-sm font-bold text-[var(--oc-mint-ink)] transition enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
