#!/usr/bin/env node
// diag-inscripciones-vs-roster.mjs — PROMPT-5/A2 (solo lectura).
//
// Verdad de quién está en qué grupo = `things/Alumnos CETAC`. Compara las
// inscripciones ACTIVAS del ciclo operativo contra esas listas Excel y reporta
// cuatro listas (no un número):
//   1. EN LA BASE Y NO EN EL EXCEL   → inscripción de más.
//   2. EN EL EXCEL Y NO EN LA BASE   → alumno sin inscribir.
//   3. EN AMBOS PERO EN GRUPO DISTINTO → el caso peligroso (no se ve).
//   4. CURPs DEL EXCEL QUE NO EXISTEN EN ALUMNOS.
//
// SOLO diagnostica. No corrige nada. La corrección se decide leyendo el
// reporte (A2 es punto de parada obligatorio del PROMPT-5).
//
// La carpeta de Excel es parámetro obligatorio (`--roster`), nunca ruta
// absoluta incrustada.
//
// Uso:
//   node scripts/diag-inscripciones-vs-roster.mjs --roster "C:\\carpeta"
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const args = process.argv.slice(2);
const rosterArg = args.find((a) => a.startsWith("--roster="));
const ROSTER = rosterArg ? rosterArg.slice("--roster=".length) : null;

const ROOT = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const H = { apikey: key, Authorization: `Bearer ${key}` };

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

