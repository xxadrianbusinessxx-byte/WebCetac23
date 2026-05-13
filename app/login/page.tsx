import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "AulaNube — Login",
  description: "Acceso con Supabase Auth.",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-lg shadow-sky-100/80">
        <h1 className="text-xl font-bold text-slate-900">Sesión</h1>
        <p className="mt-2 text-sm text-slate-600">
          Estado leído en el servidor con cookies de Supabase (Vercel usa las mismas variables que en
          local).
        </p>
        <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-slate-800">
          {user ? (
            <>
              Conectado como <span className="font-semibold">{user.email ?? user.id}</span>
            </>
          ) : (
            <>Sin sesión activa</>
          )}
        </p>
        <p className="mt-4 text-xs text-slate-500">
          Cuando implementes email/contraseña u OAuth, usa{" "}
          <code className="rounded bg-slate-100 px-1">createClient</code> desde{" "}
          <code className="rounded bg-slate-100 px-1">@/lib/supabase/client</code> en componentes
          cliente o acciones con el cliente de servidor.
        </p>
      </div>
      <Link
        href="/"
        className="text-center text-sm font-semibold text-sky-700 underline-offset-4 hover:underline"
      >
        ← Volver al inicio
      </Link>
    </main>
  );
}
