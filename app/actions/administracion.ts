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
import { buscarAlumnosCandidatos, type AlumnoCandidato } from "@/lib/escolar/catalogo/inscripciones-borrador";
import { resolverAccesoAlumno } from "@/lib/escolar/alumno/acceso-alumno";
import { guardarNumeroControl } from "@/lib/escolar/alumno/numero-control";
import { validarNumeroControl } from "@/lib/escolar/alumno/numero-control-puro";
import { leerEntrada } from "@/lib/validacion/leer-form-data";
import {
  esquemaCurpConstancia,
  esquemaDiaBloqueadoCita,
  esquemaFranjaCita,
  esquemaIdFranjaCita,
  esquemaNumeroControl,
  esquemaSolicitudCita,
  esquemaSolicitudConstancia,
} from "@/lib/validacion/esquemas-puro";
import {
  bloquearDia,
  borrarFranja,
  desbloquearDia,
  guardarFranja,
  leerAgendaCitas,
  pedirCitaEnAgenda,
} from "@/lib/escolar/administracion/agenda-citas";
import {
  huecosDisponibles,
  type DiaBloqueado,
  type Franja,
  type Hueco,
} from "@/lib/escolar/administracion/agenda-citas-puro";
import { hoyEnElPlantel } from "@/lib/escolar/administracion/hora-plantel-puro";
import type { DiaSemana } from "@/lib/escolar/ciclo/calendario";
import {
  datosConstanciaPorCurp,
  nombresDeAlumnos,
  type DatosConstanciaSinFecha,
} from "@/lib/escolar/administracion/constancia";
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
  listarReportesVisiblesDeAlumno,
  marcarBuzonLeido,
  solicitarConstancia,
  type BuzonRow,
  type CitaRow,
  type ConstanciaConAlumno,
  type ConstanciaRow,
  type ReporteRow,
  type ReporteVisible,
} from "@/lib/escolar/administracion/administracion";
import {
  esGravedadValida,
  esTipoBuzonValido,
  sanearTexto,
  validarFechaRecogida,
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

/**
 * Los reportes de UN alumno para Perfil › Notificaciones (2026-10-01): el
 * alumno ve los suyos; el tutor, los del hijo elegido; Administración escolar,
 * los del alumno de su Expediente. La CURP llega del navegador, así que SOBRE
 * QUIÉN lo decide `resolverAccesoAlumno`, no el parámetro.
 */
export async function actionListarReportesDeAlumno(
  curp: string,
): Promise<{ ok: true; reportes: ReporteVisible[] } | Fallo> {
  const g = await exigir("reporte.ver_propios");
  if (!g.ok) return fallo("No autorizado.");
  try {
    const supabase = await createClient();
    const acceso = await resolverAccesoAlumno(supabase, g.sesion, curp);
    if (!acceso.ok) return fallo(acceso.error);
    const periodoId = await cicloActual();
    if (!periodoId) return { ok: true, reportes: [] };
    const r = await listarReportesVisiblesDeAlumno(supabase, periodoId, acceso.curp);
    return r.ok ? { ok: true, reportes: r.dato } : fallo("No se pudieron leer los reportes.");
  } catch (err) {
    console.error("[administracion] actionListarReportesDeAlumno", err);
    return fallo("No se pudieron leer los reportes.");
  }
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

/**
 * Las citas de UN alumno, en cualquier estado, para Administración escolar ›
 * Alumnos / Tutores del directivo (PROMPT U, 2026-10-01). La CURP llega del
 * navegador: SOBRE QUIÉN lo decide `resolverAccesoAlumno` (para el directivo,
 * cualquiera; la normaliza y exige que venga). El filtro por CURP es el mismo
 * de `listarCitas`: una CURP sin citas devuelve la lista vacía.
 */
export async function actionListarCitasDeAlumno(
  curp: string,
): Promise<{ ok: true; citas: CitaRow[] } | Fallo> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  try {
    const supabase = await createClient();
    const acceso = await resolverAccesoAlumno(supabase, g.sesion, curp);
    if (!acceso.ok) return fallo(acceso.error);
    const periodoId = await cicloActual();
    if (!periodoId) return { ok: true, citas: [] };
    return { ok: true, citas: await listarCitas(supabase, periodoId, { curps: [acceso.curp] }) };
  } catch (err) {
    console.error("[administracion] actionListarCitasDeAlumno", err);
    return fallo("No se pudieron leer las citas.");
  }
}

/**
 * Las del alumno o su tutor: SOLO las de su alcance, resuelto en servidor. Con
 * `curp` (2026-10-01), las de ESE alumno —el hijo elegido en el selector del
 * tutor—, siempre que esté dentro del alcance; fuera de él, ninguna.
 */
export async function actionListarCitasPropias(curp?: string): Promise<CitaRow[]> {
  const g = await exigir("cita.ver_propias");
  if (!g.ok) return [];
  const curps = await alcanceCurps();
  if (curps === null || curps.length === 0) return [];
  const pedida = typeof curp === "string" ? curp.trim().toUpperCase() : "";
  const acotadas = pedida ? curps.filter((c) => c.trim().toUpperCase() === pedida) : curps;
  if (acotadas.length === 0) return [];
  const periodoId = await cicloActual();
  if (!periodoId) return [];
  const supabase = await createClient();
  return listarCitas(supabase, periodoId, { curps: acotadas });
}

/**
 * Alumno o tutor piden una cita en un HUECO de la agenda de la dirección
 * (2026-10-01): día y hora del plantel, no un instante libre. Si el hueco vale lo
 * decide `validarSolicitudCita` dentro de `pedirCitaEnAgenda`, con la agenda
 * leída en ese momento; la lista que ve el navegador es solo una ayuda.
 */
export async function actionSolicitarCita(entrada: unknown): Promise<{ ok: true } | Fallo> {
  const g = await exigir("cita.solicitar");
  if (!g.ok) return fallo("No autorizado.");
  const e = leerEntrada(esquemaSolicitudCita, entrada);
  if (!e.ok) return fallo(e.error);
  try {
    const sesion = g.sesion!;
    // La comprobación que impide pedir una cita a nombre de otro: si la sesión
    // tiene alcance acotado, la CURP pedida tiene que estar dentro.
    const curps = await alcanceCurps();
    if (curps !== null && !curps.includes(e.datos.curp)) {
      return fallo("Esa CURP no está en tu alcance.");
    }
    const periodoId = await cicloActual();
    if (!periodoId) return fallo("No hay ciclo operativo.");
    const supabase = await createClient();
    const r = await pedirCitaEnAgenda(
      supabase,
      {
        periodoId,
        curp: e.datos.curp,
        solicitadaPor: esRol(sesion.rol, "tutor") ? "tutor" : esRol(sesion.rol, "alumno") ? "alumno" : "directivo",
        motivo: sanearTexto(e.datos.motivo),
        hueco: { fecha: e.datos.fecha, hora: e.datos.hora },
      },
      hoyEnElPlantel(new Date()),
    );
    return r.ok ? { ok: true } : fallo(r.error);
  } catch (err) {
    console.error("[administracion] actionSolicitarCita", err);
    return fallo("No se pudo registrar la cita. Inténtalo de nuevo.");
  }
}

/**
 * Los huecos que alumno y tutor pueden pedir (de mañana a 30 días). Sin agenda
 * publicada, `agendaPublicada: false`: la pantalla lo dice en vez de enseñar una
 * lista vacía que parezca «todo ocupado».
 */
export async function actionListarHuecosCita(): Promise<
  { ok: true; huecos: Hueco[]; agendaPublicada: boolean } | Fallo
> {
  const g = await exigir("cita.solicitar");
  if (!g.ok) return fallo("No autorizado.");
  try {
    const hoy = hoyEnElPlantel(new Date());
    const supabase = await createClient();
    const r = await leerAgendaCitas(supabase, hoy);
    if (!r.ok) return fallo(r.error);
    return {
      ok: true,
      huecos: huecosDisponibles(r.dato.agenda, hoy),
      agendaPublicada: r.dato.franjas.length > 0,
    };
  } catch (err) {
    console.error("[administracion] actionListarHuecosCita", err);
    return fallo("No se pudo leer el horario de citas.");
  }
}

/* ── Agenda de citas: la configura el directivo (2026-10-01) ───────────── */

/** La agenda para «Configurar citas», con cuántos huecos quedan libres a 30 días. */
export async function actionLeerAgendaCitas(): Promise<
  { ok: true; franjas: Franja[]; diasBloqueados: DiaBloqueado[]; huecosLibres: number } | Fallo
> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  try {
    const hoy = hoyEnElPlantel(new Date());
    const supabase = await createClient();
    const r = await leerAgendaCitas(supabase, hoy);
    if (!r.ok) return fallo(r.error);
    return {
      ok: true,
      franjas: r.dato.franjas,
      diasBloqueados: r.dato.diasBloqueados,
      huecosLibres: huecosDisponibles(r.dato.agenda, hoy).length,
    };
  } catch (err) {
    console.error("[administracion] actionLeerAgendaCitas", err);
    return fallo("No se pudo leer la agenda de citas.");
  }
}

