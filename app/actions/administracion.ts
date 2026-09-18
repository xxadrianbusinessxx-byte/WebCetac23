"use server";

/**
 * administracion.ts — Server Actions de Administración escolar: reportes
 * disciplinarios, citas, constancias y buzón.
 *
 * ── Dónde está cada cosa ───────────────────────────────────────────────────
 * CAPACIDAD (qué puede hacer un rol) → `exigir()`, primera línea de cada action.
 * ALCANCE   (sobre quién)            → aquí, después de `exigir()`.
 * DECISIÓN  (qué transición vale)    → `lib/escolar/administracion/flujos-puro`.
 * I/O                                → `lib/escolar/administracion/administracion`.
 *
 * Esa separación es el motivo de que este archivo no tenga un solo `.from()`.
 *
 * ── El alcance del tutor y del alumno ──────────────────────────────────────
 * Un alumno solo puede ver y pedir lo SUYO; un tutor, lo de sus vinculados. Eso
 * no lo puede decidir una capacidad —`cita.ver_propias` la tienen los dos— así
 * que se resuelve aquí, con la CURP de la sesión o con la lista de vinculados.
 * Confiar en un curp que llegue por parámetro sería dejar que el navegador
 * eligiera de quién ver las citas.
 */
import { exigir } from "@/lib/auth/exigir";
// `esRol` y no una comparación literal de rol: esa comparación vive en
// permisos.ts, y `test-auditoria-permisos` lo verifica sobre el texto del
// archivo. Aquí decide el ALCANCE (sobre quién), nunca el permiso (qué), que
// lo resuelve `exigir()`.
import { esRol } from "@/lib/auth/permisos";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo/ciclo-estado";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores/tutores-relacion";
import {
  anularReporte,
  cambiarEstadoCita,
  cambiarEstadoConstancia,
  crearReporte,
  enviarAlBuzon,
  listarBuzon,
  listarCitas,
  listarConstancias,
  listarReportes,
  marcarBuzonLeido,
  solicitarCita,
  solicitarConstancia,
  type BuzonRow,
  type CitaRow,
  type ConstanciaRow,
  type ReporteRow,
} from "@/lib/escolar/administracion/administracion";
import {
  esGravedadValida,
  esTipoBuzonValido,
  sanearTexto,
  type EstadoCita,
  type EstadoConstancia,
} from "@/lib/escolar/administracion/flujos-puro";

type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

/** El ciclo operativo, que es el alcance temporal de todo lo de aquí. */
async function cicloActual(): Promise<string | null> {
  const supabase = await createClient();
  const c = await obtenerCicloOperativoGlobal(supabase);
  return c.ok && c.periodo ? String(c.periodo.id) : null;
}

/**
 * Las CURPs que la sesión puede mirar. `null` = sin restricción (directivo).
 * Un array vacío significa «ninguna», que NO es lo mismo que «todas» — por eso
 * se distingue de `null` en vez de usar longitud cero.
 */
async function alcanceCurps(): Promise<readonly string[] | null> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return [];
  if (esRol(sesion.rol, "alumno")) return sesion.curp ? [sesion.curp] : [];
  if (esRol(sesion.rol, "tutor")) {
    const supabase = await createClient();
    return await listarCurpsDeTutor(supabase, sesion.matricula);
  }
  return null;
}

async function profesorId(): Promise<number | null> {
  const sesion = await obtenerSesionPortal();
  return sesion?.profesorId ?? null;
}

/* ── Reportes ──────────────────────────────────────────────────────────── */

export async function actionListarReportes(
  grupoId?: string | null,
): Promise<ReporteRow[]> {
  const g = await exigir("reporte.ver");
  if (!g.ok) return [];
  const periodoId = await cicloActual();
  if (!periodoId) return [];
  const supabase = await createClient();
  return listarReportes(supabase, periodoId, { grupoId: grupoId ?? null });
}

