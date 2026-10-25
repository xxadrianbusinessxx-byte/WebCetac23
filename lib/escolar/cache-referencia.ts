/**
 * cache-referencia.ts — PROMPT Z. Caché CORTA, por instancia, de DATOS DE REFERENCIA
 * que se leen en casi todas las pantallas y cambian muy de vez en cuando: el ciclo
 * operativo y sus parciales (`periodos`, `periodos_evaluacion`) y la portada pública.
 *
 * Por qué: en el plan gratuito lo que se satura bajo carga es el NÚMERO de peticiones
 * (FASE 11 / PROMPT Y). En una sesión de alumno el ciclo operativo se leía en 4 de 8
 * pantallas y la portada costaba 4 peticiones en cada visita a `/`.
 *
 * Reglas para no convertirla en una segunda fuente de verdad:
 *   · Nunca guarda datos de UN alumno: solo referencia común a todos.
 *   · Solo la usan LECTURAS que lo piden explícitamente; toda escritura sigue
 *     leyendo de la base sin caché.
 *   · Caduca pronto (lo fija cada espacio) y cada escritura del dominio llama a
 *     `invalidarCacheReferencia(espacio)` (en esta instancia; en las demás, el TTL
 *     acota lo que tarda en verse: mismo patrón que O3 y O5).
 *   · Las lecturas simultáneas comparten una sola consulta (la promesa en curso).
 *   · Solo se guarda un resultado bueno; un error no se cachea.
 *   · Cada lector recibe su propia COPIA (`structuredClone`): nadie altera lo guardado.
 */

export type EspacioCache = "ciclo" | "portada";

const TTL_MS: Record<EspacioCache, number> = {
  /** Ciclo operativo y parciales: se cambian al configurar el semestre. */
  ciclo: 20_000,
  /** Portada pública: la edita el directivo de vez en cuando. */
  portada: 60_000,
};

const guardados = new Map<string, { valor: unknown; vence: number }>();
const enCurso = new Map<string, Promise<unknown>>();
/** Sube con cada invalidación del espacio: una lectura que empezó antes no guarda. */
const generacion: Record<EspacioCache, number> = { ciclo: 0, portada: 0 };

export async function conCacheReferencia<T>(
  espacio: EspacioCache,
  clave: string,
  leer: () => Promise<T>,
  sePuedeGuardar: (valor: T) => boolean,
): Promise<T> {
  const k = `${espacio}:${clave}`;
  const g = guardados.get(k);
  if (g && g.vence > Date.now()) return structuredClone(g.valor as T);
  const pendiente = enCurso.get(k);
  if (pendiente) return (pendiente as Promise<T>).then((v) => structuredClone(v));

  const miGeneracion = generacion[espacio];
  const lectura = leer().then(
    (valor) => {
      if (miGeneracion === generacion[espacio]) {
        enCurso.delete(k);
        if (sePuedeGuardar(valor)) {
          guardados.set(k, { valor: structuredClone(valor), vence: Date.now() + TTL_MS[espacio] });
        }
      }
      return valor;
    },
    (e: unknown) => {
      if (miGeneracion === generacion[espacio]) enCurso.delete(k);
      throw e;
    },
  );
  enCurso.set(k, lectura);
  // El original nunca sale de aquí: también quien lanzó la lectura recibe una copia.
  return lectura.then((v) => structuredClone(v));
}

/** Tras cualquier escritura del dominio del espacio. */
export function invalidarCacheReferencia(espacio: EspacioCache): void {
  generacion[espacio]++;
  for (const k of [...guardados.keys()]) if (k.startsWith(`${espacio}:`)) guardados.delete(k);
  for (const k of [...enCurso.keys()]) if (k.startsWith(`${espacio}:`)) enCurso.delete(k);
}
