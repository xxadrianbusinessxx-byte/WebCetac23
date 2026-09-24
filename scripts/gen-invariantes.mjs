#!/usr/bin/env node
/**
 * gen-invariantes.mjs — escribe docs/normativo/INVARIANTES.md desde el ensayo.
 *
 * QUÉ MIDE: nada por su cuenta. LEE las líneas `INVARIANTE:` de
 *           `filosofia.estructural` (la autoridad #2 del repo, 16 secciones hoy) y
 *           las publica como una tabla que sí cabe en la lectura de arranque.
 * QUÉ ESCRIBE: `docs/normativo/INVARIANTES.md`. Ni base de datos ni red.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-invariantes.mjs           # reescribe el archivo
 *   node scripts/gen-invariantes.mjs --check   # no escribe; sale 1 si hay desfase
 *                                              # (mismo contrato que gen-matriz-permisos)
 *
 * ── Por qué se DERIVA y no se redacta ──────────────────────────────────────
 * Un resumen escrito a mano de los 16 principios sería una SEGUNDA fuente de la
 * filosofía: el día que alguien matice el ensayo, el resumen —que es el que se
 * lee al arrancar— miente (R6). Así que la decisión vive en el ensayo, en una
 * línea `INVARIANTE:` por sección, y este script solo la lee.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 * No reescribe, ni recorta, ni reordena el ensayo: `filosofia.estructural` se
 * edita a mano. Si una sección no declara invariante, este script PARA y lo
 * reporta —eso es un hallazgo sobre el ensayo, no algo que rellenar aquí—.
 *
 * ── Las dos guardas de ancho, y por qué existen ────────────────────────────
 * `ANCHO_INVARIANTE` (120) y `MINIMO_PALABRAS` (10) acotan por arriba y por
 * abajo la misma cosa: que la línea siga siendo UNA línea que obliga a algo.
 *
 * El tope existía para que la frase no se convirtiera en un párrafo. Se subió de
 * 100 a 120 en el PROMPT G-bis porque §13 necesitaba 103 y la alternativa era
 * comprimir la obligación hasta que desapareciera: el límite está para que la
 * línea sea una línea, no para acortar el mandato.
 *
 * El MÍNIMO es la lección del PROMPT G. Un invariante que es el TÍTULO de su
 * sección pasa los dos `--check` sin problema: es idéntico a su fuente, solo que
 * su fuente no dice nada. Con el techo apretado, 10 de los 16 quedaron así
 * («Un dato, una fuente»), que es literalmente el contraejemplo que el prompt
 * que los pidió daba de lo que NO sirve.
 *
 * Por qué el ancho y no algo más listo: se probó la regla obvia —«la frase no
 * puede estar contenida en el título de su sección»— y NO atrapa el caso que
 * originó todo esto. Normalizado, «un dato una fuente» no está contenido en
 * «fuente unica de verdad» ni al revés, así que §4 habría pasado. Una etiqueta y
 * una obligación no se distinguen por las palabras que comparten, sino por si
 * hay sitio para un sujeto, un verbo y un objeto — y eso, en español, son más de
 * nueve palabras.
 *
 * El número está medido sobre los dos conjuntos reales de este repo, no elegido:
 *   · las 16 frases que NO servían (las del PROMPT G): 4 a 9 palabras, 20 a 41 car.;
 *   · las 16 que las sustituyen:                        12 a 18 palabras, 74 a 95 car.
 * Separa sin un solo falso positivo. Sin este párrafo, el 10 parece arbitrario y
 * el primero que tropiece lo bajará; con él, bajarlo exige medir contra las dos
 * listas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENSAYO = path.join(raiz, "filosofia.estructural");
const DOC = path.join(raiz, "docs", "normativo", "INVARIANTES.md");
const soloComprobar = process.argv.includes("--check");

/** El ensayo declara 16 secciones. Si dejan de ser 16, esto falla y se decide a mano. */
const SECCIONES_ESPERADAS = 16;
/** Tope de la frase, en caracteres: que siga siendo UNA línea y no un párrafo. */
const ANCHO_INVARIANTE = 120;
/**
 * Suelo de la frase, en palabras. Ver «Las dos guardas de ancho» en la cabecera:
 * una etiqueta de cuatro palabras pasa los dos `--check` y no obliga a nada. El 10
 * está medido contra los dos conjuntos reales de este repo (4–9 palabras las malas,
 * 12–18 las buenas), no elegido a ojo.
 */
const MINIMO_PALABRAS = 10;
/** Una sección puede declarar que NO tiene invariante propio: entonces no sale en la tabla. */
const SIN_INVARIANTE = "—";
const PREFIJO = "INVARIANTE:";
/** Palabras de una frase, contadas por espacios: es lo que cuenta el ojo que la lee. */
const palabras = (t) => t.split(/\s+/).filter(Boolean).length;

