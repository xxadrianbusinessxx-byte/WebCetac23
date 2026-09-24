/**
 * esquemas-puro.ts — qué puede llegar por la frontera de una Server Action.
 *
 * QUÉ ES: los esquemas de entrada del portal, declarados UNA vez. `exigir()` responde
 * «este rol puede hacer esto»; esto responde «esto que ha llegado es lo que dice ser».
 * Sin lo segundo, un `formData.get("curp")` con algo inesperado va directo a una consulta
 * —y en este repo las policies de RLS son `USING (true)`, así que no hay segunda red—.
 *
 * QUÉ NO ES: no hace I/O, no habla con Supabase y no conoce ninguna action. Es un módulo
 * `-puro` de los que exige C5, y por eso tiene suite (`scripts/test-validacion.mjs`) y
 * por eso solo importa `valibot`: así Node lo carga directo, sin compilarlo (PROMPT H).
 *
 * ── Los mensajes son los de ANTES ──────────────────────────────────────────
 * Cada mensaje de aquí está copiado del texto en castellano que la action devolvía al
 * usuario. El prompt lo pedía: no degradar «Selecciona una imagen» a un volcado del
 * validador. El usuario no tiene que leer el nombre del campo que falló, y por eso el
 * helper `leerFormData` devuelve el mensaje del PRIMER fallo, tal cual está escrito.
 *
 * ── Los límites son los de HOY, no los que me gustarían ────────────────────
 * Regla del prompt: «una entrada que hoy se acepta tiene que seguir aceptándose». Por eso
 * aquí no hay una comprobación de 18 caracteres para la CURP ni un patrón de fecha donde
 * el código no lo tenía: eso rechazaría entradas que hoy pasan. Lo que sí hay son las
 * reglas que YA existían (archivo no vacío, imagen, tamaño máximo de documentos) y cotas
 * de cordura que ninguna entrada real alcanza (200 caracteres para un identificador).
 */
import * as v from "valibot";

/** Los mensajes, en un solo sitio, con el texto exacto que ya devolvía cada action. */
export const MSJ = {
  archivo: "Selecciona un archivo válido.",
  archivoExcel: "Selecciona un archivo Excel válido.",
  imagen: "Selecciona una imagen.",
  login: "Indica identificador y clave.",
} as const;

/** Cota de cordura para textos de identificador/clave. Nada legítimo la alcanza. */
const MAX_TEXTO = 200;

/**
 * Texto obligatorio, recortado — exactamente `String(formData.get(x) ?? "").trim()`
 * seguido del `if (!valor)` que hacía cada action. El recorte va ANTES de exigir contenido:
 * un campo con solo espacios es un campo vacío, y era así como se comportaba.
 */
export const texto = (mensaje: string, max = MAX_TEXTO) =>
  v.pipe(
    v.custom<unknown>((x) => typeof x === "string", mensaje),
    v.transform((x) => (x as string).trim()),
    v.nonEmpty(mensaje),
    v.maxLength(max, mensaje),
  );

/** Texto obligatorio SIN recortar: `clave` es el caso — una clave puede acabar en espacio. */
export const textoSinRecortar = (mensaje: string, max = MAX_TEXTO) =>
  v.pipe(
    v.custom<unknown>((x) => typeof x === "string", mensaje),
    v.transform((x) => x as string),
    v.nonEmpty(mensaje),
    v.maxLength(max, mensaje),
  );

/** Texto obligatorio, recortado (como hacía `String(...).trim()`), y en mayúsculas. */
export const textoMayusculas = (mensaje: string, max = MAX_TEXTO) =>
  v.pipe(texto(mensaje, max), v.transform((s) => s.toUpperCase()));

/** Texto opcional: ausente se queda en `""`, que es lo que hacía `?? ""`. */
export const textoOpcional = (mensaje: string, max = MAX_TEXTO) =>
  v.pipe(
    v.optional(v.custom<unknown>((x) => x === undefined || x === null || typeof x === "string", mensaje), ""),
    v.transform((x) => (typeof x === "string" ? x : "")),
    v.maxLength(max, mensaje),
  );

