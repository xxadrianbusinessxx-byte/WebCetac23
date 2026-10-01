/**
 * calificaciones.ts — I/O de las calificaciones normalizadas.
 *
 * Sustituye el acceso a las 241 tablas físicas por materia. La DECISIÓN
 * —convertir el Excel del profesor en filas— vive en `calificaciones-puro.ts`
 * y se prueba sin base de datos; aquí solo se lee y se escribe.
 *
 * Recibe el cliente por parámetro, como el resto de `lib/escolar/`. No decide
 * permisos ni alcance: eso lo hace la action antes de llamar.
 *
 * ── La identidad ───────────────────────────────────────────────────────────
 * Todo cuelga de `grupo_materia_id`: un uuid que resuelve grupo + materia +
 * periodo de una vez, porque `grupo_materias` ya cuelga de `grupos` y `grupos`
 * de `periodos`. No se repite ninguno de los tres, y NUNCA se usa el nombre de
 * la tabla física como identificador.
 *
 * El alumno es su CURP, que es su identidad en todo el sistema (GLOSARIO).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_CALIFICACIONES,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_MATERIAS,
} from "../tables.ts";
import type { FilaCalificacion, TipoCalificacion } from "./calificaciones-puro.ts";
import { tablaLegacyDeGrupoMateria } from "./puente-grupo-materia.ts";
import { listarAliasPorGrupoMateria } from "./nombres-visibles.ts";

export type CalificacionRow = {
  id: string;
  grupo_materia_id: string;
  curp: string;
  actividad_id: string | null;
  tipo: TipoCalificacion;
  clave_columna: string | null;
  valor: number | null;
  registrado_por: number | null;
  created_at: string;
  updated_at: string;
};

export type Resultado<T> = { ok: true; dato: T } | { ok: false; error: string };

const SELECT = "id, grupo_materia_id, curp, actividad_id, tipo, clave_columna, valor, registrado_por, created_at, updated_at";

/* ── Escritura ──────────────────────────────────────────────────────────── */

/**
 * Guarda las filas ya convertidas.
 *
 * `upsert` sobre la clave `(grupo_materia_id, curp, tipo, clave_columna)`: así
 * RE-SUBIR el mismo Excel corregido ACTUALIZA las notas en vez de duplicarlas.
 * Es el comportamiento que un profesor espera —sube de nuevo y queda lo nuevo—
 * y el que la tabla física daba por reemplazo completo.
 *
 * Se trocea en lotes porque un grupo de 40 alumnos con 10 columnas son 400
 * filas, y PostgREST empieza a devolver errores opacos con cuerpos grandes.
 */
export async function guardarCalificaciones(
  supabase: SupabaseClient,
  grupoMateriaId: string,
  filas: readonly FilaCalificacion[],
  registradoPor: number | null,
  lote = 200,
): Promise<Resultado<{ escritas: number }>> {
  if (filas.length === 0) return { ok: true, dato: { escritas: 0 } };

  const ahora = new Date().toISOString();
  const payload = filas.map((f) => ({
    grupo_materia_id: grupoMateriaId,
    curp: f.curp,
    tipo: f.tipo,
    clave_columna: f.claveColumna,
    valor: f.valor,
    registrado_por: registradoPor,
    updated_at: ahora,
  }));

  let escritas = 0;
  for (let i = 0; i < payload.length; i += lote) {
    const { error } = await supabase
      .from(TABLA_CALIFICACIONES)
      .upsert(payload.slice(i, i + lote), {
        onConflict: "grupo_materia_id,curp,tipo,clave_columna",
      });
    if (error) {
      // Se informa de cuántas entraron antes de fallar: con un lote a medias,
      // decir solo «falló» dejaría al profesor sin saber si hay datos a medio
      // escribir.
      return {
        ok: false,
        error: `${error.message} (se escribieron ${escritas} de ${payload.length} antes de fallar)`,
      };
    }
    escritas += Math.min(lote, payload.length - i);
  }
  return { ok: true, dato: { escritas } };
}

