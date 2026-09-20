// verificar-docs.mjs — VERIFICACIÓN DEL SISTEMA DE DOCUMENTACIÓN (SOLO LECTURA, sin red)
//
// `verificar-estado-actual.mjs` comprueba que UN documento siga siendo verdad.
// Este comprueba que el SISTEMA de documentos siga siendo utilizable:
//
//   1. RUTAS VIVAS  — ningún documento del presente cita un archivo que ya no
//      existe. Un agente que abre `docs/sistema/MATRIZ-UX.md` y busca
//      `app/components/ui/barra-navegacion.tsx` (retirado en `8d17188`) gasta
//      contexto para no encontrar nada, y luego no sabe qué más del documento
//      es falso.
//   2. COSTE DE ARRANQUE — la lectura obligatoria de `AGENTS.md` la pagan
//      Claude y Cline en CADA sesión nueva. Es la única cifra de tokens que se
//      paga siempre, así que es la única que necesita un techo en el CI.
//
// El motivo es el mismo que el de `gen:matriz -- --check`: una regla sin
// verificación automática se degrada sola. La regla «la documentación describe
// el presente» no la sostenía nada.
//
// Uso:  node scripts/verificar-docs.mjs
//       node scripts/verificar-docs.mjs --json   (para gen-estado.mjs)
// Sale con código 1 si algo diverge. Pensado para el CI.
//
// `docs/historial/` NO se escanea, a propósito: por definición describe un
// momento pasado y cita archivos que pudieron desaparecer después. Exigirle
// rutas vivas sería exigirle que dejara de ser historial.

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const abs = (rel) => path.join(root, rel);
const existe = (rel) => fs.existsSync(abs(rel));
const leer = (rel) => fs.readFileSync(abs(rel), "utf8");
const pesa = (rel) => (existe(rel) ? fs.statSync(abs(rel)).size : 0);
/** Aproximación estándar del repo: ~4 bytes por token. */
const tok = (b) => Math.round(b / 4);

const JSON_OUT = process.argv.includes("--json");
const fallos = [];
const avisos = [];

// ── 1) Coste de arranque ───────────────────────────────────────────────────
// La lectura obligatoria que declara `AGENTS.md`, más `CLAUDE.md`: Claude Code
// lo carga solo, sin que nadie se lo pida, así que se paga aunque `AGENTS.md`
// no lo liste.
//
// Esta lista es la FUENTE de esa medida. `gen-estado.mjs` la lee de aquí por
// `--json` en vez de recalcularla: dos listas divergirían al primer cambio
// (R6), y la que enseñara el panel dejaría de ser la que vigila el CI.
const ARRANQUE = [
  "AGENTS.md",
  "CLAUDE.md",
  "ESTADO-ACTUAL.md",
  "RUMBO.md",
  "docs/normativo/REGLAS_NO_HACER.md",
  "docs/normativo/INVARIANTES.md",
  "docs/normativo/GLOSARIO.md",
  "docs/00-INDICE.md",
];

// El techo no es un ideal: es el freno. Al fijarlo (2026-09-19) el arranque
// costaba 8 718 tokens.
//
// 9 500 y no 9 000: con 282 tokens de margen, cualquier párrafo añadido a la
// GLOSARIO rompía el CI, y el techo habría acabado subiéndose de pasada en
// cada prompt —que es exactamente cómo muere un guardián—. Con ~780 de margen,
// un documento puede crecer lo razonable y lo que NO cabe es añadir un archivo
// obligatorio sin decidirlo. Subirlo es una decisión escrita, no el
// efecto secundario de otro cambio.
//
// 2026-09-19 — PROMPT G: entran DOS archivos obligatorios más, por decisión
// escrita en ese prompt (la filosofía no se leía al arrancar y no había capa de
// rumbo). No se subió el techo: se recortaron los dos archivos hasta caber. Por
// eso este array es la lista más cara del repo — cada línea la paga CADA sesión.
//
// 2026-09-19 (revisión del PROMPT G) — 9 500 → 10 500. DECISIÓN ESCRITA, que es
// la única forma en que este número puede moverse.
//
// Qué pasó: el techo se dimensionó para SEIS archivos y en el mismo día se
// pidieron OCHO. El margen real no eran los 641 que parecían, porque AGENTS.md y
// 00-INDICE.md crecen dentro de este mismo presupuesto cuando se les añade el
// enganche de los archivos nuevos. Con el techo fijo, la única salida era
// recortar el contenido, y se recortó hasta vaciarlo: 10 de los 16 invariantes
// quedaron en el TÍTULO de su sección («Un dato, una fuente»), que es el
// contraejemplo que el propio prompt daba de lo que no sirve, y los asuntos de
// commit a 20 caracteres («UIs pendientes: las…») dejaron de informar.
//
// Un techo que obliga a elegir entre romper el CI y vaciar el documento no está
// frenando el gasto: está comprando tokens con utilidad. Y a 14 tokens de margen
// volvía a ser el gatillo de pelo que subir de 9 000 a 9 500 había evitado.
//
// 10 500: el contenido sin mutilar mide ~9 740 (invariantes de verdad +115,
// asuntos completos +100, títulos de pendientes +35) y quedan ~760 de margen —
// el mismo ~8 % con que se justificó 9 500. Lo que este número sigue sin
// permitir es un NOVENO archivo obligatorio sin volver a escribir un párrafo
// como este.
const TECHO_TOKENS = 10500;

