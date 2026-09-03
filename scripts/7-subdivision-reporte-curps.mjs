// 7-subdivision-reporte-curps.mjs — Genera el reporte CURP+nombre+grado/grupo/carrera.
// Lee Excels de "Alumnos CETAC", cruza contra ALUMNOS y contra el catálogo
// (periodos/grupos/carreras), y escribe un CSV de revisión. NO modifica nada.
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const root = path.join(import.meta.dirname, "..");
const carpeta = "C:\\Users\\URINDOWS\\Desktop\\web\\things\\Alumnos CETAC";
const salidaCsv = path.join(import.meta.dirname, "7-subdivision-reporte-curps.csv");
const salidaMd = path.join(import.meta.dirname, "7-subdivision-reporte-curps.md");

const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return { data: await r.json(), ok: r.ok, status: r.status };
}

// --- Normalización ---------------------------------------------------------
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function tokens(texto) {
  return normalizar(texto).split(" ").filter((t) => t.length > 1);
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// Token fuzzy: igual salvo U+FFFD (carácter corrupto) o ≤1 edición, y largo ≥3.
function tokenCasiIgual(a, b) {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if (a.length === b.length) {
    let dif = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i] === "\uFFFD" || b[i] === "\uFFFD") continue;
      dif++;
    }
    if (dif <= 1) return true;
  }
  if (a.includes("\uFFFD") || b.includes("\uFFFD")) return false;
  return levenshtein(a, b) <= 1;
}

function nombreCompleto(row) {
  return [row.NOMBRE, row.P_APELLIDO, row.S_APELLIDO].filter(Boolean).join(" ").trim();
}

// --- Emparejamiento por niveles --------------------------------------------
function emparejarNombre(excelNombre, alumnos) {
  const ta = tokens(excelNombre);

  // nivel 1: conjuntos de tokens idénticos (orden libre)
  const exactos = alumnos.filter((a) => {
    const tb = tokens(nombreCompleto(a));
    if (tb.length !== ta.length) return false;
    return [...ta].sort().join(" ") === [...tb].sort().join(" ");
  });
  if (exactos.length === 1)
    return { estado: "COINCIDE", curp: String(exactos[0].CURP), dbNombre: nombreCompleto(exactos[0]) };
  if (exactos.length > 1)
    return { estado: "AMBIGUO", candidatos: exactos.map((x) => `${x.CURP} (${nombreCompleto(x)})`) };

  // nivel 2: el nombre del Excel es subconjunto del de la BD (nombre medio extra)
  const subconjuntos = alumnos.filter((a) => {
    const tb = tokens(nombreCompleto(a));
    if (tb.length !== ta.length + 1) return false;
    return ta.every((t) => tb.includes(t));
  });
  if (subconjuntos.length === 1)
    return { estado: "PARCIAL", curp: String(subconjuntos[0].CURP), dbNombre: nombreCompleto(subconjuntos[0]) };
  if (subconjuntos.length > 1)
    return { estado: "AMBIGUO", candidatos: subconjuntos.map((x) => `${x.CURP} (${nombreCompleto(x)})`) };

  // nivel 3: mismo conjunto salvo un token con ≤1 edición
  const fuzzy = alumnos.filter((a) => {
    const tb = tokens(nombreCompleto(a));
    if (tb.length !== ta.length) return false;
    const faltantes = ta.filter((t) => !tb.includes(t));
    if (faltantes.length !== 1) return false;
    const sobran = tb.filter((t) => !ta.includes(t));
    if (sobran.length !== 1) return false;
    return tokenCasiIgual(faltantes[0], sobran[0]);
  });
  if (fuzzy.length === 1)
    return { estado: "FUZZY", curp: String(fuzzy[0].CURP), dbNombre: nombreCompleto(fuzzy[0]) };
  if (fuzzy.length > 1)
    return { estado: "AMBIGUO_FUZZY", candidatos: fuzzy.map((x) => `${x.CURP} (${nombreCompleto(x)})`) };

  return { estado: "SIN_MATCH" };
}

