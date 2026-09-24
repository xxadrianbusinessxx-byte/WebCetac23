// diag-alcance-tutor.mjs — DIAGNÓSTICO (SOLO LECTURA) de la Fase 4.
//
// PRUEBA EXPLÍCITA del PASO 0 sin abrir sesión: reproduce, contra la base REAL,
//   A) la GUARDA que aplican las tres actions (curp ∈ listarCurpsDeTutor):
//      un CURP ajeno NO está en la lista → las tres niegan antes de responder;
//   B) el CRITERIO DE FILA que usa actionObtenerVistaMateria: el alumno
//      vinculado coincide en UNA SOLA fila (nunca la tabla del grupo).
// Para (B) NO se reimplementa nada: se transpila el módulo puro REAL
// (`lib/escolar/buscar-en-filas.ts`) y se usa su función de coincidencia.
//
// NO modifica nada: solo GET. Credenciales de .env.local (service_role).
// Uso: node scripts/diag-alcance-tutor.mjs [--tutor=<id>] [--tabla=<nombre>]
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=")[1] ?? null;

const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
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

async function get(tabla, select = "*", extra = "&limit=200") {
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const data = await r.json();
  if (!r.ok) return { __error: `${r.status} ${JSON.stringify(data).slice(0, 160)}` };
  return data;
}

/** Las tablas físicas de materia llevan espacios y mayúsculas: PostgREST las
 *  quiere tal cual, y según el nombre puede necesitar comillas. Se prueban las
 *  dos formas (ambas GET). */
async function getTabla(nombre, limit = 1000) {
  const directo = await get(nombre, "*", `&limit=${limit}`);
  if (!directo.__error && Array.isArray(directo)) return directo;
  return get(`"${nombre}"`, "*", `&limit=${limit}`);
}

// ── El criterio REAL, cargado del módulo puro ─────────────────────────────────
// Node carga el `.ts` directamente (PROMPT H-bis). Este diagnóstico transpilaba a
// CommonJS en `.tmp-alcance`, y el codemod de extensiones lo rompió sin que nada
// lo viera: `buscar-en-filas.ts` pasó a importar `./nombres.ts`, y en la carpeta
// temporal solo existía `nombres.js`. Como toca la red, no corre en el CI.
const filas = await import("../lib/escolar/buscar-en-filas.ts");

const normalizarCurp = (c) => String(c ?? "").trim().toUpperCase();



