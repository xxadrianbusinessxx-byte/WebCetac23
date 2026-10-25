/**
 * boleta-puro.ts — MÓDULO PURO. Arma la boleta de calificaciones de UN alumno y
 * decide qué activación del directivo le toca (PROMPT X, 2026-10-24).
 *
 * ── Qué es la boleta aquí ──────────────────────────────────────────────────
 * Una VISTA PREVIA informativa, antes de que se recoja la oficial. No se guarda:
 * se arma cada vez que alguien entra, con las notas que hay en ese momento. Por
 * eso este módulo no conoce «la boleta del Parcial 1» como algo almacenado: el
 * parcial es solo el rótulo y la duración que puso el directivo al activarla, y
 * la nota de cada materia es la que el profesor tiene subida HOY.
 *
 * Mismo molde que la constancia (`constancia-puro.ts`): lo que es del plantel se
 * importa de allí —`PLANTEL`, `periodoSemestre`, `tituloCarrera`— y no se copia.
 *
 * ── Las reglas de la calificación (decisión del responsable) ───────────────
 *   · escala 0–10; 0.5 o más sube, por debajo baja (a entero);
 *   · nunca sale menos de 5, y NO se marca la reprobada;
 *   · sin nota del profesor → «Sin calificar» (la boleta se enseña igual);
 *   · fuera de 0–10 → «Revisar»: no se convierte de escala por nuestra cuenta.
 */
import { periodoSemestre, PLANTEL, tituloCarrera } from "./constancia-puro.ts";
import { hoyEnElPlantel } from "./hora-plantel-puro.ts";

/* ── Constantes ─────────────────────────────────────────────────────────── */

export const TITULO_BOLETA = "BOLETA DE CALIFICACIONES";
export const LEYENDA_BOLETA = "Documento informativo, sin validez oficial.";
export const AVISO_BOLETA_NO_DISPONIBLE = "La boleta de este parcial aún no está disponible.";

/** Ninguna calificación mostrada baja de aquí (decisión del responsable). */
export const PISO_CALIFICACION = 5;
export const ESCALA_MAXIMA = 10;
/** Decimales del promedio general. 0 = entero, con la misma regla de redondeo. */
export const DECIMALES_PROMEDIO_GENERAL = 0;

export const TEXTO_SIN_CALIFICAR = "Sin calificar";
export const TEXTO_REVISAR = "Revisar";
export const TEXTO_SIN_ASIGNAR = "Sin asignar";
export const TEXTO_SIN_REGISTRO = "Sin registro";
export const TEXTO_SIN_CARRERA = "Sin carrera";

/* ── Tipos ──────────────────────────────────────────────────────────────── */

export const ALCANCES_BOLETA = ["plantel", "grado", "grupo"] as const;
export type AlcanceBoleta = (typeof ALCANCES_BOLETA)[number];

/** Una fila VIGENTE de `boletas_activacion`, con los nombres del dominio. */
export type ActivacionBoleta = {
  id: string;
  evaluacionId: string;
  alcance: AlcanceBoleta;
  grado: string | null;
  grupoId: string | null;
  /** ISO de `activada_en`: desempata dos activaciones del mismo nivel. */
  activadaEn: string;
};

/** Subconjunto de `periodos_evaluacion` que la boleta necesita. */
export type ParcialBoleta = {
  id: string;
  numero: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
};

/** Un grupo del ciclo, como lo enseñan los selectores. */
export type GrupoBoleta = { id: string; grado: string; grupo: string; carreraClave: string };

export type DatosBoleta = {
  nombre: string;
  curp: string;
  numeroControl: string | null;
  grado: string;
  grupo: string;
  /** Clave de la carrera del grupo («RH», «MECATRONICA»). */
  carrera: string;
  parcial: ParcialBoleta;
  /** Una por materia del grupo; `promedio` = la nota tipo «promedio» del profesor. */
  materias: { nombre: string; promedio: number | null }[];
  /** Resumen de asistencia de ESE parcial; null = no se pudo leer. */
  asistencia: { porcentaje: number; clasesRegistradas: number } | null;
};

export type EstadoCalificacion = "calificada" | "sin_calificar" | "revisar";