/**
 * Cabecera del documento generado. Dice qué es, que es generado, y dónde está el
 * porqué. El número de líneas se DERIVA: si una sección declara `INVARIANTE: —`
 * (no tiene invariante propio), la tabla tiene una fila menos y el título no miente.
 */
function cabecera(filas, omitidas) {
  const fuera = [
    `# INVARIANTES — ${filas} principios, uno por línea`,
    "",
    "**Generado por `node scripts/gen-invariantes.mjs` — no editar a mano.** El § es esa sección",
    "de `filosofia.estructural`: fuente y porqué; `docs/00-INDICE.md` sigue mandando allí.",
  ];
  if (omitidas) {
    fuera.push(
      "",
      `> ${omitidas} sección(es) del ensayo declaran \`INVARIANTE: —\` —no tienen invariante propio— y no aparecen aquí.`,
    );
  }
  fuera.push("", "| § | INVARIANTE |", "|---|---|");
  return fuera;
}

/**
 * Extrae las secciones del ensayo. Una sección empieza donde una línea
 * `N. TÍTULO` va entre dos líneas de `=`, y su invariante es la primera línea
 * no vacía después de esa cabecera.
 */
function secciones(texto) {
  const lineas = texto.split(/\r?\n/);
  const fuera = [];
  for (let i = 1; i < lineas.length - 1; i++) {
    const m = /^(\d+)\.\s+(.+?)\s*$/.exec(lineas[i]);
    if (!m || !/^=+$/.test(lineas[i - 1]) || !/^=+$/.test(lineas[i + 1])) continue;
    let invariante = null;
    for (let j = i + 2; j < lineas.length; j++) {
      if (!lineas[j].trim()) continue;
      if (lineas[j].trim().startsWith(PREFIJO)) invariante = lineas[j].trim().slice(PREFIJO.length).trim();
      break;
    }
    fuera.push({ numero: Number(m[1]), titulo: m[2], linea: i + 1, invariante });
  }
  return fuera;
}

const analisis = secciones(fs.readFileSync(ENSAYO, "utf8"));
const problemas = [];

if (analisis.length !== SECCIONES_ESPERADAS) {
  problemas.push(`El ensayo declara ${analisis.length} secciones y se esperaban ${SECCIONES_ESPERADAS}.`);
}
for (const s of analisis) {
  if (!s.invariante) {
    problemas.push(`§${s.numero} ${s.titulo} (línea ${s.linea}) NO declara ningún \`${PREFIJO}\`: hay que decidirlo en el ensayo, o marcar \`${PREFIJO} ${SIN_INVARIANTE}\` si esa sección no tiene invariante propio.`);
  } else if (s.invariante === SIN_INVARIANTE) {
    continue; // declarado a propósito: la sección no tiene invariante propio
  } else if (s.invariante.length > ANCHO_INVARIANTE) {
    problemas.push(`§${s.numero} declara ${s.invariante.length} caracteres; el tope es ${ANCHO_INVARIANTE}.`);
  } else if (palabras(s.invariante) < MINIMO_PALABRAS) {
    problemas.push(
      `§${s.numero} declara ${palabras(s.invariante)} palabra(s) («${s.invariante}»); el mínimo es ` +
        `${MINIMO_PALABRAS}. Una frase tan corta no obliga a nada: suele ser el título de la sección.`,
    );
  }
}

const conInvariante = analisis.filter((s) => s.invariante && s.invariante !== SIN_INVARIANTE);
const sinInvariante = analisis.filter((s) => s.invariante === SIN_INVARIANTE);
const filas = conInvariante.map((s) => `| §${s.numero} | ${s.invariante} |`);
const salida = [...cabecera(filas.length, sinInvariante.length), ...filas, ""].join("\n");

if (problemas.length) {
  console.error("El ensayo no permite derivar el índice de invariantes:");
  for (const p of problemas) console.error(`  · ${p}`);
  console.error("\nNo se escribe nada: la sección que no declara invariante es un hallazgo, no un hueco que rellenar.");
  process.exit(1);
}

const actual = fs.existsSync(DOC) ? fs.readFileSync(DOC, "utf8").split("\r\n").join("\n") : null;
const desfasado = actual !== salida;

if (soloComprobar) {
  console.log(desfasado ? "DESFASADO: el índice no coincide con el ensayo." : "Al día.");
} else if (desfasado) {
  fs.writeFileSync(DOC, salida);
  const omitidas = sinInvariante.length ? ` (${sinInvariante.length} sección(es) sin invariante propio)` : "";
  console.log(`INVARIANTES.md regenerado: ${filas.length} invariantes desde filosofia.estructural${omitidas}.`);
} else {
  console.log("Sin cambios.");
}

process.exit(soloComprobar && desfasado ? 1 : 0);
