import type { Metadata } from "next";
import Link from "next/link";
import { HomeLoginForm } from "@/app/components/home-login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Inicio de sesión",
  description: "Acceso al portal escolar del CETAC 23.",
};

/**
 * LOGIN (Fase 8 del rediseño Océano).
 *
 * Hasta ahora esta ruta solo hacía `redirect("/")`: el formulario vivía en la
 * portada. El diseño las separa y aquí está el acceso real.
 *
 * ── La autenticación NO cambia ────────────────────────────────────────────
 * Se reusa `HomeLoginForm` tal cual, que envía a `loginWithNombreCompleto`.
 * Misma cookie, misma firma, mismo mecanismo. Esta fase mueve y reestila; no
 * reescribe el login.
 *
 * ── Divergencia declarada con el frame «Login — 1440» ─────────────────────
 * El frame dibuja CUATRO pestañas de rol (Alumno · Profesor · Directivo ·
 * Tutor) y aquí no están. Dos razones, y las dos son del sistema, no del
 * diseño:
 *
 *   1. La autenticación NO recibe un rol. `loginWithNombreCompleto` lo
 *      resuelve del lado del servidor a partir de la identidad. Unas pestañas
 *      que no cambian lo que se envía serían un control que miente: el
 *      usuario elegiría «Profesor» y daría igual. En una maqueta eso es
 *      aceptable —está declarado—; en el login real, no.
 *   2. El frame es anterior al PROMPT-3, que creó el rol TÉCNICO. Son cinco
 *      roles, no cuatro, así que la fila del diseño ya estaba incompleta.
 *
 * Si las pestañas deben existir, hay que decidir antes QUÉ hacen: filtrar el
 * mensaje de error, preseleccionar algo, o cambiar la action para aceptar un
 * rol. Cualquiera de las tres es un cambio de autenticación y va en su propio
 * prompt.
 */
export default function LoginPage() {
  return (
    <div
      className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 py-12 text-[var(--oc-text)]"
      style={{ background: "var(--oc-bg)" }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface-login)] p-8 sm:p-10">
        <h1 className="text-center text-2xl font-bold tracking-tight">Inicio de sesión</h1>
        <p className="mt-1 text-center text-sm text-[var(--oc-muted)]">
          CETAC 23 · Portal escolar
        </p>

        <div className="mt-8">
          <HomeLoginForm />
        </div>

        <p className="mt-8 text-center text-xs text-[var(--oc-muted)]">
          ¿Problemas para entrar? Contacta a control escolar
        </p>
      </div>

      <Link
        href="/"
        className="mt-6 text-xs text-[var(--oc-muted)] transition hover:text-[var(--oc-text)]"
      >
        ← Volver a la portada
      </Link>
    </div>
  );
}