const arranque = ARRANQUE.map((f) => ({ archivo: f, bytes: pesa(f), tokens: tok(pesa(f)) })).sort(
  (a, b) => b.bytes - a.bytes,
);
const arranqueTokens = arranque.reduce((a, x) => a + x.tokens, 0);

for (const f of arranque) {
  if (f.bytes === 0) fallos.push(`La lectura de arranque declara \`${f.archivo}\`, que no existe.`);
}
if (arranqueTokens > TECHO_TOKENS) {
  fallos.push(
    `El arranque cuesta ${arranqueTokens.toLocaleString("es-MX")} tokens y el techo es ` +
      `${TECHO_TOKENS.toLocaleString("es-MX")}. Eso lo paga CADA sesión de Claude y de Cline ` +
      `antes de escribir una línea: recorta, o sube el techo por decisión escrita.`,
  );
}

// ── 2) Rutas vivas ─────────────────────────────────────────────────────────
// Se revisa el corpus que describe el PRESENTE. Cada archivo de aquí afirma
// algo sobre el repo tal y como está hoy.
const CORPUS = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "ESTADO-ACTUAL.md",
  "RUMBO.md",
  "filosofia.estructural",
  "criterios.prompts",
  "scripts/README.md",
  "docs/00-INDICE.md",
];
for (const dir of ["docs/normativo", "docs/sistema", "docs/sistema/modulos"]) {
  if (!existe(dir)) continue;
  for (const f of fs.readdirSync(abs(dir))) {
    if (f.endsWith(".md")) CORPUS.push(`${dir}/${f}`);
  }
}

/** Solo se comprueba lo que de verdad parece una ruta del repo: empieza por una
 *  de estas raíces. Un `asistencias.ts` suelto en mitad de una frase es prosa,
 *  no un enlace, y exigirle que resuelva llenaría esto de falsos positivos. */
const RAICES = ["app/", "lib/", "docs/", "scripts/", "supabase/", "public/", ".github/", "things/"];

/** Extensiones que se prueban cuando la cita va sin ella (`lib/auth/types`). */
const EXTENSIONES = ["", ".ts", ".tsx", ".mjs", ".md", ".sql", ".json", ".css"];

/**
 * Rutas que se citan A PROPÓSITO y que NO deben existir. Cada una con su
 * motivo, y se imprimen en cada ejecución: una lista de excepciones que no se
 * ve es el sitio perfecto para esconder documentación podrida.
 */