export async function actionGuardarFranja(entrada: unknown): Promise<{ ok: true } | Fallo> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  const e = leerEntrada(esquemaFranjaCita, entrada);
  if (!e.ok) return fallo(e.error);
  try {
    const supabase = await createClient();
    const r = await guardarFranja(
      supabase,
      {
        // El día lo comprueba `validarFranja` contra DIAS_SEMANA; el tipo solo lo nombra.
        dia_semana: e.datos.diaSemana as DiaSemana,
        hora_inicio: e.datos.horaInicio,
        hora_fin: e.datos.horaFin,
        duracion_min: e.datos.duracionMin,
      },
      await profesorId(),
    );
    return r.ok ? { ok: true } : fallo(r.error);
  } catch (err) {
    console.error("[administracion] actionGuardarFranja", err);
    return fallo("No se pudo guardar el horario.");
  }
}

export async function actionBorrarFranja(entrada: unknown): Promise<{ ok: true } | Fallo> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  const e = leerEntrada(esquemaIdFranjaCita, entrada);
  if (!e.ok) return fallo(e.error);
  try {
    const supabase = await createClient();
    const r = await borrarFranja(supabase, e.datos.id);
    return r.ok ? { ok: true } : fallo(r.error);
  } catch (err) {
    console.error("[administracion] actionBorrarFranja", err);
    return fallo("No se pudo quitar el horario.");
  }
}

