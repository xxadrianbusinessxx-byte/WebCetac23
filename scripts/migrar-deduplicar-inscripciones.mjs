// migrar-deduplicar-inscripciones.mjs — PROMPT-1/T3 (ESCRIBE con --apply).
// Ningún CURP puede tener más de una inscripción ACTIVA en el ciclo operativo.
// Para cada CURP con varias inscripciones activas, cruza contra el ROSTER
// (carpeta de Excel, parámetro obligatorio) y propone cuál inscripción queda
// activa y cuáles se desactivan (`activo=false`, reversible; nunca DELETE).
//
// Reglas:
//   1. La carpeta de Excel es parámetro obligatorio (`--roster`). No se
//      incrusta ninguna ruta absoluta.
//   2. El roster asocia nombres a su grupo oficial. Se resuelve nombre → CURP
//      contra `ALUMNOS` por coincidencia exacta y única (misma semántica que
//      `scripts/actualizar-inscripciones-listas.mjs`).
//   3. Cada archivo de lista se mapea a un grupo del operativo. Para
//      `6TOMCA.xlsx` vale la decisión del directivo ya documentada: la lista
//      corresponde a **5TO A MECATRONICA**.
//   4. Todo CURP que no case con el roster (sin match, ambiguo, o cuya lista no
//      exista) se reporta como PENDIENTE HUMANO. No se inventa el desempate.
//
// Por defecto SOLO imprime el plan (dry-run). Escribe con `--apply`.
//
// Uso:
//   node scripts/migrar-deduplicar-inscripciones.mjs --roster "C:\\carpeta"
//   node scripts/migrar-deduplicar-inscripciones.mjs --roster "C:\\carpeta" --apply
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
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
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}
async function patch(tabla, id, body) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?id=eq.${id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return true;
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

// Mapeo lista → grupo del operativo. 6TOMCA = 5TO A MECATRONICA (decisión del
// directivo, INFORME-INSCRIPCIONES-COMPLETAR-CICLO).
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
  const nombres = new Set();
  const curps = new Set();
  const header = (rows[0] ?? []).map((c) => normNombre(c));
  // Formato 1RO: ["#","APELLIDO P.","APELLIDO M.","NOMBRE",...,"CURP"] — el
  // nombre completo está repartido y hay CURP en la última columna.
  const idxColNombre = header.indexOf("NOMBRE");
  const idxColCurp = header.indexOf("CURP");
  const esFormatoColumnas = header[0] === "#" && idxColNombre > 0;
  for (const fila of rows.slice(1)) {
    const celdas = Array.isArray(fila) ? fila : [fila];
    if (!celdas.length) continue;
    // CURP directa de la hoja (la más fiable cuando existe).
    if (idxColCurp > 0) {
      const c = normCurp(celdas[idxColCurp]);
      if (/^[A-Z0-9]{18}$/.test(c)) curps.add(c);
    }
    let n = "";
    if (esFormatoColumnas) {
      n = normNombre([celdas[1], celdas[2], celdas[idxColNombre]].filter((v) => String(v ?? "").trim() !== "").join(" "));
    } else {
      n = normNombre(celdas[0]);
    }
    if (n && n !== "NOMBRE" && n !== "#") nombres.add(n);
  }
  return { nombres, curps };
}

