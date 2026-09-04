import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo-estado";
import { ConfiguracionClient } from "./configuracion-client";
// PROMPT C (R-5) — se REACTIVA el panel de asignaciones profesor → materia
// (código muerto documentado del Bloque 17) como vista del directivo en
// /configuracion, con opción de desactivar una asignación equivocada.
import { AsignacionesProfesorAdmin } from "@/app/directivo/asignaciones-admin";

export const metadata: Metadata = {
  title: "AulaNube — Configuración",
  description:
    "Configuración del panel directivo: sincronización del roster, carga académica, ciclos (grupos y materias), asignaciones de profesores y materias (nombres visibles).",
};

export default async function ConfiguracionPage() {
  const sesion = await obtenerSesionPortal();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "directivo") redirect("/perfil");

  // Ciclo OPERATIVO (estado) para el contexto académico de la carga (lectura).
  const supabase = await createClient();
  const ciclo = await obtenerCicloOperativoGlobal(supabase);
  const periodos =
    ciclo.ok && ciclo.periodo ? [String(ciclo.periodo.nombre).trim()] : [];

  return (
    <>
      <ConfiguracionClient sesion={sesion} periodos={periodos} />
      {/* PROMPT C (R-5): asignaciones profesor → grupo·materia con
          desactivación (reactivado desde el Bloque 17). Solo rol directivo
          (validado también en las Server Actions). */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-4 sm:px-6 lg:max-w-6xl lg:px-8">
        <AsignacionesProfesorAdmin />
      </div>
    </>
  );
}