export type CeldaCalificacion = {
  texto: string;
  /** El número que se muestra (ya redondeado y con el piso); null si no hay. */
  valor: number | null;
  estado: EstadoCalificacion;
};

export type BoletaArmada = {
  titulo: string;
  institucion: string;
  cct: string;
  parcial: string;
  /** «del 28 de Septiembre al 6 de Noviembre de 2026»; vacío si faltan fechas. */
  duracion: string;
  nombre: string;
  curp: string;
  numeroControl: string;
  gradoGrupo: string;
  carrera: string;
  filas: { materia: string; calificacion: string; estado: EstadoCalificacion }[];
  promedioGeneral: string;
  asistencia: string;
  leyenda: string;
};

/* ── La calificación ────────────────────────────────────────────────────── */

/**
 * Redondeo de la boleta: 0.5 o más sube, por debajo baja. Primero se fija a dos
 * decimales para que un 7.4999999 que llegó por la coma flotante no baje a 7 lo
 * que el profesor escribió como 7.50.
 */
export function redondearBoleta(valor: number, decimales = 0): number {
  const f = 10 ** decimales;
  const fijo = Math.round(valor * f * 100) / 100;
  return Math.floor(fijo + 0.5) / f;
}

/** La celda de UNA materia, con las reglas de la cabecera. */
export function calificacionBoleta(valor: number | null | undefined): CeldaCalificacion {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return { texto: TEXTO_SIN_CALIFICAR, valor: null, estado: "sin_calificar" };
  }
  if (valor < 0 || valor > ESCALA_MAXIMA) {
    return { texto: TEXTO_REVISAR, valor: null, estado: "revisar" };
  }
  const mostrado = Math.max(PISO_CALIFICACION, redondearBoleta(valor));
  return { texto: String(mostrado), valor: mostrado, estado: "calificada" };
}

/**
 * Promedio general: media de lo que la boleta MUESTRA (ya redondeado y con el
 * piso), no de las notas crudas — así cuadra con lo que el alumno tiene delante.
 * Las «Sin calificar» y «Revisar» no cuentan.
 */
export function promedioGeneral(celdas: readonly CeldaCalificacion[]): string {
  const valores = celdas.map((c) => c.valor).filter((v): v is number => v !== null);
  if (valores.length === 0) return TEXTO_SIN_CALIFICAR;
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  return redondearBoleta(media, DECIMALES_PROMEDIO_GENERAL).toFixed(DECIMALES_PROMEDIO_GENERAL);
}

/** «93 %», o «Sin registro» si en ese parcial no hay clases registradas. */
export function textoAsistencia(a: DatosBoleta["asistencia"]): string {
  if (!a || a.clasesRegistradas <= 0) return TEXTO_SIN_REGISTRO;
  return `${a.porcentaje} %`;
}

/** «del 28 de Septiembre al 6 de Noviembre de 2026». */
export function duracionParcial(p: Pick<ParcialBoleta, "fecha_inicio" | "fecha_fin">): string {
  const rango = periodoSemestre(p.fecha_inicio, p.fecha_fin);
  return rango ? `del ${rango}` : "";
}

/* ── Quién ve qué ───────────────────────────────────────────────────────── */

/**
 * Del modo de acceso que ya resolvió `resolverAccesoAlumno` a lo que la boleta
 * permite. Lista BLANCA: un modo nuevo no hereda la boleta por omisión.
 *   familia  — alumno y tutor: solo con activación, y el parcial lo pone ella.
 *   personal — directivo y Administración escolar: siempre, eligiendo parcial.
 */
export type AlcanceVista = "familia" | "personal";

export function alcanceVistaBoleta(modo: string): AlcanceVista | null {
  if (modo === "alumno" || modo === "tutor") return "familia";
  if (modo === "directivo" || modo === "administracion") return "personal";
  return null;
}

const NIVEL: Record<AlcanceBoleta, number> = { grupo: 3, grado: 2, plantel: 1 };