// --- Mapeo archivo → (grado, grupo, carrera) --------------------------------
// Regla manual: los nombres de los archivos indican grado+grupo+carrera.
function grupoDesdeArchivo(nombreArchivo) {
  const base = nombreArchivo.replace(/\.(xlsx|xls)$/i, "").toUpperCase();
  // CORRECCIÓN del directivo: el archivo "6TOMCA.xlsx" en realidad corresponde
  // a 5TO A MECATRONICA (todos sus alumnos van a 5TO, no a 6TO).
  if (base === "6TOMCA") {
    return { grado: "5TO", grupo: "A", carrera: "MECATRONICA" };
  }
  const carrera = base.includes("MCA")
    ? "MECATRONICA"
    : base.includes("RHA") || base.includes("RHB")
      ? "RH"
      : "";
  // grado
  let grado = "";
  if (base.startsWith("1RO")) grado = "1RO";
  else if (base.startsWith("2DO")) grado = "2DO";
  else if (base.startsWith("3RO")) grado = "3RO";
  else if (base.startsWith("4TO")) grado = "4TO";
  else if (base.startsWith("5TO")) grado = "5TO";
  else if (base.startsWith("6TO")) grado = "6TO";
  // grupo: letra final (A/B/C/D), o A si termina en MCA/MC (MCA→A, MCB→B)
  let grupo = "A";
  if (/[ABCD]$/.test(base)) grupo = base.slice(-1);
  else if (base.endsWith("MCB")) grupo = "B";
  else if (base.endsWith("RHB")) grupo = "B";
  return { grado, grupo, carrera };
}

// --- Cargar catálogo --------------------------------------------------------
async function cargarCatalogo() {
  const [periodos, carreras, grupos] = await Promise.all([
    get("periodos", "id,nombre,activo"),
    get("carreras", "id,clave,nombre,activo"),
    get("grupos", "id,periodo_id,grado,nombre,carrera_id,activo", "&limit=500"),
  ]);
  const periodo = (periodos.data ?? []).find((p) => p.activo) ?? (periodos.data ?? [])[0];
  const carreraPorId = new Map((carreras.data ?? []).map((c) => [c.id, c.clave]));
  const gruposLista = (grupos.data ?? []).filter((g) => g.periodo_id === periodo?.id);
  return { periodo, carreraPorId, gruposLista };
}

function grupoIdCatalogo(catalogo, grado, grupo, carrera) {
  const match = catalogo.gruposLista.find(
    (g) =>
      String(g.grado ?? "").toUpperCase() === grado &&
      String(g.nombre ?? "").toUpperCase() === grupo &&
      (catalogo.carreraPorId.get(g.carrera_id) ?? "") === (carrera || ""),
  );
  return match ? { id: match.id, carreraId: match.carrera_id } : null;
}

// --- Leer Excels ------------------------------------------------------------
function leerExcels() {
  const archivos = fs
    .readdirSync(carpeta)
    .filter((f) => /\.(xlsx|xls)$/i.test(f))
    .sort();
  const lista = [];
  for (const f of archivos) {
    const wb = XLSX.read(fs.readFileSync(path.join(carpeta, f)), { type: "buffer" });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
    for (const row of rows.slice(1)) {
      if (!Array.isArray(row)) continue;
      const nombre = String(row[0] ?? "").trim();
      const grupoCol = String(row[1] ?? "").trim();
      if (!nombre || normalizar(nombre) === "NOMBRE") continue;
      lista.push({ archivo: f, nombre, grupoCol });
    }
  }
  return lista;
}