/**
 * Archivo obligatorio y no vacío: exactamente `!(x instanceof File) || x.size === 0`.
 * Donde YA había un tope de tamaño existe `archivoConTope`, para no añadir uno nuevo:
 * «una entrada que hoy se acepta tiene que seguir aceptándose».
 */
export const archivo = (mensaje: string = MSJ.archivo) =>
  v.pipe(
    v.custom<unknown>((x) => x instanceof File && x.size > 0, mensaje),
    v.transform((x) => x as File),
  );

/**
 * Archivo con tope, con su PROPIO mensaje para «demasiado grande»: la action ya distinguía
 * los dos casos y los dos textos son distintos. El tope se INYECTA en la llamada para que
 * siga habiendo una sola fuente del número (`DOCUMENTO_MAX_BYTES`, `JUSTIFICACION_MAX_BYTES`).
 */
export const archivoConTope = (mensaje: string, maxBytes: number, mensajeGrande: string) =>
  v.pipe(
    archivo(mensaje),
    v.check((f: File) => f.size <= maxBytes, mensajeGrande),
  );

/** Solo «es un File»: `materias.ts` no comprobaba el tamaño, y no se le añade uno. */
export const archivoPresente = (mensaje: string) =>
  v.pipe(
    v.custom<unknown>((x) => x instanceof File, mensaje),
    v.transform((x) => x as File),
  );

/**
 * Imagen: archivo no vacío + `type` empieza por `image/`. Dos mensajes porque las dos
 * ramas decían cosas distintas: «Selecciona una imagen.» y «Solo se permiten imágenes.».
 */
export const imagen = (mensaje: string = MSJ.imagen, mensajeTipo: string = "Solo se permiten imágenes.") =>
  v.pipe(
    archivo(mensaje),
    v.check((f: File) => f.type.startsWith("image/"), mensajeTipo),
  );

/**
 * Login: la puerta de entrada del portal, y el único sitio al que se llega SIN sesión
 * —por tanto antes de que `exigir()` pueda decir nada—. Dos campos, los dos obligatorios.
 * `clave` NO se recorta: hoy no se recortaba, y una clave puede terminar en espacio.
 *
 * El mensaje va TAMBIÉN en el `v.object`: cuando el POST no trae la clave, valibot no
 * llega a ejecutar el esquema del campo y emitiría su propio texto en inglés («Invalid
 * key: Expected "clave"…»). El mensaje del objeto cubre ese caso.
 */
export const esquemaLogin = v.object(
  {
    identificador: texto(MSJ.login),
    clave: textoSinRecortar(MSJ.login),
  },
  MSJ.login,
);

// ── Los esquemas de cada action, con el texto EXACTO que devolvía ──────────
// Uno por punto de entrada, en el mismo orden que `app/actions/`. El mensaje del
// `v.object` no es decorativo: cuando el POST no trae la clave, valibot no llega a
// ejecutar el esquema del campo y sin él saldría su texto en inglés.

/** `noticias.ts` · actionPublicarNoticiaInicio */
export const esquemaNoticia = v.object(
  { archivo: imagen(MSJ.imagen, "Solo se permiten imágenes.") },
  MSJ.imagen,
);

/** `materias.ts` · actionPrevisualizarAliasArchivo (solo comprobaba `instanceof File`) */
export const esquemaAliasArchivo = v.object({ archivo: archivoPresente("Selecciona un archivo.") }, "Selecciona un archivo.");

/** `documentos.ts` · actionSubirDocumento — el tope de 20 MB lo pone la action, con su número. */
export const esquemaSubirDocumento = (maxBytes: number) =>
  v.object({ archivo: archivoConTope(MSJ.archivo, maxBytes, "El archivo supera el límite de 20MB.") }, MSJ.archivo);

