import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo-estado";
import { ConfiguracionClient } from "./configuracion-client";

export const metadata: Metadata = {
  title: "AulaNube — Configuración",
  description:
    "Configuración del panel directivo: sincronización del roster, carga académica, ciclos (grupos y materias) y materias (nombres visibles).",
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
      {/* DESACTIVADO de la UI de /configuracion (ver Bloque 17 de contexto.feliz):
          ya no se renderizan ReconocimientoAcademico, SemestresOfertaAdmin ni
          AsignacionesProfesorAdmin. El código se conserva en el repo por si se
          reactiva para otra instalación (no se borran tablas ni lógica). */}
    </>
  );
}
