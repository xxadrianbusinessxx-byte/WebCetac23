/**
 * leer-form-data.ts — el ÚNICO sitio donde una Server Action lee un `FormData`.
 *
 * QUÉ ES: la frontera. Una action deja de hacer `String(formData.get("x") ?? "")` y pasa a
 * declarar «qué espero» y a llamar aquí.
 *
 * DOS COSAS QUE NO SE INVENTAN:
 *
 * 1. **La forma de la respuesta es la que ya había.** `{ ok: true, datos }` /
 *    `{ ok: false, error }` es lo que devuelven hoy las actions del repo. Un tercer
 *    convenio de respuesta obligaría a traducir en cada llamada y a mantener dos
 *    contratos vivos a la vez.
 * 2. **El mensaje de error es el del esquema, no el del validador.** `error` sale tal
 *    cual del primer fallo —«Selecciona una imagen», «Indica identificador y clave»—,
 *    que es texto escrito para el usuario. Nada de `Invalid type: Expected File but
 *    received string`, y nada del nombre del campo.
 *
 * POR QUÉ NO RECORTA NI CONVIERTE POR SU CUENTA: si el helper «arreglara» lo que llega
 * (`String(x ?? "")`), volvería a esconder el caso raro que el esquema existe para ver.
 * Lo que decide qué se recorta es el esquema, campo a campo, y está escrito allí.
 *
 * ORDEN EN LA ACTION (del prompt, literal): **autorizar, luego validar, luego delegar**.
 * Esto es el paso 2. Validar antes de `exigir()` sería trabajo regalado a quien no tiene
 * permiso, y filtraría información por los mensajes de error.
 */
import * as v from "valibot";

/** Mismo contrato que las actions: `ok` con datos, o el mensaje para el usuario. */
export type ResultadoEntrada<T> = { ok: true; datos: T } | { ok: false; error: string };

/**
 * Convierte el `FormData` en un objeto plano de `unknown`, SIN interpretar nada: `get()`
 * devuelve `string | File | null` y los tres casos llegan al esquema tal cual.
 */
function planoDe(formData: FormData): Record<string, unknown> {
  const plano: Record<string, unknown> = {};
  for (const [clave, valor] of formData.entries()) {
    // Un campo repetido llega como array; se conserva para que el esquema lo rechace si
    // no lo espera, en vez de quedarse con el último en silencio.
    const previo = plano[clave];
    if (previo === undefined) plano[clave] = valor;
    else if (Array.isArray(previo)) previo.push(valor);
    else plano[clave] = [previo, valor];
  }
  return plano;
}

/**
 * Lee y valida. Devuelve el dato ya tipado o el primer mensaje de error del esquema.
 *
 * Uso en una action:
 *
 * ```ts
 * const entrada = leerFormData(esquemaLogin, formData);
 * if (!entrada.ok) return { error: entrada.error };
 * const { identificador, clave } = entrada.datos;
 * ```
 *
 * ── Por qué se validan los CAMPOS en orden y no el objeto entero ────────────
 * Porque `v.safeParse(objeto, …)` responde a un campo AUSENTE con el mensaje del
 * OBJETO, no con el del campo: valibot emite `invalid_key` y no llega a ejecutar el
 * esquema de ese campo. Y dos actions del repo tienen mensajes distintos por campo
 * —`calificaciones.ts` dice «Faltan datos de sesión o materia.» si falta la materia y
 * «Selecciona un archivo válido.» si falta el archivo—, así que con el objeto entero
 * una de las dos frases desaparecía. Se comprobó: sin esto, un POST sin archivo
 * devolvía el mensaje de la materia.
 *
 * Validando campo a campo, en el orden en que están declarados, cada uno falla con SU
 * mensaje y el primero que falla es el que ve el usuario — que es exactamente el orden
 * en que las actions comprobaban a mano. El mensaje del `v.object` queda como respaldo
 * para un esquema que no sea un objeto.
 */
export function leerFormData<TSchema extends v.GenericSchema>(
  esquema: TSchema,
  formData: FormData,
): ResultadoEntrada<v.InferOutput<TSchema>> {
  const plano = planoDe(formData);
  const entradas = entradasDe(esquema);

  if (entradas) {
    const salida: Record<string, unknown> = {};
    for (const [clave, campo] of entradas) {
      const r = v.safeParse(campo, plano[clave]);
      if (!r.success) return { ok: false, error: mensajeDe(r.issues[0], mensajeRespaldo(esquema)) };
      salida[clave] = r.output;
    }
    return { ok: true, datos: salida as v.InferOutput<TSchema> };
  }

  const r = v.safeParse(esquema, plano);
  if (r.success) return { ok: true, datos: r.output };
  return { ok: false, error: mensajeDe(r.issues[0], mensajeRespaldo(esquema)) };
}

/** Los campos declarados de un esquema de objeto, en su orden de declaración. */
function entradasDe(esquema: v.GenericSchema): [string, v.GenericSchema][] | null {
  const tal = esquema as { type?: string; entries?: unknown };
  if (tal.type !== "object" || !tal.entries || typeof tal.entries !== "object") return null;
  return Object.entries(tal.entries as Record<string, v.GenericSchema>);
}

/** El mensaje declarado en el propio `v.object`, si lo tiene. */
function mensajeRespaldo(esquema: v.GenericSchema): string {
  const tal = esquema as { message?: string };
  return typeof tal.message === "string" ? tal.message : "Los datos enviados no son válidos.";
}

/**
 * El mensaje del primer fallo, tal cual está escrito en el esquema. Todos los esquemas
 * de `lib/validacion/` declaran el suyo: si alguno se olvidara, valibot devolvería su
 * texto en inglés y lo leería el usuario. El respaldo existe para que eso no pase.
 */
function mensajeDe(issue: v.BaseIssue<unknown> | undefined, respaldo: string): string {
  const texto = issue?.message;
  return typeof texto === "string" && texto.trim() ? texto : respaldo;
}