async function main() {
  if (!ROSTER) throw new Error('Falta --roster="C:\\carpeta" (parámetro obligatorio).');
  if (!fs.existsSync(ROSTER)) throw new Error(`La carpeta de roster no existe: ${ROSTER}`);

  const [periodos, grupos, carreras, alumnos, ins] = await Promise.all([
    get("periodos", "id,nombre,activo,estado", "&limit=50"),
    get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", "&limit=5000"),
    get("carreras", "id,clave,nombre", "&limit=200").catch(() => []),
    get("ALUMNOS", "CURP,NOMBRE,P_APELLIDO,S_APELLIDO", "&limit=20000"),
    get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at", "&limit=20000"),
  ]);

  const op = periodos.find((p) => String(p.estado ?? "").toUpperCase() === "OPERATIVO") || periodos.find((p) => p.activo);
  if (!op) throw new Error("No hay periodo operativo.");
  const carreraClave = new Map(carreras.map((c) => [c.id, String(c.clave ?? "").trim().toUpperCase()]));
  const grupoDelCat = new Map(
    grupos.filter((g) => g.periodo_id === op.id).map((g) => {
      const k = `${String(g.grado ?? "").trim().toUpperCase()}|${String(g.nombre ?? "").trim().toUpperCase()}|${carreraClave.get(g.carrera_id) ?? ""}`;
      return [k, g];
    }),
  );
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));

  // Lectura del roster: cada lista se asocia a su grupo destino del operativo.
  const archivos = fs.readdirSync(ROSTER).filter((f) => /\.xlsx?$/i.test(f));
  const grupoIdPorLista = new Map();
  const usadas = [];
  for (const [file, grado, nombre, carrera] of MAPA_LISTA_A_GRUPO) {
    if (!archivos.includes(file)) continue;
    const k = `${grado}|${nombre}|${carrera}`;
    const g = grupoDelCat.get(k);
    if (g) {
      grupoIdPorLista.set(file, g.id);
      usadas.push(file);
    }
  }
  if (usadas.length === 0) throw new Error(`Ninguna lista del roster mapea a un grupo del operativo en ${ROSTER}`);
  console.log(`Periodo operativo: [${String(op.id).slice(0, 8)}] ${op.nombre}`);
  console.log(`Roster: ${ROSTER} (${usadas.length} listas mapeadas a grupos del operativo)`);
  console.log(`Modo: ${APPLY ? "--apply (ESCRIBE)" : "DRY-RUN (no escribe nada)"}`);

  // CURPs con más de una inscripción ACTIVA en el operativo.
  const activas = ins.filter((i) => i.activo && grupoPorId.get(i.grupo_id)?.periodo_id === op.id);
  const porCurp = new Map();
  for (const i of activas) {
    const c = normCurp(i.curp);
    if (!c) continue;
    if (!porCurp.has(c)) porCurp.set(c, []);
    porCurp.get(c).push(i);
  }
  const dups = [...porCurp.entries()].filter(([, l]) => l.length > 1);
  console.log(`CURPs con >1 inscripción activa en el operativo: ${dups.length}\n`);



  // Resolver cada lista del roster a CURPs por coincidencia exacta de nombre.
  const curpPorNombre = new Map();
  for (const a of alumnos) {
    const n = normNombre([a.P_APELLIDO, a.S_APELLIDO, a.NOMBRE].filter(Boolean).join(" "));
    if (!n) continue;
    if (!curpPorNombre.has(n)) curpPorNombre.set(n, []);
    curpPorNombre.get(n).push(normCurp(a.CURP));
  }
  const curpsPorLista = new Map();
  const sinCurpPorLista = new Map();
  const ambiguosPorLista = new Map();
  for (const file of usadas) {
    const ruta = path.join(ROSTER, file);
    const { nombres, curps } = leerLista(ruta);
    const setCurps = new Set(curps); // CURP directa de la hoja (si existe)
    const sinCurp = [];
    const ambiguos = [];
    for (const n of nombres) {
      const m = curpPorNombre.get(n) ?? [];
      if (m.length === 0) {
        // Solo es un problema si la lista no trae CURP propia (depende del nombre).
        if (curps.size === 0) sinCurp.push(n);
      } else if (m.length > 1) ambiguos.push(`${n} (${m.length} en ALUMNOS)`);
      else setCurps.add(m[0]);
    }
    curpsPorLista.set(file, setCurps);
    sinCurpPorLista.set(file, sinCurp);
    ambiguosPorLista.set(file, ambiguos);
  }
  const listasDeCurp = new Map();
  for (const file of usadas) {
    for (const c of curpsPorLista.get(file)) {
      if (!listasDeCurp.has(c)) listasDeCurp.set(c, []);
      listasDeCurp.get(c).push(file);
    }
  }

  const aDesactivar = [];
  const pendientes = [];
  const descGrupo = (i) => {
    const g = grupoPorId.get(i.grupo_id);
    if (!g) return "(grupo sin catálogo)";
    const carrera = carreraClave.get(g.carrera_id);
    return `${g.grado} ${g.nombre}${carrera ? " " + carrera : ""}`;
  };
  for (const [curp, lista] of dups) {
    const listas = listasDeCurp.get(curp) ?? [];
    if (listas.length === 0) {
      pendientes.push({ curp, motivo: "NO aparece en ninguna lista del roster", inscripciones: lista });
      continue;
    }
    if (listas.length > 1) {
      pendientes.push({ curp, motivo: `Aparece en varias listas: ${listas.join(", ")}`, inscripciones: lista });
      continue;
    }
    const file = listas[0];
    const grupoOficialId = grupoIdPorLista.get(file);
    const filaOficial = lista.find((i) => i.grupo_id === grupoOficialId);
    if (!filaOficial) {
      pendientes.push({ curp, motivo: `En lista ${file} pero sin inscripción ACTIVA en ese grupo del operativo`, inscripciones: lista });
      continue;
    }
    for (const i of lista) {
      if (i.id !== filaOficial.id) {
        aDesactivar.push({ curp, id: i.id, grupo: descGrupo(i), grupoOficial: descGrupo(filaOficial), lista: file });
      }
    }
  }


  console.log(`=== PROPUESTA ===`);
  console.log(`A DESACTIVAR: ${aDesactivar.length}`);
  for (const d of aDesactivar) {
    console.log(`  ${d.curp}  desactivar ${d.grupo}  (quedará activa en ${d.grupoOficial} · lista ${d.lista})`);
  }
  console.log(`\nPENDIENTE HUMANO: ${pendientes.length}`);
  for (const p of pendientes) {
    console.log(`  ${p.curp}  [${p.motivo}]`);
    for (const i of p.inscripciones) {
      console.log(`      activa en ${descGrupo(i)}`);
    }
  }
  for (const file of usadas) {
    const sc = sinCurpPorLista.get(file) ?? [];
    const amb = ambiguosPorLista.get(file) ?? [];
    if (sc.length || amb.length) {
      console.log(`\nAVISO lista ${file}: ${sc.length} nombres sin CURP en ALUMNOS · ${amb.length} ambiguos`);
    }
  }

  if (!APPLY) {
    console.log("\nDRY-RUN terminado. Revisa antes de --apply.");
    return;
  }
  let n = 0;
  for (const d of aDesactivar) {
    await patch("inscripciones_alumno", d.id, { activo: false });
    n++;
  }
  console.log(`\nEJECUTADO: ${n} inscripciones desactivadas (${pendientes.length} pendientes humanos intactas).`);
}

main().catch((e) => {
  console.error("ERROR:", e.message ?? e);
  process.exit(1);
});