/**
 * Pone la nota de UNA actividad concreta, atándola a `actividades`.
 *
 * Existe aparte de `guardarCalificaciones` porque el flujo es otro: aquí el
 * profesor califica una entrega en pantalla, no sube un archivo. Comparte tabla
 * y clave, así que una nota puesta a mano y otra subida por Excel no se
 * duplican: la segunda actualiza la primera.
 */
export async function calificarActividad(
  supabase: SupabaseClient,
  datos: {
    grupoMateriaId: string;
    curp: string;
    actividadId: string;
    claveColumna: string;
    valor: number | null;
    registradoPor: number | null;
  },
): Promise<Resultado<true>> {
  const { error } = await supabase.from(TABLA_CALIFICACIONES).upsert(
    {
      grupo_materia_id: datos.grupoMateriaId,
      curp: datos.curp,
      actividad_id: datos.actividadId,
      tipo: "actividad",
      clave_columna: datos.claveColumna,
      valor: datos.valor,
      registrado_por: datos.registradoPor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "grupo_materia_id,curp,tipo,clave_columna" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/* ── Lectura ────────────────────────────────────────────────────────────── */

/**
 * Las notas de UN alumno. El filtro por CURP va en la CONSULTA, no después de
 * traerlas: si se filtrara en memoria, un fallo de paginación o un `limit`
 * dejaría en el servidor las notas de otros alumnos a un paso de la pantalla.
 */
export async function calificacionesDeAlumno(
  supabase: SupabaseClient,
  curp: string,
  grupoMateriaId?: string,
): Promise<CalificacionRow[]> {
  let q = supabase.from(TABLA_CALIFICACIONES).select(SELECT).eq("curp", curp);
  if (grupoMateriaId) q = q.eq("grupo_materia_id", grupoMateriaId);
  const { data, error } = await q.order("tipo").order("clave_columna");
  if (error) return [];
  return (data ?? []) as CalificacionRow[];
}

/** Todas las de una materia-grupo: es la vista del profesor. */
export async function calificacionesDeGrupoMateria(
  supabase: SupabaseClient,
  grupoMateriaId: string,
): Promise<CalificacionRow[]> {
  const { data, error } = await supabase
    .from(TABLA_CALIFICACIONES)
    .select(SELECT)
    .eq("grupo_materia_id", grupoMateriaId)
    .order("curp")
    .order("clave_columna");
  if (error) return [];
  return (data ?? []) as CalificacionRow[];
}

/* ── El puente con la identidad vieja ───────────────────────────────────── */

// Vive en su propio módulo porque alias y mapeo también lo usan; se reexporta
// aquí para que quien ya lo importaba de este archivo no tenga que cambiar.
export {
  grupoMateriaDesdeTablaLegacy,
  type GrupoMateriaResuelto,
} from "./puente-grupo-materia.ts";

export type MateriaDelAlumno = {
  grupoMateriaId: string;
  materiaId: string;
  nombre: string;
  /** Alias por PAREJA (grupo, materia), que es como está guardado. */
  nombreVisible: string | null;
  grado: string;
  grupo: string;
  activo: boolean;
};

/**
 * Las materias de un alumno, por su CURP y en el ciclo operativo.
 *
 * Sale de `inscripciones_alumno` → `grupos` → `grupo_materias`, que es la
 * fuente única de alumno→grupo (R6). NUNCA de la lista de tablas físicas.
 *
 * `activo=false` en `grupo_materias` es cómo se REDUCE el volumen de materias
 * de un alumno sin borrar nada: la fila se queda con su historial de notas y
 * deja de mostrarse.
 */
export async function materiasDelAlumno(
  supabase: SupabaseClient,
  curp: string,
  soloActivas = true,
): Promise<MateriaDelAlumno[]> {
  const { data: insc } = await supabase
    .from("inscripciones_alumno")
    .select("grupo_id")
    .eq("curp", curp)
    .eq("activo", true);
  const grupos = [...new Set((insc ?? []).map((r) => (r as { grupo_id: string }).grupo_id).filter(Boolean))];
  if (grupos.length === 0) return [];

  let q = supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select(
      "id, materia_id, activo, materias(nombre), grupos(grado, nombre), materias_nombres_visibles(nombre_visible, activo)",
    )
    .in("grupo_id", grupos);
  if (soloActivas) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) return [];

  // PostgREST devuelve CADA relación incrustada como array, aunque la cardinalidad
  // real sea uno —lo confirmó `tsc` contra los tipos generados—, así que las tres
  // se desenvuelven igual. `uno()` existe para no repetir el `Array.isArray` tres
  // veces y para que quien presenta no tenga que saber nada de esto.
  type Incrustado<T> = T[] | T | null | undefined;
  const uno = <T,>(v: Incrustado<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

  type Fila = {
    id: string;
    materia_id: string;
    activo: boolean;
    materias: Incrustado<{ nombre: string }>;
    grupos: Incrustado<{ grado: string; nombre: string }>;
    materias_nombres_visibles: Incrustado<{ nombre_visible: string; activo: boolean | null }>;
  };
  return (data ?? []).map((f) => {
    const r = f as unknown as Fila;
    const materia = uno(r.materias);
    const grupo = uno(r.grupos);
    const nv = uno(r.materias_nombres_visibles);
    return {
      grupoMateriaId: r.id,
      materiaId: r.materia_id,
      nombre: materia?.nombre ?? "",
      // Un alias QUITADO (`activo=false`, que es como se quita: nunca se borra)
      // no se presenta. Sin esta condición, el alumno seguiría viendo el nombre
      // viejo de una materia después de que el técnico se lo retirara.
      nombreVisible: nv && nv.activo !== false && nv.nombre_visible?.trim() ? nv.nombre_visible.trim() : null,
      grado: grupo?.grado ?? "",
      grupo: grupo?.nombre ?? "",
      activo: r.activo,
    };
  });
}

/* ── Alta, baja y renombrado: lo que pide «expandir o reducir» ──────────── */

/**
 * Da de alta una materia en un grupo. Idempotente por la pareja: si ya existe,
 * la reactiva en vez de crear una segunda fila.
 *
 * `tabla_legacy` se deja NULA a propósito en las altas nuevas: el modelo nuevo
 * no necesita una tabla física, y crearla sería seguir alimentando la deuda.
 */
export async function altaMateriaEnGrupo(
  supabase: SupabaseClient,
  grupoId: string,
  materiaId: string,
): Promise<Resultado<{ grupoMateriaId: string }>> {
  const { data: existe } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("id")
    .eq("grupo_id", grupoId)
    .eq("materia_id", materiaId)
    .maybeSingle();

  if (existe) {
    const id = (existe as { id: string }).id;
    const { error } = await supabase
      .from(TABLA_GRUPO_MATERIAS)
      .update({ activo: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, dato: { grupoMateriaId: id } };
  }

  const { data, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .insert({ grupo_id: grupoId, materia_id: materiaId, activo: true })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: { grupoMateriaId: (data as { id: string }).id } };
}

/**
 * Activa o desactiva. NO borra: una materia dada de baja conserva sus notas, y
 * borrar la fila se las llevaría por `on delete cascade`. Reducir el volumen es
 * dejar de mostrar, no destruir el historial (R8).
 */
export async function cambiarEstadoMateriaEnGrupo(
  supabase: SupabaseClient,
  grupoMateriaId: string,
  activo: boolean,
): Promise<Resultado<true>> {
  const { error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .update({ activo, updated_at: new Date().toISOString() })
    .eq("id", grupoMateriaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/**
 * El alias de una materia EN UN GRUPO. Es un `upsert` por `grupo_materia_id`,
 * que es la clave única del puente.
 *
 * `materia_id` (texto, el nombre de la tabla física) se escribe TAMBIÉN cuando
 * la pareja tiene tabla, y queda nulo cuando no —las altas del modelo nuevo—.
 * Escribirlo vacío habría dejado el alias invisible para las pantallas viejas,
 * y omitirlo chocaba con su NOT NULL (retirado en
 * `corregir-unicidad-calificaciones.sql`).
 */
export async function guardarAlias(
  supabase: SupabaseClient,
  grupoMateriaId: string,
  nombreVisible: string,
  actualizadoPor: string | null,
): Promise<Resultado<true>> {
  // Las dos claves, si la pareja tiene tabla física: así el alias puesto desde
  // aquí lo ven también las pantallas viejas, y si una de ellas lo cambia luego
  // cae en ESTA fila y no en una segunda (ver `puente-grupo-materia.ts`).
  const legacy = await tablaLegacyDeGrupoMateria(supabase, grupoMateriaId);
  if (!legacy.ok) return legacy;

  const { error } = await supabase.from("materias_nombres_visibles").upsert(
    {
      grupo_materia_id: grupoMateriaId,
      materia_id: legacy.tablaLegacy,
      nombre_visible: nombreVisible,
      activo: true,
      actualizado_por: actualizadoPor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "grupo_materia_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/* ── El padrón de la materia ────────────────────────────────────────────── */

/**
 * Las CURP inscritas en el grupo de esta materia.
 *
 * Existe para que la subida pueda RECHAZAR lo que no pertenece al grupo. Sin
 * esta lista, una CURP mal teclada en el Excel del profesor se guardaba igual:
 * la fila quedaba con un `grupo_materia_id` válido y una CURP de nadie, así que
 * no fallaba, no aparecía en ninguna pantalla y nadie se enteraba. Ese es el
 * modo de fallo que la tabla física tenía y que normalizar no arregla por sí
 * solo —solo cambia de sitio—.
 *
 * Devuelve `null` si la materia no existe o no se pudo leer el padrón. `null`
 * y no un array vacío: «no lo sé» no puede confundirse con «no hay nadie», que
 * haría que la subida rechazara a todo el grupo.
 */
export async function curpsDelGrupoMateria(
  supabase: SupabaseClient,
  grupoMateriaId: string,
): Promise<Set<string> | null> {
  const { data: gm, error: eGm } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("grupo_id")
    .eq("id", grupoMateriaId)
    .maybeSingle();
  if (eGm || !gm?.grupo_id) return null;

  const { data, error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("curp")
    .eq("grupo_id", gm.grupo_id)
    .eq("activo", true);
  if (error || !data) return null;

  return new Set(
    (data as { curp: string | null }[])
      .map((f) => (f.curp ?? "").trim().toUpperCase())
      .filter((c) => c.length > 0),
  );
}

/**
 * ¿Admite calificaciones esta pareja? `null` si no existe o no se pudo leer.
 *
 * La subida vieja ya rechaza materias desactivadas (C4.18, `motivoMateriaNoCargable`);
 * la nueva tiene que rechazarlas igual, o desactivar una materia dejaría de
 * cerrar nada en cuanto el profesor usara el camino nuevo.
 */
export async function grupoMateriaActiva(
  supabase: SupabaseClient,
  grupoMateriaId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("activo")
    .eq("id", grupoMateriaId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { activo: boolean }).activo !== false;
}

/* ── La lista del técnico: qué materias tiene cada grupo ────────────────── */

export type ParejaParaGestion = {
  grupoMateriaId: string;
  grupoId: string;
  grado: string;
  grupo: string;
  /** Clave de la carrera del grupo, o null (1RO no tiene). Sin ella, «2DO A»
   *  de Mecatrónica y «2DO A» de RH se presentan igual: 10 de las 24
   *  etiquetas del ciclo 2026-2027 están repetidas así (medido 2026-10-01).
   *  La identidad del grupo es `grupoId`; esto es solo para presentarlo. */
  carrera: string | null;
  materiaId: string;
  materiaNombre: string;
  materiaClave: string;
  /** Alias de ESTA pareja, o null. Se presenta en lugar del nombre si existe. */
  alias: string | null;
  activo: boolean;
  /** Si la pareja tiene tabla física. Solo informativo: la UI no lo expone
   *  como identidad (C4.28), pero explica por qué una pareja nueva no aparece
   *  en las pantallas viejas. */
  tieneTablaFisica: boolean;
};

/**
 * Todas las parejas (grupo, materia) de un periodo, ACTIVAS E INACTIVAS.
 *
 * Las inactivas entran a propósito: «reducir el volumen» es desactivar, y una
 * lista que solo mostrara las activas no dejaría reactivar nada. Por eso no se
 * reutiliza `listarGruposMateriasParaAsignacion`, que solo trae las activas y
 * resuelve el alias por la tabla física.
 *
 * El alias se resuelve por pareja (`listarAliasPorGrupoMateria`): una alta del
 * modelo nuevo no tiene tabla física, y por la clave vieja no se vería.
 */
export async function listarParejasDelPeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<ParejaParaGestion[] | null> {
  const [{ data, error }, alias] = await Promise.all([
    supabase
      .from(TABLA_GRUPO_MATERIAS)
      .select("id, grupo_id, materia_id, activo, tabla_legacy, grupos!inner(grado, nombre, periodo_id, carreras(clave)), materias(nombre, clave)")
      .eq("grupos.periodo_id", periodoId),
    listarAliasPorGrupoMateria(supabase),
  ]);
  if (error || !data) return null;

  type Incrustado<T> = T[] | T | null | undefined;
  const uno = <T,>(v: Incrustado<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  type Fila = {
    id: string;
    grupo_id: string;
    materia_id: string;
    activo: boolean;
    tabla_legacy: string | null;
    grupos: Incrustado<{ grado: string; nombre: string; carreras: Incrustado<{ clave: string | null }> }>;
    materias: Incrustado<{ nombre: string | null; clave: string | null }>;
  };

  return (data as unknown as Fila[])
    .map((r) => {
      const g = uno(r.grupos);
      const m = uno(r.materias);
      return {
        grupoMateriaId: r.id,
        grupoId: r.grupo_id,
        grado: g?.grado ?? "",
        grupo: g?.nombre ?? "",
        carrera: uno(g?.carreras)?.clave ?? null,
        materiaId: r.materia_id,
        materiaNombre: m?.nombre ?? m?.clave ?? "",
        materiaClave: m?.clave ?? "",
        alias: alias.get(r.id) ?? null,
        activo: r.activo !== false,
        tieneTablaFisica: Boolean(r.tabla_legacy && r.tabla_legacy.trim()),
      };
    })
    .sort(
      (a, b) =>
        a.grado.localeCompare(b.grado) ||
        a.grupo.localeCompare(b.grupo) ||
        (a.carrera ?? "").localeCompare(b.carrera ?? "") ||
        (a.alias ?? a.materiaNombre).localeCompare(b.alias ?? b.materiaNombre),
    );
}

export type CatalogoParaAlta = {
  /** Los grupos del periodo, TAMBIÉN los que aún no tienen ninguna materia:
   *  sacarlos de las parejas los dejaría fuera justo cuando más hace falta. */
  grupos: { id: string; grado: string; nombre: string; carrera: string | null }[];
  /** Las materias ACTIVAS del catálogo: dar de alta una inactiva sería
   *  ofrecer en un grupo algo que el catálogo ya retiró. */
  materias: { id: string; nombre: string; clave: string }[];
};

/** Lo que la pantalla del técnico necesita para ofrecer un alta. */
export async function catalogoParaAlta(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<CatalogoParaAlta | null> {
  const [g, m] = await Promise.all([
    supabase.from(TABLA_GRUPOS).select("id, grado, nombre, carreras(clave)").eq("periodo_id", periodoId).eq("activo", true),
    supabase.from(TABLA_MATERIAS).select("id, nombre, clave").eq("activo", true),
  ]);
  if (g.error || m.error || !g.data || !m.data) return null;
  return {
    grupos: (
      g.data as {
        id: string;
        grado: string | null;
        nombre: string | null;
        carreras: { clave: string | null }[] | { clave: string | null } | null;
      }[]
    )
      .map((x) => {
        const c = Array.isArray(x.carreras) ? x.carreras[0] : x.carreras;
        return { id: x.id, grado: x.grado ?? "", nombre: x.nombre ?? "", carrera: c?.clave ?? null };
      })
      .sort(
        (a, b) =>
          a.grado.localeCompare(b.grado) ||
          a.nombre.localeCompare(b.nombre) ||
          (a.carrera ?? "").localeCompare(b.carrera ?? ""),
      ),
    materias: (m.data as { id: string; nombre: string | null; clave: string | null }[])
      .map((x) => ({ id: x.id, nombre: x.nombre ?? x.clave ?? "", clave: x.clave ?? "" }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}
