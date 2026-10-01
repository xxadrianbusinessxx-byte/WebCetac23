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
  TABLA_INSCRIPCIONES_ALUMNO,
} from "../tables.ts";
import type { FilaCalificacion, TipoCalificacion } from "./calificaciones-puro.ts";
import { tablaLegacyDeGrupoMateria } from "./puente-grupo-materia.ts";

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
      "id, materia_id, activo, materias(nombre), grupos(grado, nombre), materias_nombres_visibles(nombre_visible)",
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
    materias_nombres_visibles: Incrustado<{ nombre_visible: string }>;
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
      nombreVisible: nv?.nombre_visible ?? null,
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