/** ¿Esta activación cubre a este alumno? */
export function activacionCubre(
  a: Pick<ActivacionBoleta, "alcance" | "grado" | "grupoId">,
  alumno: { grado: string; grupoId: string },
): boolean {
  if (a.alcance === "plantel") return true;
  if (a.alcance === "grado") return normalizarGrado(a.grado) === normalizarGrado(alumno.grado);
  return Boolean(a.grupoId) && a.grupoId === alumno.grupoId;
}

/**
 * La activación que le toca a un alumno: la MÁS ESPECÍFICA que lo cubre
 * (grupo > grado > plantel) y, entre dos del mismo nivel, la más reciente.
 * Así el directivo puede activar el Parcial 2 para todos y dejar un grupo en el 1.
 */
export function activacionQueAplica(
  activas: readonly ActivacionBoleta[],
  alumno: { grado: string; grupoId: string },
): ActivacionBoleta | null {
  let mejor: ActivacionBoleta | null = null;
  for (const a of activas) {
    if (!activacionCubre(a, alumno)) continue;
    if (
      !mejor ||
      NIVEL[a.alcance] > NIVEL[mejor.alcance] ||
      (NIVEL[a.alcance] === NIVEL[mejor.alcance] && a.activadaEn > mejor.activadaEn)
    ) {
      mejor = a;
    }
  }
  return mejor;
}

/**
 * Qué parcial enseña la vista del PERSONAL: el que pidió (si es del ciclo); si no,
 * el de la activación que le toca al alumno; si no, el que contiene hoy; si no,
 * el primero. La familia no pasa por aquí: su parcial es el de la activación.
 */
export function elegirParcialBoleta(o: {
  parciales: readonly ParcialBoleta[];
  pedido: string | null;
  activacion: Pick<ActivacionBoleta, "evaluacionId"> | null;
  hoy: string;
}): ParcialBoleta | null {
  const porId = (id: string | null | undefined) => (id ? o.parciales.find((p) => p.id === id) ?? null : null);
  return (
    porId(o.pedido) ??
    porId(o.activacion?.evaluacionId) ??
    o.parciales.find((p) => o.hoy >= p.fecha_inicio && o.hoy <= p.fecha_fin) ??
    o.parciales[0] ??
    null
  );
}

/* ── Activar ────────────────────────────────────────────────────────────── */

export type EntradaActivacion = {
  evaluacionId: string;
  alcance: string;
  grado: string;
  grupoId: string;
};

export type ActivacionValida = {
  evaluacionId: string;
  alcance: AlcanceBoleta;
  grado: string | null;
  grupoId: string | null;
};

/**
 * La activación que pide el directivo, contra el ciclo operativo. El grado y el
 * grupo tienen que EXISTIR en el ciclo: un grado mal escrito no cubriría a nadie
 * y el directivo creería que activó algo. El campo que no corresponde al alcance
 * se descarta, para que el CHECK de la tabla nunca sea quien conteste.
 */
export function validarActivacion(
  e: EntradaActivacion,
  ciclo: { parciales: readonly { id: string }[]; grupos: readonly GrupoBoleta[] },
): { ok: true; datos: ActivacionValida } | { ok: false; error: string } {
  const evaluacionId = e.evaluacionId.trim();
  if (!evaluacionId) return { ok: false, error: "Elige el parcial." };
  if (!ciclo.parciales.some((p) => p.id === evaluacionId)) {
    return { ok: false, error: "Ese parcial no es del ciclo operativo." };
  }
  const alcance = e.alcance.trim() as AlcanceBoleta;
  if (!ALCANCES_BOLETA.includes(alcance)) return { ok: false, error: "Elige para quién se activa." };

  if (alcance === "plantel") return { ok: true, datos: { evaluacionId, alcance, grado: null, grupoId: null } };

  if (alcance === "grado") {
    const grado = e.grado.trim().toUpperCase();
    if (!grado) return { ok: false, error: "Elige el grado." };
    const real = gradosDelCiclo(ciclo.grupos).find((g) => normalizarGrado(g) === normalizarGrado(grado));
    if (!real) return { ok: false, error: "Ese grado no tiene grupos en el ciclo operativo." };
    return { ok: true, datos: { evaluacionId, alcance, grado: real, grupoId: null } };
  }

  const grupoId = e.grupoId.trim();
  if (!grupoId) return { ok: false, error: "Elige el grupo." };
  if (!ciclo.grupos.some((g) => g.id === grupoId)) {
    return { ok: false, error: "Ese grupo no es del ciclo operativo." };
  }
  return { ok: true, datos: { evaluacionId, alcance, grado: null, grupoId } };
}

