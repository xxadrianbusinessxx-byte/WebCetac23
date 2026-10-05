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
//   3. LO QUE UNA RUTA VIVA NO GARANTIZA (PROMPT V, D4) — anclas `ruta::símbolo`,
//      rutas de `docs/sistema/pendientes.json`, listas de arranque ⊆ `ARRANQUE`
//      y nombres sueltos (`x.ts` sin raíz) que existan en `git ls-files`.
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

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const abs = (rel) => path.join(root, rel);
const existe = (rel) => fs.existsSync(abs(rel));
const leer = (rel) => fs.readFileSync(abs(rel), "utf8");
/** Bytes SIN los `\r`: con `core.autocrlf=true` la copia local lleva CRLF y la del
 *  CI no, y el mismo archivo pesaba ~140 tokens más aquí que allí. Se mide lo
 *  que se versiona, que es lo que mide el CI. */
const pesa = (rel) => {
  if (!existe(rel)) return 0;
  const b = fs.readFileSync(abs(rel));
  let cr = 0;
  for (const x of b) if (x === 0x0d) cr++;
  return b.length - cr;
};
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
//
// 2026-10-04 — PROMPT V (A1): se mide sin `\r`, como el CI: 10 345 tokens; margen real, 155.
// 2026-10-04 — PROMPT V (C0), DECISIÓN 1: se mantiene `TECHO_TOKENS = 10500`, se poda REGLAS_NO_HACER (C1) y se mide sin CR (A1).
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
  "lib/supabase/database.types.ts": "lo ESCRIBE scripts/gen-tipos-db.mjs, y hoy ese script no puede correr en esta máquina: `supabase gen types --db-url` exige Docker. Es un archivo pendiente, no un documento podrido (docs/sistema/pendientes.json · tipos-db-sin-generar)",
  "things/": "material humano (manuales, Figma, capturas): vive fuera del repo, en ../things",
};

/** Resuelve una cita a un archivo real, o devuelve null. */
function resuelve(ruta) {
  for (const ext of EXTENSIONES) if (existe(ruta + ext)) return ruta + ext;
  return null;
}

/** Lo que va delante de `::`, sin `()`, sin `:línea` (o `:a-b`) y sin puntuación
 *  final: `archivo.ts::funcion` y `archivo.sql:208` apuntan DENTRO del archivo.
 *  Es el único normalizador de citas: lo usan el bloque 2 y el 3. */
const rutaDeCita = (cita) =>
  cita
    .split("::")[0]
    .replace(/\(\)$/, "")
    .replace(/:\d+(-\d+)?$/, "")
    .replace(/[.,;:]+$/, "");

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
    const ruta = rutaDeCita(cita);
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

// ── 3) Lo que una ruta viva no garantiza (PROMPT V, D4) ─────────────────────
// Que el archivo exista no basta para que el agente llegue a donde se le manda:
//   (a) ANCLAS — `ruta::símbolo` promete que el símbolo está EN esa ruta. Un
//       barril (`export * from`) lo re-exporta sin nombrarlo, y el agente abre
//       el archivo y no lo encuentra.
//   (b) PENDIENTES — `docs/sistema/pendientes.json` cita un `doc` y un comando
//       `verificar`; si el archivo se movió, RUMBO y el panel mandan a ninguna
//       parte.
//   (c) LISTAS DE ARRANQUE — AGENTS y 00-INDICE enumeran el arranque a mano; lo
//       que enumeren tiene que estar en `ARRANQUE`, que es lo que se mide.
//   (d) NOMBRES SUELTOS — un `asistencias.ts` sin raíz no lo comprueba el bloque
//       2, pero el agente lo busca igual: tiene que existir con ese nombre en
//       `git ls-files` (lo versionado y lo nuevo no ignorado que siga en disco).
// Las cuatro fallan, no avisan: un aviso que nadie lee es la forma en que este
// tipo de documentación se pudrió la primera vez.
const d4 = { anclas: [], pendientes: [], listas: [], sueltos: [] };
const anotarD4 = (tipo, texto) => {
  d4[tipo].push(texto);
  fallos.push(texto);
};

