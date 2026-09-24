"use server";

/**
 * actividades.ts — Server Actions de las actividades (tareas) por materia.
 *
 * CAPACIDAD → `exigir()`. ALCANCE → aquí. DECISIÓN → `actividades-puro`.
 * I/O → `lib/escolar/materia/actividades`.
 *
 * ── El alcance, que es lo delicado ─────────────────────────────────────────
 * `actividad.ver` la tienen alumno, tutor, maestro y directivo. La capacidad
 * dice QUÉ, no SOBRE QUÉ. Por eso la entrega y la calificación resuelven aquí
 * de quién son:
 *   · el alumno entrega con la CURP de SU sesión, nunca con una que llegue por
 *     parámetro — si no, cualquiera entregaría a nombre de otro;
 *   · el tutor NO entrega: ve, y eso es todo (no tiene `actividad.entregar`).
 */
import { exigir } from "@/lib/auth/exigir";
// La comparación de rol vive en permisos.ts (regla verificada por
// `test-auditoria-permisos`). Aquí decide ALCANCE, no permiso.
import { esRol } from "@/lib/auth/permisos";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo/ciclo-estado";
import {
  calificarEntrega,
  crearActividad,
  eliminarActividad,
  entregasDeActividad,
  entregasDeAlumno,
  listarActividades,
  registrarEntrega,
  type ActividadRow,
  type EntregaRow,
} from "@/lib/escolar/materia/actividades";
import { sanearTexto } from "@/lib/escolar/administracion/flujos-puro";

type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

async function cicloActual(): Promise<string | null> {
  const supabase = await createClient();
  const c = await obtenerCicloOperativoGlobal(supabase);
  return c.ok && c.periodo ? String(c.periodo.id) : null;
}

/** Vista del alumno: las actividades de una materia y lo que él ya entregó. */
export async function actionVistaActividades(materiaInterna: string): Promise<{
  actividades: ActividadRow[];
  entregas: EntregaRow[];
}> {
  const g = await exigir("actividad.ver");
  if (!g.ok) return { actividades: [], entregas: [] };
  const periodoId = await cicloActual();
  if (!periodoId || !materiaInterna) return { actividades: [], entregas: [] };
  const supabase = await createClient();
  const actividades = await listarActividades(supabase, periodoId, materiaInterna);

  // Las entregas son las de QUIEN MIRA, y solo si es alumno. Un tutor ve las
  // actividades de su vinculado pero no arrastra entregas de nadie: mezclarlas
  // aquí abriría la puerta a enseñar la de otro alumno por descuido.
  const sesion = await obtenerSesionPortal();
  const entregas =
    sesion && esRol(sesion.rol, "alumno") && sesion.curp
      ? await entregasDeAlumno(supabase, sesion.curp, actividades.map((a) => a.id))
      : [];
  return { actividades, entregas };
}

export async function actionCrearActividad(datos: {
  materiaInterna: string;
  grupoMateriaId?: string | null;
  titulo: string;
  descripcion?: string;
  fechaLimite?: string | null;
  peso?: number | null;
}): Promise<{ ok: true } | Fallo> {
  const g = await exigir("actividad.editar");
  if (!g.ok) return fallo("No autorizado.");
  const titulo = sanearTexto(datos.titulo, 200);
  if (!titulo) return fallo("La actividad necesita un título.");
  if (!datos.materiaInterna) return fallo("Falta la materia.");
  const periodoId = await cicloActual();
  if (!periodoId) return fallo("No hay ciclo operativo.");
  const sesion = await obtenerSesionPortal();
  const supabase = await createClient();
  const r = await crearActividad(supabase, {
    periodoId,
    materiaInterna: datos.materiaInterna,
    grupoMateriaId: datos.grupoMateriaId ?? null,
    titulo,
    descripcion: sanearTexto(datos.descripcion),
    fechaLimite: datos.fechaLimite || null,
    peso: typeof datos.peso === "number" ? datos.peso : null,
    creadaPor: sesion?.profesorId ?? null,
  });
  return r.ok ? { ok: true } : fallo(r.error);
}

export async function actionEliminarActividad(id: string): Promise<{ ok: true } | Fallo> {
  const g = await exigir("actividad.editar");
  if (!g.ok) return fallo("No autorizado.");
  const supabase = await createClient();
  const r = await eliminarActividad(supabase, id);
  return r.ok ? { ok: true } : fallo(r.error);
}

/**
 * Entregar. La CURP sale de la SESIÓN, nunca de un parámetro: es la diferencia
 * entre «entrego mi tarea» y «entrego una tarea a nombre de quien yo diga».
 */
export async function actionEntregarActividad(datos: {
  actividadId: string;
  rutaStorage?: string | null;
  comentario?: string;
}): Promise<{ ok: true } | Fallo> {
  const g = await exigir("actividad.entregar");
  if (!g.ok) return fallo("No autorizado.");
  const sesion = await obtenerSesionPortal();
  if (!sesion?.curp) return fallo("Tu sesión no tiene CURP asociada.");
  const supabase = await createClient();
  const r = await registrarEntrega(supabase, {
    actividadId: datos.actividadId,
    curp: sesion.curp,
    rutaStorage: datos.rutaStorage ?? null,
    comentario: sanearTexto(datos.comentario),
  });
  return r.ok ? { ok: true } : fallo(r.error);
}

/** Las entregas de una actividad, para que el profesor las califique. */
export async function actionEntregasDeActividad(actividadId: string): Promise<EntregaRow[]> {
  const g = await exigir("actividad.editar");
  if (!g.ok) return [];
  const supabase = await createClient();
  return entregasDeActividad(supabase, actividadId);
}

export async function actionCalificarEntrega(
  entregaId: string,
  calificacion: number | null,
): Promise<{ ok: true } | Fallo> {
  const g = await exigir("actividad.editar");
  if (!g.ok) return fallo("No autorizado.");
  const supabase = await createClient();
  const r = await calificarEntrega(supabase, entregaId, calificacion);
  return r.ok ? { ok: true } : fallo(r.error);
}