export async function actionCrearReporte(datos: {
  curp: string;
  grupoId: string | null;
  motivo: string;
  gravedad: string;
  ocurridoAt: string;
}): Promise<{ ok: true } | Fallo> {
  const g = await exigir("reporte.crear");
  if (!g.ok) return fallo("No autorizado.");
  const motivo = sanearTexto(datos.motivo);
  if (!motivo) return fallo("El motivo no puede estar vacío.");
  if (!esGravedadValida(datos.gravedad)) return fallo("Gravedad no válida.");
  if (!datos.curp?.trim()) return fallo("Falta el alumno.");
  const periodoId = await cicloActual();
  if (!periodoId) return fallo("No hay ciclo operativo.");
  const supabase = await createClient();
  const r = await crearReporte(supabase, {
    periodoId,
    curp: datos.curp.trim().toUpperCase(),
    grupoId: datos.grupoId,
    motivo,
    gravedad: datos.gravedad,
    ocurridoAt: datos.ocurridoAt || new Date().toISOString(),
    creadoPor: await profesorId(),
  });
  return r.ok ? { ok: true } : fallo(r.error);
}

export async function actionAnularReporte(
  id: string,
  motivo?: string,
): Promise<{ ok: true } | Fallo> {
  const g = await exigir("reporte.anular");
  if (!g.ok) return fallo("No autorizado.");
  const supabase = await createClient();
  const r = await anularReporte(supabase, id, await profesorId(), sanearTexto(motivo));
  return r.ok ? { ok: true } : fallo(r.error);
}

/* ── Citas ─────────────────────────────────────────────────────────────── */

/** Las del directivo: todas las del ciclo. */
export async function actionListarCitas(estado?: string): Promise<CitaRow[]> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return [];
  const periodoId = await cicloActual();
  if (!periodoId) return [];
  const supabase = await createClient();
  return listarCitas(supabase, periodoId, { estado: estado as EstadoCita | undefined });
}

/** Las del alumno o su tutor: SOLO las de su alcance, resuelto en servidor. */
export async function actionListarCitasPropias(): Promise<CitaRow[]> {
  const g = await exigir("cita.ver_propias");
  if (!g.ok) return [];
  const curps = await alcanceCurps();
  if (curps === null || curps.length === 0) return [];
  const periodoId = await cicloActual();
  if (!periodoId) return [];
  const supabase = await createClient();
  return listarCitas(supabase, periodoId, { curps });
}

export async function actionSolicitarCita(datos: {
  curp: string;
  motivo: string;
  propuestaAt: string;
}): Promise<{ ok: true } | Fallo> {
  const g = await exigir("cita.solicitar");
  if (!g.ok) return fallo("No autorizado.");
  const sesion = await obtenerSesionPortal();
  if (!sesion) return fallo("Sin sesión.");
  const curps = await alcanceCurps();
  const curp = datos.curp?.trim().toUpperCase() ?? "";
  // La comprobación que impide pedir una cita a nombre de otro: si la sesión
  // tiene alcance acotado, la CURP pedida tiene que estar dentro.
  if (curps !== null && !curps.includes(curp)) {
    return fallo("Esa CURP no está en tu alcance.");
  }
  if (!datos.propuestaAt) return fallo("Falta la fecha propuesta.");
  const periodoId = await cicloActual();
  if (!periodoId) return fallo("No hay ciclo operativo.");
  const supabase = await createClient();
  const r = await solicitarCita(supabase, {
    periodoId,
    curp,
    solicitadaPor: esRol(sesion.rol, "tutor")
      ? "tutor"
      : esRol(sesion.rol, "alumno")
        ? "alumno"
        : "directivo",
    motivo: sanearTexto(datos.motivo),
    propuestaAt: datos.propuestaAt,
  });
  return r.ok ? { ok: true } : fallo(r.error);
}

export async function actionCambiarEstadoCita(
  id: string,
  estado: string,
  nota?: string,
): Promise<{ ok: true } | Fallo> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  const supabase = await createClient();
  const r = await cambiarEstadoCita(
    supabase,
    id,
    estado as EstadoCita,
    await profesorId(),
    sanearTexto(nota),
  );
  return r.ok ? { ok: true } : fallo(r.error);
}