function normNombre(s) {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-ZÑ0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normCurp(s) {
  return String(s ?? "").trim().toUpperCase();
}

// Mapeo lista → grupo del operativo (misma tabla que
// migrar-deduplicar-inscripciones.mjs). 6TOMCA = 5TO A MECATRONICA (decisión
// del directivo ya documentada).
const MAPA_LISTA_A_GRUPO = [
  ["1ROA.xlsx", "1RO", "A", ""],
  ["1ROB.xlsx", "1RO", "B", ""],
  ["1ROC.xlsx", "1RO", "C", ""],
  ["1ROD.xlsx", "1RO", "D", ""],
  ["3ROMCA.xlsx", "3RO", "A", "MECATRONICA"],
  ["3RORHA.xlsx", "3RO", "A", "RH"],
  ["3RORHB.xlsx", "3RO", "B", "RH"],
  ["5TORHA.xlsx", "5TO", "A", "RH"],
  ["5TORHB.xlsx", "5TO", "B", "RH"],
  ["6TOMCA.xlsx", "5TO", "A", "MECATRONICA"],
];

function leerLista(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const curps = [];
  const nombres = [];
  const header = (rows[0] ?? []).map((c) => normNombre(c));
  const idxColNombre = header.indexOf("NOMBRE");
  const idxColCurp = header.indexOf("CURP");
  const esFormatoColumnas = header[0] === "#" && idxColNombre > 0;
  for (const fila of rows.slice(1)) {
    const celdas = Array.isArray(fila) ? fila : [fila];
    if (!celdas.length) continue;
    if (idxColCurp > 0) {
      const c = normCurp(celdas[idxColCurp]);
      if (/^[A-Z0-9]{18}$/.test(c)) curps.push({ curp: c, fila: celdas });
    }
    let n = "";
    if (esFormatoColumnas) {
      n = normNombre([celdas[1], celdas[2], celdas[idxColNombre]].filter((v) => String(v ?? "").trim() !== "").join(" "));
    } else {
      n = normNombre(celdas[0]);
    }
    if (n && n !== "NOMBRE" && n !== "#") nombres.push({ nombre: n, fila: celdas });
  }
  return { curps, nombres };
}

async function main() {
  if (!ROSTER) throw new Error('Falta --roster="C:\\carpeta" (parámetro obligatorio).');
  if (!fs.existsSync(ROSTER)) throw new Error(`La carpeta de roster no existe: ${ROSTER}`);

  const [periodos, grupos, carreras, alumnos, ins] = await Promise.all([
    get("periodos", "id,nombre,activo,estado", "&limit=50"),
    get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", "&limit=5000"),
    get("carreras", "id,clave,nombre", "&limit=200").catch(() => []),
    get("ALUMNOS", "CURP,NOMBRE,P_APELLIDO,S_APELLIDO", "&limit=20000"),
    get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at,decision_manual,motivo", "&limit=20000").catch(() =>
      get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at", "&limit=20000"),
    ),
  ]);

  const op = periodos.find((p) => String(p.estado ?? "").toUpperCase() === "OPERATIVO") || periodos.find((p) => p.activo);
  if (!op) throw new Error("No hay periodo operativo.");
  console.log(`Periodo operativo: [${String(op.id).slice(0, 8)}] ${op.nombre}\n`);

  const carreraClave = new Map(carreras.map((c) => [c.id, String(c.clave ?? "").trim().toUpperCase()]));
  const grupoPorClave = new Map(
    grupos.filter((g) => g.periodo_id === op.id).map((g) => {
      const k = `${String(g.grado ?? "").trim().toUpperCase()}|${String(g.nombre ?? "").trim().toUpperCase()}|${carreraClave.get(g.carrera_id) ?? ""}`;
      return [k, g];
    }),
  );
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const grupoDelOperativo = new Set(grupos.filter((g) => g.periodo_id === op.id).map((g) => g.id));

  // Alumno: nombre normalizado → CURP (match exacto y único), CURP → alumno.
  const porNombre = new Map();
  for (const a of alumnos) {
    const n = normNombre(`${a.P_APELLIDO} ${a.S_APELLIDO} ${a.NOMBRE}`);
    const lista = porNombre.get(n) ?? [];
    lista.push(a);
    porNombre.set(n, lista);
  }
  const alumnoPorCurp = new Map(alumnos.map((a) => [normCurp(a.CURP), a]));

  // Inscripción activa por CURP en el operativo (0/1+; si hay >1 se reporta).
  const inscActivas = ins.filter((i) => i.activo && grupoDelOperativo.has(String(i.grupo_id)));
  const inscPorCurp = new Map();
  for (const i of inscActivas) {
    const c = normCurp(i.curp);
    const lista = inscPorCurp.get(c) ?? [];
    lista.push(i);
    inscPorCurp.set(c, lista);
  }

  const enBaseNoExcel = [];
  const enExcelNoBase = [];
  const grupoDistinto = [];
  const sinAlumnos = [];

  const archivos = fs.readdirSync(ROSTER).filter((f) => /\.xlsx?$/i.test(f));
  for (const [file, grado, grupo, carrera] of MAPA_LISTA_A_GRUPO) {
    if (!archivos.includes(file)) continue;
    const k = `${grado}|${grupo}|${carrera}`;
    const gDest = grupoPorClave.get(k);
    if (!gDest) {
      console.log(`AVISO: ninguna lista mapea a ${file} (${k}) en el operativo`);
      continue;
    }
    const { curps, nombres } = leerLista(path.join(ROSTER, file));
    console.log(`== ${file} → grupo ${gDest.grado} ${gDest.nombre} ${carrera || ""}`.trim());
    const curpsExcel = new Set(curps.map((x) => x.curp));

    // CURPs directos de la hoja.
    for (const x of curps) {
      if (!alumnoPorCurp.has(x.curp)) sinAlumnos.push({ lista: file, curp: x.curp });
    }
    // Nombres de la hoja → CURP (match único).
    const curpsDeNombres = new Set();
    let noResuelto = 0;
    for (const n of nombres) {
      const matches = porNombre.get(n.nombre) ?? [];
      if (matches.length === 1) curpsDeNombres.add(normCurp(matches[0].CURP));
      else if (matches.length === 0) noResuelto++;
      // >1 → ambiguo: se ignora (no se inventa).
    }
    if (noResuelto) console.log(`  (${noResuelto} nombres de ${file} sin match único en ALUMNOS — no comparables)`);
    const curpsEsperados = new Set([...curpsExcel, ...curpsDeNombres]);

    // Lista 1: activa en este grupo pero no en el Excel.
    const inscritosEnGrupo = inscActivas.filter((i) => String(i.grupo_id) === String(gDest.id));
    for (const i of inscritosEnGrupo) {
      if (!curpsEsperados.has(normCurp(i.curp))) {
        enBaseNoExcel.push({ lista: file, curp: i.curp, grupo: `${gDest.grado} ${gDest.nombre}`, decision_manual: i.decision_manual === true });
      }
    }
    // Lista 2 + 3: en el Excel pero no activo aquí / activo en OTRO grupo.
    for (const c of curpsEsperados) {
      const activas = inscPorCurp.get(c) ?? [];
      const aqui = activas.filter((i) => String(i.grupo_id) === String(gDest.id));
      const enOtro = activas.filter((i) => String(i.grupo_id) !== String(gDest.id));
      if (activas.length === 0) {
        enExcelNoBase.push({ lista: file, curp: c, esperado: `${gDest.grado} ${gDest.nombre}` });
      } else if (aqui.length === 0 && enOtro.length > 0) {
        for (const i of enOtro) {
          const g = grupoPorId.get(String(i.grupo_id));
          grupoDistinto.push({
            lista: file,
            curp: c,
            esperado: `${gDest.grado} ${gDest.nombre}`,
            actual: g ? `${g.grado} ${g.nombre}` : String(i.grupo_id),
            decision_manual: i.decision_manual === true,
          });
        }
      }
    }
    console.log(`  Excel: ${curpsEsperados.size} CURPs comparables · en base: ${inscritosEnGrupo.length}`);
  }

  console.log(`\n======== REPORTE A2 ========`);
  console.log(`\n[1] EN LA BASE Y NO EN EL EXCEL (inscripción de más): ${enBaseNoExcel.length}`);
  for (const x of enBaseNoExcel) console.log(`  ${x.curp} · ${x.grupo} · lista ${x.lista}${x.decision_manual ? " · MARCADA decision_manual" : ""}`);
  console.log(`\n[2] EN EL EXCEL Y NO EN LA BASE (alumno sin inscribir): ${enExcelNoBase.length}`);
  for (const x of enExcelNoBase) console.log(`  ${x.curp} · esperado ${x.esperado} · lista ${x.lista}`);
  console.log(`\n[3] EN AMBOS PERO EN GRUPO DISTINTO (el peligroso): ${grupoDistinto.length}`);
  for (const x of grupoDistinto) console.log(`  ${x.curp} · esperado ${x.esperado} · está en ${x.actual} · lista ${x.lista}${x.decision_manual ? " · MARCADA decision_manual" : ""}`);
  console.log(`\n[4] CURPs DEL EXCEL QUE NO EXISTEN EN ALUMNOS: ${sinAlumnos.length}`);
  for (const x of sinAlumnos) console.log(`  ${x.curp} · lista ${x.lista}`);

  console.log("\nFIN (solo lectura — A2 no corrige nada)");
}

await main();
