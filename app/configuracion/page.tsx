import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { puede } from "@/lib/auth/permisos";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo/ciclo-estado";
import { ConfiguracionClient } from "./configuracion-client";
// PROMPT C (R-5) — se REACTIVA el panel de asignaciones profesor → materia
// (código muerto documentado del Bloque 17) como vista del directivo en
// /configuracion, con opción de desactivar una asignación equivocada.
// PROMPT-3 (T2/T3) — /configuracion deja de ser «la ruta del directivo»: es la
// ruta de quien tenga las capacidades de configuración (durante T2 directivo y
// técnico; tras T5 solo el técnico).
import { AsignacionesProfesorAdmin } from "@/app/components/asignaciones-admin";
// PROMPT-3/T4.2 — el técnico repone claves de acceso desde su consola.
import { ProfesoresCredencialesPanel } from "@/app/components/profesores-credenciales-panel";
// PROMPT-4/T2 — el técnico quita/actualiza aliases de materia desde su consola.
import { MateriasConfigPanel } from "@/app/components/materias-config-panel";
// PROMPT-4/T3 — el técnico da de baja/restaura alumnos del roster.
import { BajaRosterPanel } from "@/app/components/baja-roster-panel";
// PROMPT-4/T4 — el técnico deshace los datos de un paso sin borrar el ciclo.
import { DeshacerPasoPanel } from "@/app/components/deshacer-paso-panel";
import { esRol } from "@/lib/auth/permisos";

export const metadata: Metadata = {
  title: "AulaNube — Configuración",
  description:
    "Configuración del panel: sincronización del roster, carga académica, ciclos (grupos y materias), asignaciones de profesores y materias (nombres visibles).",
};

export default async function ConfiguracionPage() {
  const sesion = await obtenerSesionPortal();
  if (!sesion) redirect("/login");
  // PROMPT-5/B1: el cambio forzado de clave se resuelve UNA vez en el layout
  // raíz (todas las rutas). Esta página ya no lo repite.
  // Acceso por capacidad (no por rol): quien no pueda crear ciclos ni asignar
  // materias no tiene nada que hacer aquí.
  const puedeConfigurar = sesion
    ? puede(sesion.rol, "ciclo.crear") || puede(sesion.rol, "asignacion.ver")
    : false;
  if (!puedeConfigurar) redirect("/perfil");

  // Ciclo OPERATIVO (estado) para el contexto académico de la carga (lectura).
  const supabase = await createClient();
  const ciclo = await obtenerCicloOperativoGlobal(supabase);
  const periodos =
    ciclo.ok && ciclo.periodo ? [String(ciclo.periodo.nombre).trim()] : [];

  return (
    <>
      <ConfiguracionClient sesion={sesion} periodos={periodos} />
      {/* Asignaciones profesor → grupo·materia con desactivación. Gobierna
          puede() (asignacion.ver/editar); la autorización real se valida en las
          Server Actions. */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-4 sm:px-6 lg:max-w-6xl lg:px-8">
        <AsignacionesProfesorAdmin />
      </div>
      {/* PROMPT-4/T2 — aliases de materia (quitar/actualizar, individual y en
          volumen). Lo gobierna materia.editar_alias: tras T5 solo el técnico
          (el directivo lo perdió en PROMPT-3/T5). */}
      {puede(sesion.rol, "materia.editar_alias") && (
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-4 sm:px-6 lg:max-w-6xl lg:px-8">
          <MateriasConfigPanel materias={[]} />
        </div>
      )}
      {/* PROMPT-4/T3 — baja/restauración de roster (alumno.borrar_roster). */}
      {puede(sesion.rol, "alumno.borrar_roster") && (
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-4 sm:px-6 lg:max-w-6xl lg:px-8">
          <BajaRosterPanel />
        </div>
      )}
      {/* PROMPT-4/T4 — deshacer datos de un paso (ciclo.borrar_datos). */}
      {puede(sesion.rol, "ciclo.borrar_datos") && (
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-4 sm:px-6 lg:max-w-6xl lg:px-8">
          <DeshacerPasoPanel />
        </div>
      )}
      {/* PROMPT-3/T4.2 — Consola del técnico: reponer/forzar claves de acceso.
          El directivo ya tiene este panel en /directivo; aquí solo lo usa el
          técnico (ocultarId = no expone la identidad estructural). */}
      {!esRol(sesion.rol, "directivo") && (
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-4 sm:px-6 lg:max-w-6xl lg:px-8">
          <ProfesoresCredencialesPanel ocultarId />
        </div>
      )}
    </>
  );
}