/** `asistencias.ts` · analizar y confirmar: el mismo campo, el mismo mensaje. */
export const esquemaArchivoAsistencias = v.object({ archivo: archivo(MSJ.archivo) }, MSJ.archivo);

/** `calificaciones.ts` · materiaId ANTES que archivo: hoy se comprobaba en ese orden. */
export const esquemaSubirCalificaciones = v.object(
  {
    materiaId: texto("Faltan datos de sesión o materia."),
    archivo: archivo(MSJ.archivo),
  },
  "Faltan datos de sesión o materia.",
);

/** `escolar.ts` · subir/actualizar materia o registro: mismo campo y mensaje en los 6 usos. */
export const esquemaArchivoMateria = v.object({ archivo: archivo(MSJ.archivo) }, MSJ.archivo);

/** `escolar.ts` · actionSubirFotoPerfil: los dos mensajes, igual que antes. */
export const esquemaFotoPerfil = v.object(
  { archivo: imagen(MSJ.imagen, "Solo se permiten imágenes.") },
  MSJ.imagen,
);

/** `escolar.ts` · sincronizar/`previsualizar` roster: archivo + el `mapeo` que traía el POST. */
export const esquemaRoster = v.object(
  {
    archivo: archivo(MSJ.archivo),
    mapeo: textoOpcional("El mapeo de columnas enviado no es válido."),
  },
  MSJ.archivo,
);

/** `etiquetas-dinamicas.ts` · individual y global. */
export const esquemaArchivoEtiquetas = v.object(
  { archivo: archivo("Selecciona un archivo Excel válido.") },
  "Selecciona un archivo Excel válido.",
);

/** `horario.ts` · preview y aplicar. */
export const esquemaArchivoHorario = v.object(
  { archivo: archivo("Selecciona un archivo Excel válido.") },
  "Selecciona un archivo Excel válido.",
);

/**
 * `justificaciones.ts` · actionSolicitarJustificacionConArchivo.
 * El tope de 5 MB entra por parámetro (`JUSTIFICACION_MAX_BYTES`) y el límite de longitud
 * del motivo NO se declara aquí: la action ya lo comprueba con un mensaje que dice cuál es
 * el límite, y ese texto es mejor que cualquiera genérico. La cota de aquí solo evita que
 * llegue un texto absurdo a la comprobación.
 */
export const esquemaSolicitarJustificacion = (maxBytes: number) =>
  v.object(
    {
      curp: textoMayusculas("Indica CURP, fecha y motivo."),
      fecha: texto("Indica CURP, fecha y motivo."),
      motivo: texto("Indica CURP, fecha y motivo.", 2000),
      materia_clave: textoOpcional("Indica CURP, fecha y motivo."),
      archivo: archivoConTope(
        "Adjunta un archivo (PDF, PNG o JPG) obligatorio.",
        maxBytes,
        "El archivo supera el tamaño máximo (5 MB).",
      ),
    },
    "Indica CURP, fecha y motivo.",
  );

/**
 * `carga-academica.ts` · contexto y mapeo, los dos OPCIONALES (ausentes → `""`), como hoy.
 * El contenido del `mapeo` lo sigue validando `mapeoRosterValido` en la capa de dominio:
 * replicarlo aquí sería una segunda fuente de la misma regla.
 */
export const esquemaCargaAcademica = v.object(
  {
    archivo: archivo(MSJ.archivo),
    mapeo: textoOpcional("El mapeo de columnas enviado no es válido.", 20000),
    periodoId: textoOpcional("Datos del periodo no válidos."),
    periodoNombre: textoOpcional("Datos del periodo no válidos."),
    grado: textoOpcional("Datos del grupo no válidos."),
    grupo: textoOpcional("Datos del grupo no válidos."),
    carrera: textoOpcional("Datos del grupo no válidos."),
  },
  MSJ.archivo,
);
