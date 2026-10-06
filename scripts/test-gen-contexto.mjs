#!/usr/bin/env node
/**
 * test-gen-contexto.mjs — no prueba un módulo: prueba el ÍNDICE y el GENERADOR.
 *
 * QUÉ PRUEBA: que `scripts/gen-contexto.mjs`, leyendo `docs/00-INDICE.md` y el
 *   resto de sus fuentes, da a cada tarea representativa lo mínimo que necesita:
 *   cita lo que debe citar, NO arrastra documentos enteros de más y falla en voz
 *   alta cuando le piden algo que no es suyo. Si el índice o el generador
 *   retroceden, esto se pone rojo.
 * QUÉ ESCRIBE: nada. Ejecuta el generador por stdout —nunca con `--salida`— y
 *   no toca la red ni la base.
 * CÓMO SE EJECUTA: node scripts/test-gen-contexto.mjs
 *
 * ── Cómo se comprueba ──────────────────────────────────────────────────────
 * Aserciones de INCLUSIÓN y de EXCLUSIÓN sobre la ESTRUCTURA del paquete: las
 * filas «- **X** → …» del presupuesto y las rutas entre backticks citadas en
 * ellas, más las marcas fijas del generador (revisión de Claude, aviso de
 * historial, tamaño C9). Nunca un snapshot: un snapshot se regenera para que
 * pase y deja de vigilar.
 *
 * Los casos viven AQUÍ y no en `docs/00-INDICE.md`, que está en el arranque y
 * paga tokens en cada sesión.
 *
 * ── Rojos conocidos ────────────────────────────────────────────────────────
 * `ROJAS_CONOCIDAS` es una lista NOMINAL de comprobaciones que hoy fallan y se
 * aceptan con nombre. La suite falla si aparece un rojo que no está en la
 * lista, y avisa si uno de la lista pasa a verde para que se borre: la lista
 * solo puede menguar, como un trinquete de `test-orden.mjs`.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.join(import.meta.dirname, "..");
const GEN = path.join(root, "scripts", "gen-contexto.mjs");

/** Rojos aceptados con nombre (formato «caso:comprobación»). Solo puede menguar. */
const ROJAS_CONOCIDAS = [];

// Límite de tamaño del paquete de Cline: lo que justifica tener un generador
// en vez de «lee el índice». Por encima, el paquete vuelve a pegar documentos.
const MAX_BYTES_PAQUETE = 8 * 1024;