/** Lo versionado y lo nuevo aún sin `git add` (no ignorado), que siga en el árbol:
 *  el orden del contrato es `test:ci` → `git add`, y un módulo recién creado ya se
 *  puede citar. En el CI no hay archivos sin seguimiento, así que allí es lo mismo.
 *  `-z` para que git no entrecomille las rutas con tildes. */
let versionados = [];
try {
  versionados = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
    .filter((f) => existe(f));
} catch (e) {
  fallos.push(
    `No se pudo leer \`git ls-files\` (${String(e.message).split("\n")[0]}): sin él no se ` +
      "comprueban las anclas ni los nombres sueltos.",
  );
}
/** Archivos versionados cuya ruta termina en `cita` (un nombre suelto o una ruta parcial). */
const porSufijo = (cita) => versionados.filter((f) => f === cita || f.endsWith(`/${cita}`));

/**
 * Nombres sueltos que se citan A PROPÓSITO sin que existan. Mismo criterio que
 * `AUSENTES_A_PROPOSITO`: cada uno con su motivo, y se imprimen siempre.
 */
const NOMBRES_AUSENTES_A_PROPOSITO = {
  "ui/barra-navegacion.tsx": "retirado en `8d17188`; scripts/README.md y MATRIZ-UX lo citan para narrar su retirada",
  "ui/glossy-nav-pill.tsx": "ídem",
  "./x.ts": "ORDEN §1b: la FORMA de un import relativo con extensión, no un archivo",
  "../familia/x.ts": "ídem",
  "perfil/perfil-client.tsx": "MATRIZ-UX §7: crónica fechada de las fases del rediseño Océano; se retiró en `8d17188`",
  "tutor-client.tsx": "ídem",
};

// (a) Anclas y (d) nombres sueltos, sobre el mismo corpus del bloque 2.
for (const doc of CORPUS) {
  if (!existe(doc)) continue;
  const texto = leer(doc);
  const vistas = new Set();
  for (const m of texto.matchAll(/`([^`\n]+)`/g)) {
    const cita = m[1].trim();
    const ruta = rutaDeCita(cita);
    if (!ruta || /[*\s(){}<>|]/.test(ruta) || ruta.includes("...")) continue;
    const conRaiz = RAICES.some((r) => ruta.startsWith(r));

    const ancla = cita.match(/::([A-Za-z_$][\w$]*)/);
    if (ancla && !vistas.has(cita)) {
      vistas.add(cita);
      const simbolo = ancla[1];
      const archivos = conRaiz ? [resuelve(ruta)].filter(Boolean) : porSufijo(ruta);
      const patron = new RegExp(`\\b${simbolo.replace(/\$/g, "\\$")}\\b`);
      if (archivos.length === 0) {
        // Sin raíz la marca (d). Con raíz, el bloque 2 se salta las citas con
        // `()`, así que una ancla `ruta::f()` a un archivo borrado se marca aquí.
        if (
          conRaiz &&
          !(ruta in AUSENTES_A_PROPOSITO) &&
          !muertas.some((x) => x.doc === doc && x.ruta === ruta)
        ) {
          anotarD4("anclas", `${doc} ancla \`${ruta}::${simbolo}\`, y esa ruta no existe.`);
        }
      } else if (!archivos.some((f) => patron.test(leer(f)))) {
        anotarD4(
          "anclas",
          `${doc} ancla \`${ruta}::${simbolo}\`, y \`${simbolo}\` no aparece en ` +
            `${archivos.map((f) => `\`${f}\``).join(" ni en ")}.`,
        );
      }
    }

    if (conRaiz || !/[\w-]\.(ts|tsx|mjs|sql)$/.test(ruta) || vistas.has(ruta)) continue;
    vistas.add(ruta);
    // `test-auditoria-ciclo-f0..f8.mjs` es un RANGO: se exige cada uno.
    let nombres = [ruta];
    const rango = ruta.match(/^(.*?)(\d+)\.\.(\D*)(\d+)(\.\w+)$/);
    if (rango && rango[1].endsWith(rango[3])) {
      nombres = [];
      for (let i = Number(rango[2]); i <= Number(rango[4]); i++) nombres.push(`${rango[1]}${i}${rango[5]}`);
    }
    for (const n of nombres) {
      if (porSufijo(n).length > 0 || n in NOMBRES_AUSENTES_A_PROPOSITO) continue;
      anotarD4("sueltos", `${doc} cita \`${n}\` sin raíz, y ningún archivo del repo se llama así.`);
    }
  }
}