const AUSENTES_A_PROPOSITO = {
  "app/api/": "se cita para afirmar que NO existe: todo el transporte son Server Actions",
  "app/_borrador/": "cuarentena retirada en el PROMPT F; los textos que la citan narran su retirada",
  "app/_borrador/chat/": "ídem",
  "lib/_borrador/": "ídem",
  "lib/_borrador/README.md": "ídem",
  "app/components/ui/pill.tsx": "propuesta de MATRIZ-UX §7 (F-UX1), aún NO construida",
  "app/components/ui/tab.tsx": "ídem",
  "scripts/.tmp-tests/": "carpeta EFÍMERA: la crea y la borra al arrancar cada suite que se transpila sola (test-materia-identidad, test-materia-avance, test-columnas-calificaciones, test-mapeo-columnas-materia). Que no exista ENTRE corridas es el estado normal, y justo por eso scripts/README.md avisa de que dos tandas en paralelo se pisan",
  "lib/supabase/database.types.ts": "lo ESCRIBE scripts/gen-tipos-db.mjs, y hoy ese script no puede correr en esta máquina: `supabase gen types --db-url` exige Docker. Es un archivo pendiente, no un documento podrido (docs/sistema/pendientes.json · tipos-db-sin-generar)",
  "things/": "material humano (manuales, Figma, capturas): vive fuera del repo, en ../things",
};

/** Resuelve una cita a un archivo real, o devuelve null. */
function resuelve(ruta) {
  for (const ext of EXTENSIONES) if (existe(ruta + ext)) return ruta + ext;
  return null;
}

const muertas = [];
for (const doc of CORPUS) {
  if (!existe(doc)) continue;
  const texto = leer(doc);
  const vistas = new Set();
  for (const m of texto.matchAll(/`([^`\n]+)`/g)) {
    const cita = m[1].trim();
    if (!RAICES.some((r) => cita.startsWith(r))) continue;
    // Se descartan comodines, plantillas y fragmentos con espacios: no son citas.
    if (/[*\s(){}<>|]/.test(cita) || cita.includes("...")) continue;
    // `archivo.ts::funcion` y `archivo.sql:208` apuntan DENTRO del archivo.
    const ruta = cita
      .split("::")[0]
      .replace(/:\d+$/, "")
      .replace(/[.,;:]+$/, "");
    if (!ruta || vistas.has(ruta)) continue;
    vistas.add(ruta);
    if (resuelve(ruta)) continue;
    if (ruta in AUSENTES_A_PROPOSITO) continue;
    muertas.push({ doc, ruta });
  }
}

for (const { doc, ruta } of muertas) {
  fallos.push(`${doc} cita \`${ruta}\`, que no existe.`);
}

// ── Informe ────────────────────────────────────────────────────────────────
const datos = {
  arranqueTokens,
  techoTokens: TECHO_TOKENS,
  arranque,
  docsRevisados: CORPUS.length,
  rutasMuertas: muertas,
  excepciones: Object.entries(AUSENTES_A_PROPOSITO).map(([ruta, motivo]) => ({ ruta, motivo })),
};

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify({ medido: new Date().toISOString(), ...datos, fallos, avisos }, null, 2) + "\n",
  );
  process.exit(fallos.length === 0 ? 0 : 1);
}

console.log("Verificación del sistema de documentación");
console.log(
  `  arranque         : ${arranqueTokens.toLocaleString("es-MX")} tokens ` +
    `(techo ${TECHO_TOKENS.toLocaleString("es-MX")}) en ${ARRANQUE.length} archivos`,
);
for (const f of arranque) {
  console.log(
    `                     ${f.archivo.padEnd(36)} ${String(f.tokens).padStart(5)} tok · ` +
      `${String(Math.round((f.tokens / arranqueTokens) * 100)).padStart(2)}%`,
  );
}
console.log(`  documentos       : ${CORPUS.length} revisados (docs/historial/ no se escanea)`);
console.log(`  rutas muertas    : ${muertas.length}`);
console.log(
  `  excepciones      : ${Object.keys(AUSENTES_A_PROPOSITO).length} rutas citadas a propósito`,
);
for (const [ruta, motivo] of Object.entries(AUSENTES_A_PROPOSITO)) {
  console.log(`                     ${ruta.padEnd(36)} ${motivo}`);
}

for (const a of avisos) console.log(`  aviso: ${a}`);

if (fallos.length === 0) {
  console.log("\nOK: el sistema de documentación está sano.");
  process.exit(0);
}

console.error(`\nDESINCRONIZADO (${fallos.length}):`);
for (const f of fallos) console.error(`  · ${f}`);
console.error(
  "\nUna ruta muerta en un documento del presente no es un detalle: el agente que la\n" +
    "sigue gasta contexto para no encontrar nada, y después no sabe qué más es falso.",
);
process.exit(1);