// ── Ejecutar el generador ──────────────────────────────────────────────────
function gen(...args) {
  // La suite solo lee: `--salida` escribiría en `docs/historial/prompts/`.
  if (args.some((a) => a.startsWith("--salida"))) throw new Error("test-gen-contexto no usa --salida");
  const r = spawnSync(process.execPath, [GEN, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = (r.stdout ?? "").replace(/\r\n/g, "\n");
  return { code: r.status, out, err: r.stderr ?? "", agente: args.includes("--agente=claude") ? "claude" : "cline" };
}

/** Las filas «- **Tarea** → citas» del presupuesto, con lo que citan entre backticks. */
function filas(out) {
  const res = [];
  for (const linea of out.split("\n")) {
    const m = linea.match(/^- \*\*(.+?)\*\* → (.*)$/);
    if (m) res.push({ tarea: m[1], citas: [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]) });
  }
  return res;
}
const citas = (out) => filas(out).flatMap((f) => f.citas);

/** Rutas marcadas «requiere revisión de Claude» (la primera ruta entre backticks de cada línea). */
const marcasRevision = (out) =>
  out.split("\n")
    .filter((l) => l.includes("requiere revisión de Claude"))
    .map((l) => (l.match(/`([^`]+)`/) ?? [])[1])
    .filter(Boolean);

const avisoHistorial = (out) => out.split("\n").some((l) => l.includes("Aviso de historial"));

/** El cuerpo de una sección «## TÍTULO…», hasta la siguiente «## ». */
function seccion(out, titulo) {
  const partes = out.split(/\n(?=## )/);
  const p = partes.find((s) => s.replace(/^\n+/, "").startsWith(`## ${titulo}`));
  return p ?? null;
}

// ── Registro de resultados ─────────────────────────────────────────────────
const resultados = []; // { id, ok, detalle }
function comprobar(id, ok, detalle = "") {
  resultados.push({ id, ok: Boolean(ok), detalle });
}

// Lo que se comprueba en TODO paquete de Cline que sale con 0.
function siempre(caso, r) {
  if (r.agente !== "cline" || r.code !== 0) return;
  comprobar(`${caso}:lleva CONTRATO (obligatorio):`, r.out.includes("CONTRATO (obligatorio):"));
  const bytes = Buffer.byteLength(r.out, "utf8");
  comprobar(`${caso}:paquete ≤ 8 KB`, bytes <= MAX_BYTES_PAQUETE, `${bytes} B`);
  // (a) El aviso de historial va si, y solo si, alguna fila cita docs/historial/.
  const citaHistorial = citas(r.out).some((c) => c.startsWith("docs/historial/"));
  comprobar(`${caso}:aviso de historial ⇔ fila que cita docs/historial/`, citaHistorial === avisoHistorial(r.out),
    `cita historial: ${citaHistorial}, aviso: ${avisoHistorial(r.out)}`);
  // (e) Los términos van por su nombre, sin pegar las filas del GLOSARIO.
  const term = seccion(r.out, "TÉRMINOS");
  if (term) {
    comprobar(`${caso}:TÉRMINOS sin filas del GLOSARIO`, !/^\|/m.test(term), "la sección TÉRMINOS pega una tabla");
    comprobar(`${caso}:TÉRMINOS remite a la definición del GLOSARIO`, term.includes("definición en `docs/normativo/GLOSARIO.md`"));
  }
}

// ── Casos (Prompt V, Parte E2) ─────────────────────────────────────────────
// debe: rutas o ids que alguna fila tiene que citar. noDebe: que ninguna cite.
// revision: rutas que tienen que llevar la marca «requiere revisión de Claude»
// (`"supabase/"` = alguna ruta de esa carpeta). historial: aviso de historial.
// claude: «es tarea de Claude», exit ≠ 0.
const MAPA = "docs/sistema/MAPA-DEL-SISTEMA.md";
const UX = "docs/sistema/MATRIZ-UX.md";
const ORDEN = "docs/normativo/ORDEN.md";
const CICLO = "docs/sistema/modulos/CICLO_EVALUACIONES_MODULO.md";
const CASOS = [
  { id: "T1", tarea: "bug", rutas: ["app/components/calendario-asistencia-alumno.tsx", "app/actions/asistencias.ts", "lib/escolar/asistencia/asistencias.ts", "lib/escolar/ciclo/calendario.ts"], debe: [MAPA], noDebe: [UX] },
  { id: "T2", tarea: "crear", rutas: ["lib/escolar/alumno/informacion-personal.ts", "supabase/crear-rpc-obtener-perfil-alumno.sql"], debe: [ORDEN], revision: ["supabase/"] },
  { id: "T3", tarea: "ciclo", rutas: ["lib/escolar/ciclo/calendario.ts", "supabase/agregar-fk-calendario-periodo.sql"], debe: [CICLO], revision: ["supabase/agregar-fk-calendario-periodo.sql"] },
  { id: "T4", tarea: "rendimiento", rutas: ["lib/escolar/materia/materia-vista-alumno.ts", "app/actions/calificaciones.ts"], debe: ["remedir-rendimiento"], noDebe: [UX], historial: true },
  { id: "T5", tarea: "permisos", rutas: ["lib/auth/permisos.ts"], debe: ["docs/sistema/MATRIZ-PERMISOS.md"], revision: ["lib/auth/permisos.ts"] },
  { id: "T6", tarea: null, rutas: ["scripts/diag-calendario-periodo.mjs"], debe: ["scripts/README.md"], noDebe: [CICLO] },
  { id: "T7", tarea: "rendimiento", rutas: ["lib/escolar/materia/materia-vista-alumno.ts"], historial: true },
  { id: "T8", tarea: "crear,arquitectura", rutas: ["lib/escolar/"], debe: [ORDEN, "filosofia.estructural"] },
  { id: "T9", tarea: "arquitectura", rutas: ["lib/auth/permisos.ts", "scripts/test-orden.mjs"], debe: ["scripts/diag-peso-cambio.mjs"], revision: ["lib/auth/permisos.ts", "scripts/test-orden.mjs"] },
  { id: "T10", tarea: "auditar", rutas: ["app/actions/calificaciones.ts"], claude: true },
  { id: "T11", tarea: "peticion", rutas: ["app/actions/asistencias.ts"], debe: ["docs/sistema/FLUJO-TECNICO.md"] },
  { id: "T12", tarea: "horario", rutas: ["lib/escolar/horario/horario-importar.ts"], debe: ["docs/sistema/modulos/HORARIO_SEMANAL_MODULO.md"] },
  { id: "T13", tarea: "prompt", rutas: ["lib/auth/types.ts"], claude: true },
  { id: "T14", tarea: "apariencia", rutas: ["app/globals.css"], debe: [UX] },
];

const salidas = {};
for (const c of CASOS) {
  const r = gen(...(c.tarea ? [`--tarea=${c.tarea}`] : []), ...c.rutas);
  salidas[c.id] = r;
  if (c.claude) {
    comprobar(`${c.id}:exit ≠ 0 (es tarea de Claude)`, r.code !== 0, `exit ${r.code}`);
    comprobar(`${c.id}:dice «es tarea de Claude»`, r.err.includes("es tarea de Claude"), r.err.split("\n")[0]);
    continue;
  }
  comprobar(`${c.id}:exit 0`, r.code === 0, `exit ${r.code}: ${r.err.split("\n")[0]}`);
  if (r.code !== 0) continue;
  const cit = citas(r.out);
  for (const d of c.debe ?? []) comprobar(`${c.id}:cita ${d}`, cit.includes(d), `citas: ${cit.join(", ")}`);
  for (const d of c.noDebe ?? []) comprobar(`${c.id}:no cita ${d}`, !cit.includes(d), "la cita alguna fila");
  if (c.revision) {
    const marcas = marcasRevision(r.out);
    for (const m of c.revision) {
      const ok = m.endsWith("/") ? marcas.some((x) => x.startsWith(m)) : marcas.includes(m);
      comprobar(`${c.id}:marca de revisión en ${m}`, ok, `marcas: ${marcas.join(", ") || "ninguna"}`);
    }
  }
  if (c.historial) comprobar(`${c.id}:aviso de historial`, avisoHistorial(r.out));
  siempre(c.id, r);
}

// ── Esta suite no es la red de seguridad de las rutas de sus casos ─────────
// Las nombra como ENTRADA del generador. Si el generador la contara como suite
// de cada una, «correr antes y después» mandaría a correr esto por tocar una action.
{
  const SUITE = "node scripts/test-gen-contexto.mjs";
  const red = seccion(salidas.T1.out, "RED DE SEGURIDAD") ?? "";
  comprobar("R1:no es red de seguridad de las rutas de sus casos", !red.includes(SUITE));
  const g = gen("scripts/gen-contexto.mjs");
  comprobar("R1:es la red de seguridad del generador", (seccion(g.out, "RED DE SEGURIDAD") ?? "").includes(SUITE));
  siempre("R1", g);
}

// ── Casos negativos ────────────────────────────────────────────────────────
{
  const r = gen("--tarea=inexistente", "lib/auth/types.ts");
  comprobar("N1:--tarea=inexistente sale con ≠ 0", r.code !== 0, `exit ${r.code}`);
}
{
  // «ui» es una palabra de la fila de apariencia («…de la UI»), pero por
  // subcadena casaba también con «arquitectura» y «cualquier».
  const r = gen("--tarea=ui", "lib/escolar/ciclo/calendario.ts");
  const conArq = filas(r.out).filter((f) => /arquitectura/i.test(f.tarea)).map((f) => f.tarea);
  comprobar("N2:--tarea=ui no trae la fila de arquitectura", r.code !== 0 || conArq.length === 0, conArq.join(" | "));
  siempre("N2", r);
}
{
  const a = gen("app\\actions\\asistencias.ts");
  const b = gen("app/actions/asistencias.ts");
  comprobar("N3:ruta con \\ ≡ ruta con /", a.code === 0 && b.code === 0 && a.out === b.out, `exit ${a.code}/${b.code}`);
  comprobar("N3:ruta con \\ conserva la sugerencia de permisos", citas(a.out).includes("docs/sistema/MATRIZ-PERMISOS.md"));
}
{
  const a = gen("--tarea=sintoma", "lib/escolar/ciclo/calendario.ts");
  const b = gen("--tarea=síntoma", "lib/escolar/ciclo/calendario.ts");
  comprobar("N4:sintoma ≡ síntoma", a.code === 0 && b.code === 0 && a.out === b.out, `exit ${a.code}/${b.code}`);
  comprobar("N4:sintoma cita el MAPA", citas(a.out).includes(MAPA));
  comprobar("N4:sin --diag no hay sección DIAGNÓSTICO", seccion(a.out, "DIAGNÓSTICO") === null);
}

// ── E1 (b): --diag=<script> cita el script y su fila del README ────────────
{
  const script = "diag-calendario-periodo.mjs";
  const readme = fs.readFileSync(path.join(root, "scripts/README.md"), "utf8").replace(/\r\n/g, "\n");
  const fila = readme.split("\n").find((l) => l.startsWith("|") && l.split("|")[1]?.includes(`\`${script}\``));
  const r = gen(`--diag=${script}`, "lib/escolar/ciclo/calendario.ts");
  comprobar("D1:--diag sale con 0", r.code === 0, `exit ${r.code}: ${r.err.split("\n")[0]}`);
  const sec = seccion(r.out, "DIAGNÓSTICO") ?? "";
  comprobar("D1:--diag cita el script", sec.includes(`node scripts/${script}`));
  comprobar("D1:--diag cita su fila del README", Boolean(fila) && sec.includes(fila), fila ? "" : "sin fila en el README");
  siempre("D1", r);
  const x = gen("--diag=diag-no-existe.mjs", "lib/escolar/ciclo/calendario.ts");
  comprobar("D2:--diag de un script que no existe sale con ≠ 0", x.code !== 0, `exit ${x.code}`);
}

// ── E1 (b): a Cline no se le manda correr lo que escribe, carga o filtra ───
// El paquete diría «córrelo» con la salvedad detrás; por eso sale con 1. Cada
// caso ejercita un camino: prefijo de ORDEN §4, etiqueta de la fila, y la marca
// en una fila de varios scripts (vale para el que nombra, no para el vecino).
// Claude sí puede recibirlos: decide él, con autorización.
{
  const RUTA = "scripts/diag-calendario-periodo.mjs";
  const vetados = [
    ["fase10-carga.mjs", "prefijo fase10-"],
    ["p0-restaurar-ciclo-operativo.mjs", "fila ESCRIBE"],
    ["p0-verificar-restauracion.mjs", "fila de varios, nombrado"],
  ];
  for (const [script, por] of vetados) {
    const r = gen(`--diag=${script}`, RUTA);
    comprobar(`D3:--diag=${script} (${por}) a Cline sale con ≠ 0`, r.code !== 0, `exit ${r.code}`);
  }
  for (const script of ["p0-verificar-profesor.mjs", "p0-diag-contexto.mjs"]) {
    const r = gen(`--diag=${script}`, RUTA);
    comprobar(`D3:--diag=${script} (LEE) a Cline sale con 0`, r.code === 0, `exit ${r.code}: ${r.err.split("\n")[0]}`);
  }
  const c = gen("--agente=claude", "--diag=fase10-carga.mjs", RUTA);
  comprobar("D3:--diag=fase10-carga.mjs a Claude sale con 0", c.code === 0, `exit ${c.code}: ${c.err.split("\n")[0]}`);
}

// ── E1 (d): aviso de tamaño contra el límite de C9 ─────────────────────────
// El límite se lee de `test-orden --json` (C9.limite), como lo lee el generador.
{
  const t = spawnSync(process.execPath, [path.join(root, "scripts/test-orden.mjs"), "--json"], {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  let limite = null;
  try {
    limite = JSON.parse(t.stdout.replace(/^﻿/, "")).reglas.find((x) => x.id === "C9")?.limite ?? null;
  } catch { /* se reporta abajo */ }
  comprobar("S1:test-orden --json publica C9.limite", Number.isInteger(limite), `limite: ${limite}`);
  if (Number.isInteger(limite)) {
    const rutas = ["app/actions/escolar.ts", "lib/auth/types.ts"];
    const r = gen(...rutas);
    comprobar("S1:exit 0", r.code === 0, `exit ${r.code}`);
    const avisadas = r.out.split("\n").filter((l) => l.includes("Tamaño (C9)")).map((l) => (l.match(/`([^`]+)`/) ?? [])[1]);
    for (const ruta of rutas) {
      const n = fs.readFileSync(path.join(root, ruta), "utf8").split("\n").length;
      const cerca = limite - n < limite * 0.05;
      comprobar(`S1:aviso de tamaño en ${ruta} ⇔ a menos del 5 % del límite`, avisadas.includes(ruta) === cerca,
        `${n} líneas, límite ${limite}, avisado: ${avisadas.includes(ruta)}`);
    }
    siempre("S1", r);
  }
}

// ── Rama claude: solo smoke ────────────────────────────────────────────────
// Depende de `.panel/`, que no existe en el CI: aquí solo se comprueba que sale
// con 0, y que «auditar» le vale a Claude aunque a Cline se le niegue.
{
  const r = gen("--agente=claude", "--tarea=auditar", "app/actions/calificaciones.ts");
  comprobar("C1:rama claude sale con 0 (auditar)", r.code === 0, `exit ${r.code}: ${r.err.split("\n")[0]}`);
}

// ── Informe ────────────────────────────────────────────────────────────────
let rojasNuevas = 0;
let rojasConocidas = 0;
for (const x of resultados) {
  const conocida = ROJAS_CONOCIDAS.includes(x.id);
  if (x.ok) {
    console.log(`ok  ${x.id}`);
  } else if (conocida) {
    rojasConocidas++;
    console.log(`ROJA CONOCIDA  ${x.id}${x.detalle ? ` -> ${x.detalle}` : ""}`);
  } else {
    rojasNuevas++;
    console.log(`FALLA  ${x.id}${x.detalle ? ` -> ${x.detalle}` : ""}`);
  }
}
const ids = new Set(resultados.map((x) => x.id));
for (const id of ROJAS_CONOCIDAS) {
  const x = resultados.find((y) => y.id === id);
  if (!ids.has(id)) console.log(`AVISO  ${id} está en ROJAS_CONOCIDAS pero ya no existe esa comprobación: bórrala.`);
  else if (x.ok) console.log(`AVISO  ${id} ya pasa: bórrala de ROJAS_CONOCIDAS (la lista solo mengua).`);
}

const verdes = resultados.filter((x) => x.ok).length;
console.log(`\n${verdes}/${resultados.length} comprobaciones en verde · ${rojasConocidas} rojas conocidas · ${rojasNuevas} rojas nuevas`);
if (rojasNuevas > 0) process.exit(1);