/* ── Constancias ───────────────────────────────────────────────────────── */

export async function actionListarConstancias(estado?: string): Promise<ConstanciaRow[]> {
  const g = await exigir("constancia.gestionar");
  if (!g.ok) return [];
  const periodoId = await cicloActual();
  if (!periodoId) return [];
  const supabase = await createClient();
  return listarConstancias(supabase, periodoId, {
    estado: estado as EstadoConstancia | undefined,
  });
}

export async function actionSolicitarConstancia(datos: {
  curp: string;
  tipo: string;
  observaciones?: string;
}): Promise<{ ok: true } | Fallo> {
  const g = await exigir("constancia.solicitar");
  if (!g.ok) return fallo("No autorizado.");
  const curps = await alcanceCurps();
  const curp = datos.curp?.trim().toUpperCase() ?? "";
  if (curps !== null && !curps.includes(curp)) {
    return fallo("Esa CURP no está en tu alcance.");
  }
  const tipo = sanearTexto(datos.tipo, 120);
  if (!tipo) return fallo("Indica el tipo de constancia.");
  const periodoId = await cicloActual();
  if (!periodoId) return fallo("No hay ciclo operativo.");
  const supabase = await createClient();
  const r = await solicitarConstancia(supabase, {
    periodoId,
    curp,
    tipo,
    observaciones: sanearTexto(datos.observaciones),
  });
  return r.ok ? { ok: true } : fallo(r.error);
}

export async function actionCambiarEstadoConstancia(
  id: string,
  estado: string,
  rutaStorage?: string,
): Promise<{ ok: true } | Fallo> {
  const g = await exigir("constancia.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  const supabase = await createClient();
  const r = await cambiarEstadoConstancia(
    supabase,
    id,
    estado as EstadoConstancia,
    await profesorId(),
    rutaStorage ?? null,
  );
  return r.ok ? { ok: true } : fallo(r.error);
}

/* ── Buzón ─────────────────────────────────────────────────────────────── */

export async function actionListarBuzon(tipo?: string): Promise<BuzonRow[]> {
  const g = await exigir("buzon.ver");
  if (!g.ok) return [];
  const supabase = await createClient();
  return listarBuzon(supabase, tipo && esTipoBuzonValido(tipo) ? tipo : null);
}

export async function actionEnviarAlBuzon(datos: {
  tipo: string;
  mensaje: string;
  anonimo?: boolean;
}): Promise<{ ok: true } | Fallo> {
  const g = await exigir("buzon.enviar");
  if (!g.ok) return fallo("No autorizado.");
  const sesion = await obtenerSesionPortal();
  if (!sesion) return fallo("Sin sesión.");
  if (!esTipoBuzonValido(datos.tipo)) return fallo("Tipo no válido.");
  const mensaje = sanearTexto(datos.mensaje);
  if (!mensaje) return fallo("El mensaje no puede estar vacío.");
  const periodoId = await cicloActual();
  const supabase = await createClient();
  const r = await enviarAlBuzon(supabase, {
    periodoId,
    tipo: datos.tipo,
    remitente: esRol(sesion.rol, "tutor") ? "tutor" : "alumno",
    // Anónimo de verdad: la CURP no se guarda. Si se guardara «por si acaso»,
    // el anonimato sería una etiqueta y no una propiedad.
    curp: datos.anonimo ? null : sesion.curp ?? null,
    mensaje,
  });
  return r.ok ? { ok: true } : fallo(r.error);
}

export async function actionMarcarBuzonLeido(id: string): Promise<{ ok: true } | Fallo> {
  const g = await exigir("buzon.ver");
  if (!g.ok) return fallo("No autorizado.");
  const supabase = await createClient();
  const r = await marcarBuzonLeido(supabase, id, await profesorId());
  return r.ok ? { ok: true } : fallo(r.error);
}