export async function actionBloquearDia(entrada: unknown): Promise<{ ok: true } | Fallo> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  const e = leerEntrada(esquemaDiaBloqueadoCita, entrada);
  if (!e.ok) return fallo(e.error);
  try {
    const supabase = await createClient();
    const r = await bloquearDia(
      supabase,
      { fecha: e.datos.fecha, motivo: sanearTexto(e.datos.motivo, 200) },
      hoyEnElPlantel(new Date()),
      await profesorId(),
    );
    return r.ok ? { ok: true } : fallo(r.error);
  } catch (err) {
    console.error("[administracion] actionBloquearDia", err);
    return fallo("No se pudo bloquear el día.");
  }
}

export async function actionDesbloquearDia(entrada: unknown): Promise<{ ok: true } | Fallo> {
  const g = await exigir("cita.gestionar");
  if (!g.ok) return fallo("No autorizado.");
  const e = leerEntrada(esquemaDiaBloqueadoCita, entrada);
  if (!e.ok) return fallo(e.error);
  try {
    const supabase = await createClient();
    const r = await desbloquearDia(supabase, e.datos.fecha);
    return r.ok ? { ok: true } : fallo(r.error);
  } catch (err) {
    console.error("[administracion] actionDesbloquearDia", err);
    return fallo("No se pudo desbloquear el día.");
  }
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

/**
 * Las solicitudes del ciclo, para Administración escolar —la ÚNICA que las acepta
 * (2026-09-25)—, con el nombre del alumno: una lista de CURPs no dice a quién
 * se le entrega.
 */
export async function actionListarConstancias(estado?: string): Promise<ConstanciaConAlumno[]> {
  const g = await exigir("constancia.gestionar");
  if (!g.ok) return [];
  try {
    const periodoId = await cicloActual();
    if (!periodoId) return [];
    const supabase = await createClient();
    const filas = await listarConstancias(supabase, periodoId, {
      estado: estado as EstadoConstancia | undefined,
    });
    const nombres = await nombresDeAlumnos(supabase, filas.map((f) => f.curp));
    return filas.map((f) => ({ ...f, nombre_alumno: nombres.get(f.curp) ?? "" }));
  } catch (err) {
    console.error("[administracion] actionListarConstancias", err);
    return [];
  }
}

/** Las constancias pedidas por el alumno o por el tutor: SOLO las de su alcance. */
export async function actionListarConstanciasPropias(): Promise<ConstanciaRow[]> {
  const g = await exigir("constancia.ver_propias");
  if (!g.ok) return [];
  try {
    const curps = await alcanceCurps();
    if (curps === null || curps.length === 0) return [];
    const periodoId = await cicloActual();
    if (!periodoId) return [];
    const supabase = await createClient();
    return await listarConstancias(supabase, periodoId, { curps });
  } catch (err) {
    console.error("[administracion] actionListarConstanciasPropias", err);
    return [];
  }
}

/**
 * Alumno o tutor piden la constancia de estudios desde su perfil, como una cita:
 * asunto, motivo y día para recogerla (2026-09-25). Queda PENDIENTE hasta que
 * Administración escolar la acepte. La CURP tiene que estar en el alcance de la
 * sesión: el alumno, la suya; el tutor, la de un vinculado.
 */
export async function actionSolicitarConstancia(entrada: unknown): Promise<{ ok: true } | Fallo> {
  const g = await exigir("constancia.solicitar");
  if (!g.ok) return fallo("No autorizado.");
  const e = leerEntrada(esquemaSolicitudConstancia, entrada);
  if (!e.ok) return fallo(e.error);
  const fecha = validarFechaRecogida(e.datos.fechaRecogida, new Date());
  if (!fecha.ok) return fallo(fecha.error);
  const asunto = sanearTexto(e.datos.asunto, 120);
  const motivo = sanearTexto(e.datos.motivo, 500);
  if (!asunto || !motivo) return fallo("Indica el asunto y el motivo.");
  try {
    const sesion = g.sesion!;
    const curps = await alcanceCurps();
    if (curps === null || !curps.includes(e.datos.curp)) {
      return fallo("Esa CURP no está en tu alcance.");
    }
    const periodoId = await cicloActual();
    if (!periodoId) return fallo("No hay ciclo operativo.");
    const supabase = await createClient();
    const r = await solicitarConstancia(supabase, {
      periodoId,
      curp: e.datos.curp,
      tipo: "estudios",
      observaciones: null,
      asunto,
      motivo,
      fechaRecogida: e.datos.fechaRecogida,
      solicitadaPor: esRol(sesion.rol, "tutor") ? "tutor" : "alumno",
      solicitante: sesion.matricula,
    });
    return r.ok ? { ok: true } : fallo("No se pudo registrar la solicitud. Inténtalo de nuevo.");
  } catch (err) {
    console.error("[administracion] actionSolicitarConstancia", err);
    return fallo("No se pudo registrar la solicitud. Inténtalo de nuevo.");
  }
}

/**
 * Dirección genera la constancia DIRECTAMENTE con la CURP del alumno, sin
 * solicitud (2026-09-25). Devuelve los datos que la hoja necesita; la hoja la
 * arma y la imprime el navegador. `constancia.emitir` la tienen Dirección y
 * Administración escolar; sobre qué alumno, `resolverAccesoAlumno`.
 */
export async function actionDatosConstanciaPorCurp(
  entrada: unknown,
): Promise<{ ok: true; datos: DatosConstanciaSinFecha } | Fallo> {
  const g = await exigir("constancia.emitir");
  if (!g.ok) return fallo("No autorizado.");
  const e = leerEntrada(esquemaCurpConstancia, entrada);
  if (!e.ok) return fallo(e.error);
  try {
    const supabase = await createClient();
    const acceso = await resolverAccesoAlumno(supabase, g.sesion, e.datos.curp);
    if (!acceso.ok) return fallo(acceso.error);
    return await datosConstanciaPorCurp(supabase, acceso.curp);
  } catch (err) {
    console.error("[administracion] actionDatosConstanciaPorCurp", err);
    return fallo("No se pudieron leer los datos del alumno. Inténtalo de nuevo.");
  }
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

/* ── Expediente (Administración escolar, 2026-09-24) ───────────────────── */

/**
 * Busca alumnos por nombre o CURP para abrir su expediente. Devuelve como mucho
 * 30 (el tope de `buscarAlumnosCandidatos`, la misma búsqueda que ya usa la
 * inscripción). Pide al menos 3 caracteres: con una letra coincidiría media
 * escuela y la lista no serviría para elegir.
 *
 * `alumno.ver_expediente` y no `alumno.ver_perfil`: esta la tienen también
 * maestro, tutor y alumno, con alcance acotado por la action del perfil. Buscar
 * entre TODOS los alumnos es otra cosa y tiene su propia capacidad.
 */
export async function actionBuscarAlumnosExpediente(
  texto: string,
): Promise<{ ok: true; alumnos: AlumnoCandidato[] } | Fallo> {
  const g = await exigir("alumno.ver_expediente");
  if (!g.ok) return fallo("No autorizado.");
  const t = typeof texto === "string" ? texto.trim().slice(0, 80) : "";
  if (t.length < 3) return { ok: true, alumnos: [] };
  const supabase = await createClient();
  const r = await buscarAlumnosCandidatos(supabase, t);
  if (!r.ok) return fallo("No se pudo buscar. Inténtalo de nuevo.");
  return { ok: true, alumnos: r.alumnos ?? [] };
}

/**
 * Captura o corrige el número de control del alumno (va en la constancia). Vacío
 * lo quita. Autorizar → validar → delegar: la capacidad es de Administración
 * escolar; SOBRE QUIÉN lo decide `resolverAccesoAlumno`, como en el resto del
 * expediente; el formato, `validarNumeroControl` (la misma regla que el CHECK).
 */
export async function actionGuardarNumeroControl(
  entrada: unknown,
): Promise<{ ok: true; numeroControl: string | null } | Fallo> {
  const g = await exigir("alumno.editar_numero_control");
  if (!g.ok) return fallo("Solo Administración escolar puede capturar el número de control.");
  const e = leerEntrada(esquemaNumeroControl, entrada);
  if (!e.ok) return fallo(e.error);
  const v = validarNumeroControl(e.datos.numeroControl);
  if (!v.ok) return fallo(v.error);
  try {
    const supabase = await createClient();
    const acceso = await resolverAccesoAlumno(supabase, g.sesion, e.datos.curp);
    if (!acceso.ok) return fallo(acceso.error);
    const r = await guardarNumeroControl(supabase, acceso.curp, v.valor);
    return r.ok ? { ok: true, numeroControl: v.valor } : fallo(r.error);
  } catch (err) {
    console.error("[administracion] actionGuardarNumeroControl", err);
    return fallo("No se pudo guardar el número de control. Inténtalo de nuevo.");
  }
}
