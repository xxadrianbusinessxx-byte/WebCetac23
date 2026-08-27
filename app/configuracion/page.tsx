import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { TABLA_PERIODOS } from "@/lib/escolar/tables";
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

  // Periodos activos para el contexto académico de la carga (solo lectura).
  const supabase = await createClient();
  const { data: periodosData } = await supabase
    .from(TABLA_PERIODOS)
    .select("nombre")
    .eq("activo", true)
    .order("created_at", { ascending: false });
  const periodos = (periodosData ?? [])
    .map((p) => String(p?.nombre ?? "").trim())
    .filter(Boolean);

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