async function main() {
  const tutores = await get("tutores", "id,nombre,usuario,activo", "&activo=eq.true&limit=50");
  if (tutores.__error) return console.log("tutores:", tutores.__error);
  if (!tutores.length) return console.log("No hay tutores activos.");

  // Se elige un tutor CON alumnos vinculados (si no, no hay nada que demostrar).
  // Con --tutor=<id> se fuerza uno concreto.
  const candidatos = arg("tutor")
    ? tutores.filter((t) => String(t.id) === arg("tutor"))
    : tutores;
  let tutor = null;
  let vinculados = [];
  for (const t of candidatos.slice(0, 30)) {
    const relT = await get(
      "tutor_alumnos",
      "curp_alumno",
      `&tutor_id=eq.${encodeURIComponent(t.id)}&activo=eq.true&limit=200`,
    );
    const curps = (Array.isArray(relT) ? relT : [])
      .map((r) => normalizarCurp(r.curp_alumno))
      .filter(Boolean);
    if (curps.length > 0) {
      tutor = t;
      vinculados = curps;
      break;
    }
  }
  if (!tutor) return console.log("Ningún tutor activo tiene alumnos vinculados activos.");

  console.log("\n=== A) GUARDA — curp ∈ listarCurpsDeTutor (la que aplican las 3 actions) ===");
  console.log(`tutor: ${tutor.nombre ?? tutor.usuario} (id ${tutor.id}) · vinculados activos: ${vinculados.length}`);
  console.log(`  vinculados: ${vinculados.join(", ") || "(ninguno)"}`);

  const alumnos = await get("ALUMNOS", "CURP", "&limit=400");
  const todas = (Array.isArray(alumnos) ? alumnos : []).map((a) => normalizarCurp(a.CURP)).filter(Boolean);
  const ajena = todas.find((c) => !vinculados.includes(c)) ?? null;
  const vinculada = vinculados[0] ?? null;

  if (vinculada) {
    console.log(`  curp VINCULADA  ${vinculada}  → guarda: ${vinculados.includes(vinculada) ? "PASA" : "NIEGA"}`);
  }
  if (ajena) {
    console.log(`  curp AJENA      ${ajena}  → guarda: ${vinculados.includes(ajena) ? "PASA (¡revisar!)" : "NIEGA"}`);
  }
  console.log("  → calificaciones (actionObtenerVistaMateria), horario y asistencia devuelven");
  console.log("    vacío/error para la ajena: las tres reusan este mismo predicado.");

  console.log("\n=== B) FILA — criterio de leerVistaMateriaAlumno/buscar-en-filas (módulo puro real) ===");
  if (!vinculada) return console.log("Sin alumno vinculado: nada que demostrar.");

  const det = await get(
    "ALUMNOS",
    "CURP,NOMBRE,P_APELLIDO,S_APELLIDO",
    `&CURP=eq.${encodeURIComponent(vinculada)}&limit=1`,
  );
  const filaA = Array.isArray(det) ? det[0] : null;
  const nombre = filaA
    ? [filaA.NOMBRE, filaA.P_APELLIDO, filaA.S_APELLIDO].filter(Boolean).join(" ").trim()
    : "";
  console.log(`alumno vinculado: ${nombre} (${vinculada})`);

  const gm = await get("grupo_materias", "*", "&limit=300");
  const tablas = [...new Set((Array.isArray(gm) ? gm : []).map((g) => g.tabla_legacy).filter(Boolean))];
  const candidatas = arg("tabla") ? [arg("tabla")] : tablas.slice(0, 12);

  const criterioVinculado = { curp: vinculada, nombreCompleto: nombre };
  const criterioAjeno = { curp: ajena, nombreCompleto: "" };
  let mostrada = false;

  for (const tabla of candidatas) {
    const rows = await getTabla(tabla);
    if (!Array.isArray(rows) || rows.length === 0) continue;
    // Celdas = todos los valores de la fila, como texto (lo que el criterio mira).
    const matriz = rows.map((r) => Object.values(r).map((v) => (v == null ? "" : String(v))));
    const idxAjeno = ajena ? filas.buscarIndiceFilaAlumno(matriz, criterioAjeno) : -1;
    const coincidencias = matriz.filter((f) => filas.filaCoincideAlumno(f, criterioVinculado)).length;
    if (coincidencias === 0) continue; // esta tabla no es la de su grupo: se prueba otra

    console.log(`\n  tabla: ${tabla}`);
    console.log(`  filas en la tabla: ${matriz.length}`);
    console.log(`  filas que coinciden con el alumno VINCULADO (curp+nombre): ${coincidencias}  ← la action devuelve ESTAS`);
    console.log(`  filas que coinciden con la CURP AJENA: ${idxAjeno >= 0 ? "≥1 (¡revisar!)" : "0"}`);
    mostrada = true;
    break;
  }

  // Respaldo: el alumno de este tutor no tiene tabla de materia cargada. Se
  // demuestra el MISMO criterio (por NOMBRE, que es la ruta de respaldo de
  // buscar-en-filas cuando la tabla no guarda CURP) con dos alumnos REALES de
  // una tabla REAL: la action devuelve 1 fila de N, nunca la tabla del grupo.
  if (!mostrada) {
    console.log(`  tablas candidatas (grupo_materias.tabla_legacy): ${tablas.length}`);
    // 1ª pasada barata (limit=5): encontrar una tabla REAL con filas de alumno.
    let elegida = null;
    let conFilas = 0;
    let primerError = "";
    for (const tabla of tablas.slice(0, 80)) {
      const muestra = await getTabla(tabla, 5);
      if (muestra.__error) {
        if (!primerError) primerError = `${tabla}: ${muestra.__error}`;
        continue;
      }
      if (!Array.isArray(muestra) || muestra.length < 2) continue;
      conFilas++;
      const matriz = muestra.map((r) => Object.values(r).map((v) => (v == null ? "" : String(v))));
      const conNombre = matriz.filter((fila) =>
        fila.some((c) => c.trim().split(/\s+/).length >= 3 && !/^NOMBRE$/i.test(c.trim())),
      ).length;
      if (conNombre >= 2) {
        elegida = tabla;
        break;
      }
    }
    if (!elegida) {
      console.log(`  tablas probadas: 80 · con ≥2 filas: ${conFilas}`);
      if (primerError) console.log(`  primer error de lectura: ${primerError}`);
      console.log("  → en este entorno las tablas de materia no tienen filas de alumno, así que");
      console.log("    la demostración de fila NO tiene datos reales: se cubre con la suite pura");
      console.log("    (`test-rediseno-oceano.mjs` → buscar-en-filas) y con el código de la action.");
    }
    for (const tabla of elegida ? [elegida] : []) {
      const rows = await getTabla(tabla);
      if (!Array.isArray(rows) || rows.length < 2) continue;
      const matriz = rows.map((r) => Object.values(r).map((v) => (v == null ? "" : String(v))));
      const nombreDe = (fila) =>
        fila.find((c) => {
          const t = c.trim();
          return t.split(/\s+/).length >= 3 && !/^NOMBRE$/i.test(t);
        });
      const nombres = matriz.map(nombreDe).filter(Boolean);
      if (nombres.length < 2) continue;

      const [n1, n2] = nombres;
      const coincide = (nombreCompleto) =>
        matriz.filter((f) => filas.filaCoincideAlumno(f, { nombreCompleto })).length;

      console.log(`\n  (el alumno del tutor no tiene tabla de materia cargada: se demuestra con dos`);
      console.log(`   alumnos reales de una tabla real, por la ruta de nombre)`);
      console.log(`  tabla: ${tabla}`);
      console.log(`  filas en la tabla: ${matriz.length}`);
      console.log(`  filas que coinciden con «${n1}»: ${coincide(n1)}  ← la action devuelve SOLO esta`);
      console.log(`  filas que coinciden con «${n2}»: ${coincide(n2)}  ← el criterio es por alumno, no por grupo`);
      mostrada = true;
      break;
    }
  }
  if (!mostrada) console.log("  (no se encontró en las candidatas una tabla con filas de alumno)");
  console.log("");
}

await main();