// --- CSV escaping -----------------------------------------------------------
function csvCell(v) {
  const s = String(v ?? "");
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// --- Main -------------------------------------------------------------------
const alumnos = [];
{
  let desde = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await fetch(
      `${urlBase}/rest/v1/ALUMNOS?select=CURP,NOMBRE,P_APELLIDO,S_APELLIDO,CLAVE&order=CURP&offset=${desde}&limit=${PAGE}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) break;
    alumnos.push(...data);
    if (data.length < PAGE) break;
    desde += PAGE;
  }
}
const catalogo = await cargarCatalogo();
console.log(`ALUMNOS=${alumnos.length} · Periodo activo=${catalogo.periodo?.nombre}`);

const lista = leerExcels();
const filas = [];

for (const item of lista) {
  const ggc = grupoDesdeArchivo(item.archivo);
  const grupo = grupoIdCatalogo(catalogo, ggc.grado, ggc.grupo, ggc.carrera);
  const m = emparejarNombre(item.nombre, alumnos);
  filas.push({
    archivo: item.archivo,
    excelNombre: item.nombre,
    grupoCol: item.grupoCol,
    grado: ggc.grado,
    grupo: ggc.grupo,
    carrera: ggc.carrera || "",
    grupoId: grupo?.id ?? "",
    grupoExiste: Boolean(grupo),
    estado: m.estado,
    curp: m.curp ?? "",
    dbNombre: m.dbNombre ?? "",
    candidatos: m.candidatos?.join(" | ") ?? "",
  });
}

// --- Reporte CSV ------------------------------------------------------------
const encabezados = [
  "archivo", "grado", "grupo", "carrera", "grupo_id", "grupo_existe",
  "excel_nombre", "grupo_columna", "estado", "curp", "nombre_supabase", "candidatos",
];
const csvTexto =
  encabezados.map(csvCell).join(",") +
  "\n" +
  filas
    .map((f) =>
      [
        f.archivo, f.grado, f.grupo, f.carrera, f.grupoId, f.grupoExiste ? "SI" : "NO",
        f.excelNombre, f.grupoCol, f.estado, f.curp, f.dbNombre, f.candidatos,
      ]
        .map(csvCell)
        .join(","),
    )
    .join("\n");
fs.writeFileSync(salidaCsv, "\uFEFF" + csvTexto, "utf8");

// --- Reporte Markdown (vista legible) ----------------------------------------
const md = [];
md.push("# Reporte CURP + grado/grupo/carrera (subdivisión 7)");
md.push("");
md.push(`Periodo: **${catalogo.periodo?.nombre}** · ALUMNOS: ${alumnos.length} · Nombres en Excels: ${filas.length}`);
md.push("");
const porEstado = {};
for (const f of filas) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
md.push("| Estado | Cantidad |");
md.push("|---|---|");
for (const e of Object.keys(porEstado).sort()) md.push(`| ${e} | ${porEstado[e]} |`);
md.push("");
md.push("## Detalle");
md.push("");
md.push("| Archivo | Grado | Grupo | Carrera | Excel (nombre) | Estado | CURP | Nombre en Supabase |");
md.push("|---|---|---|---|---|---|---|---|");
for (const f of filas) {
  const estado = f.estado === "SIN_MATCH" ? `**${f.estado}**` : f.estado === "FUZZY" ? `_${f.estado}_` : f.estado;
  md.push(
    `| ${f.archivo} | ${f.grado} | ${f.grupo} | ${f.carrera || "—"} | ${f.excelNombre.replace(/[|]/g, "\\|")} | ${estado} | ${f.curp || "—"} | ${f.dbNombre.replace(/[|]/g, "\\|") || "—"} |`,
  );
}
md.push("");
fs.writeFileSync(salidaMd, md.join("\n"), "utf8");

// --- Resumen en consola -------------------------------------------------------
console.log("\nResumen por estado:", JSON.stringify(porEstado));
console.log("\nGrupos destino (catálogo):");
const gruposVistos = new Set();
for (const f of filas) {
  const key = `${f.grado} ${f.grupo} ${f.carrera}`;
  if (!gruposVistos.has(key)) {
    gruposVistos.add(key);
    console.log(`  ${key} → grupo_id=${f.grupoId || "NO ENCONTRADO"} (existe=${f.grupoExiste})`);
  }
}

console.log("\nNombres sin CURP (SIN_MATCH):");
for (const f of filas.filter((x) => x.estado === "SIN_MATCH")) {
  console.log(`  [${f.archivo}] "${f.excelNombre}" [${f.grupoCol}]`);
}

console.log("\nCoincidencias FUZZY (revisar):");
for (const f of filas.filter((x) => x.estado === "FUZZY")) {
  console.log(`  [${f.archivo}] "${f.excelNombre}" → ${f.curp} "${f.dbNombre}"`);
}

console.log("\nCoincidencias PARCIAL (revisar):");
for (const f of filas.filter((x) => x.estado === "PARCIAL")) {
  console.log(`  [${f.archivo}] "${f.excelNombre}" → ${f.curp} "${f.dbNombre}"`);
}

console.log("\nReportes generados:");
console.log("  ", salidaCsv);
console.log("  ", salidaMd);

// --- Vista de prueba: 3 nombres por archivo (para validación del usuario) -----
console.log("\n=== VISTA DE PRUEBA (3 por archivo) ===");
const porArchivo = {};
for (const f of filas) (porArchivo[f.archivo] ??= []).push(f);
for (const archivo of Object.keys(porArchivo).sort()) {
  const rs = porArchivo[archivo];
  console.log(`\n[${archivo}] → ${rs[0].grado} ${rs[0].grupo}${rs[0].carrera ? " " + rs[0].carrera : ""}`);
  for (const f of rs.slice(0, 3)) {
    console.log(`  ${f.excelNombre}  →  ${f.curp || "SIN CURP"}  [${f.estado}]`);
  }
}