// (b) Rutas de pendientes.json.
const PENDIENTES = "docs/sistema/pendientes.json";
let pendientes = [];
try {
  pendientes = JSON.parse(leer(PENDIENTES)).pendientes ?? [];
} catch (e) {
  fallos.push(`No se pudo leer \`${PENDIENTES}\` (${String(e.message).split("\n")[0]}).`);
}
for (const p of pendientes) {
  if (p.doc != null && !existe(p.doc)) {
    anotarD4("pendientes", `${PENDIENTES} · \`${p.id}\`: su \`doc\` (\`${p.doc}\`) no existe.`);
  }
  if (typeof p.verificar !== "string") continue;
  for (const pieza of p.verificar.split(/\s+/)) {
    const t = pieza.replace(/^["'`]+|["'`,;]+$/g, "");
    if (RAICES.some((r) => t.startsWith(r)) && !resuelve(t)) {
      anotarD4("pendientes", `${PENDIENTES} · \`${p.id}\`: su \`verificar\` cita \`${t}\`, que no existe.`);
    }
  }
}

// (c) Listas de arranque ⊆ ARRANQUE.
const enArranque = new Set(ARRANQUE);
const listaAgents = (() => {
  const t = leer("AGENTS.md");
  const ini = t.search(/^## Lectura de arranque/m);
  if (ini < 0) return null;
  const resto = t.slice(ini + 1);
  const fin = resto.search(/^## /m);
  const seccion = fin < 0 ? resto : resto.slice(0, fin);
  return [...seccion.matchAll(/^\d+\.\s+`([^`]+)`/gm)].map((m) => m[1]);
})();
const listaIndice = (() => {
  const fila = leer("docs/00-INDICE.md")
    .split(/\r?\n/)
    .find((l) => l.startsWith("| **Cualquier cambio**"));
  if (!fila) return null;
  const celdas = fila.split("|");
  return [...(celdas[celdas.length - 2] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
})();
for (const [origen, lista] of [
  ["AGENTS.md «Lectura de arranque»", listaAgents],
  ["docs/00-INDICE.md «Cualquier cambio»", listaIndice],
]) {
  if (!lista || lista.length === 0) {
    anotarD4("listas", `No se encontró la lista de ${origen}: no se puede comprobar contra \`ARRANQUE\`.`);
    continue;
  }
  for (const f of lista) {
    if (!enArranque.has(f)) {
      anotarD4("listas", `${origen} incluye \`${f}\`, que no está en \`ARRANQUE\`: se lee y no se mide.`);
    }
  }
}

// ── Informe ────────────────────────────────────────────────────────────────
const datos = {
  arranqueTokens,
  techoTokens: TECHO_TOKENS,
  arranque,
  docsRevisados: CORPUS.length,
  rutasMuertas: muertas,
  excepciones: Object.entries(AUSENTES_A_PROPOSITO).map(([ruta, motivo]) => ({ ruta, motivo })),
  anclasRotas: d4.anclas,
  pendientesSinRuta: d4.pendientes,
  listasFueraDeArranque: d4.listas,
  nombresSueltosMuertos: d4.sueltos,
  excepcionesNombres: Object.entries(NOMBRES_AUSENTES_A_PROPOSITO).map(([nombre, motivo]) => ({
    nombre,
    motivo,
  })),
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
console.log(`  anclas rotas     : ${d4.anclas.length}`);
console.log(`  pendientes.json  : ${d4.pendientes.length} rutas que no existen`);
console.log(`  listas arranque  : ${d4.listas.length} fuera de ARRANQUE`);
console.log(`  nombres sueltos  : ${d4.sueltos.length} sin archivo en el repo`);
for (const [nombre, motivo] of Object.entries(NOMBRES_AUSENTES_A_PROPOSITO)) {
  console.log(`                     ${nombre.padEnd(36)} ${motivo}`);
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