/* ── Rótulos de los selectores y de la lista de vigentes ────────────────── */

const normalizarGrado = (g: string | null | undefined) => String(g ?? "").trim().toUpperCase();

/** «2DO A · RH». La letra se repite entre carreras: sin la carrera no se distinguen. */
export function etiquetaGrupoBoleta(g: Pick<GrupoBoleta, "grado" | "grupo" | "carreraClave">): string {
  const base = `${g.grado} ${g.grupo}`.trim();
  return g.carreraClave ? `${base} · ${g.carreraClave}` : base;
}

/** Grados distintos del ciclo, en orden (1RO, 2DO…). */
export function gradosDelCiclo(grupos: readonly Pick<GrupoBoleta, "grado">[]): string[] {
  const unicos = [...new Set(grupos.map((g) => normalizarGrado(g.grado)).filter(Boolean))];
  return unicos.sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

/** Grupos por grado, letra y carrera, como los espera quien elige. */
export function ordenarGruposBoleta<T extends GrupoBoleta>(grupos: readonly T[]): T[] {
  return [...grupos].sort((a, b) =>
    etiquetaGrupoBoleta(a).localeCompare(etiquetaGrupoBoleta(b), "es", { numeric: true }),
  );
}

/** «24/10/2026», en la hora del plantel. */
export function fechaCortaPlantel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const f = hoyEnElPlantel(new Date(t));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Una activación vigente, dicha para el directivo. */
export function etiquetaActivacion(
  a: ActivacionBoleta,
  ciclo: { parciales: readonly Pick<ParcialBoleta, "id" | "nombre">[]; grupos: readonly GrupoBoleta[] },
): { parcial: string; alcance: string; desde: string } {
  const parcial = ciclo.parciales.find((p) => p.id === a.evaluacionId)?.nombre ?? "Parcial";
  let alcance = "Todo el plantel";
  if (a.alcance === "grado") alcance = `Grado ${a.grado ?? ""}`.trim();
  if (a.alcance === "grupo") {
    const g = ciclo.grupos.find((x) => x.id === a.grupoId);
    alcance = g ? `Grupo ${etiquetaGrupoBoleta(g)}` : "Grupo (fuera del ciclo)";
  }
  return { parcial, alcance, desde: fechaCortaPlantel(a.activadaEn) };
}

/** Alumnos de un grupo por nombre, para la lista de «Consultar boleta». */
export function ordenarAlumnosBoleta<T extends { nombre: string }>(alumnos: readonly T[]): T[] {
  return [...alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/* ── La boleta ──────────────────────────────────────────────────────────── */

export function armarBoleta(d: DatosBoleta): BoletaArmada {
  const materias = [...d.materias]
    .map((m) => ({ materia: m.nombre.trim(), celda: calificacionBoleta(m.promedio) }))
    .sort((a, b) => a.materia.localeCompare(b.materia, "es"));

  return {
    titulo: TITULO_BOLETA,
    institucion: PLANTEL.nombre,
    cct: PLANTEL.cct,
    parcial: d.parcial.nombre,
    duracion: duracionParcial(d.parcial),
    nombre: d.nombre.trim().toUpperCase(),
    curp: d.curp.trim().toUpperCase(),
    numeroControl: (d.numeroControl ?? "").trim() || TEXTO_SIN_ASIGNAR,
    gradoGrupo: `${d.grado} ${d.grupo}`.trim(),
    carrera: tituloCarrera(d.carrera) ?? TEXTO_SIN_CARRERA,
    filas: materias.map((m) => ({ materia: m.materia, calificacion: m.celda.texto, estado: m.celda.estado })),
    promedioGeneral: promedioGeneral(materias.map((m) => m.celda)),
    asistencia: textoAsistencia(d.asistencia),
    leyenda: LEYENDA_BOLETA,
  };
}
