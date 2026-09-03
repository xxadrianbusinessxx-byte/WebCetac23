import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo-estado";
import { ConfiguracionClient } from "./configuracion-client";
import { SemestresOfertaAdmin } from "../directivo/semestres-admin";
import { AsignacionesProfesorAdmin } from "../directivo/asignaciones-admin";
import { ReconocimientoAcademico } from "../components/reconocimiento-academico";

export const metadata: Metadata = {
  title: "AulaNube — Configuración",
  description:
    "Configuración del panel directivo: sincronización del roster, carga académica, reconocimiento académico de alumnos, materias (nombres visibles), oferta por semestre y asignaciones profesor → grupo·materia.",
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
      {/* C4.19 — Reconocimiento académico de alumnos (reutiliza el pipeline C3.1). */}
      <ReconocimientoAcademico />
      {/* C4.14/16/18 — Oferta por semestre y asignaciones profesor → grupo·materia,
          junto al bloque de configuración de materias (nombres visibles). */}
      <SemestresOfertaAdmin />
      <AsignacionesProfesorAdmin />
    </>
  );
}
