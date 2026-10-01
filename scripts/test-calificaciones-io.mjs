#!/usr/bin/env node
/**
 * test-calificaciones-io.mjs — suite de `materia/calificaciones.ts`.
 *
 * QUÉ MIDE: el CONTRATO que el módulo de I/O establece con PostgREST — a qué
 *           tabla va cada operación, con qué clave hace upsert, dónde pone el
 *           filtro por alumno y cómo trocea los lotes.
 * QUÉ ESCRIBE: nada. Importa el fuente `.ts` directo; no abre ninguna conexión.
 * CÓMO SE EJECUTA: node scripts/test-calificaciones-io.mjs
 *
 * ── Por qué se puede probar sin base de datos ───────────────────────────────
 * El módulo recibe el cliente por parámetro —lo dice su cabecera y es la
 * convención de todo `lib/escolar/`—, así que se le puede pasar un doble que
 * anota lo que se le pide y devuelve lo que la prueba decida. Eso permite
 * comprobar lo que de verdad falla en silencio:
 *
 *   · un `onConflict` equivocado: el upsert DUPLICA en vez de actualizar, y el
 *     profesor ve dos notas donde subió una;
 *   · un filtro por CURP aplicado en memoria y no en la consulta: las notas de
 *     todo el grupo viajan al servidor y basta un fallo de recorte para que se
 *     pinten;
 *   · un `delete` donde debía haber un `update activo=false`: se va el
 *     historial por el `on delete cascade` de `calificaciones`.
 *
 * Ninguna de las tres se nota ejecutando la app una vez a mano, y las tres
 * dejan datos mal. De ahí que se afirmen aquí, contra el doble, en vez de
 * esperar a verlas en producción —que además es la única base que hay—.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Se importa el FUENTE `.ts` directo: Node 24 quita los tipos por su cuenta y
// `calificaciones.ts` solo trae de valor `../tables.ts` —el cliente de Supabase
// entra como `import type` y desaparece al cargar—.
//
// No se transpila a una carpeta temporal a propósito. `eslint.config.mjs`
// retiró el ignore de `scripts/.tmp-*/**` el 2026-09-23 y dejó dicho que si
// vuelve a hacer falta es porque alguien reintrodujo un paso de compilación.
// Transpilar aquí habría sido eso, y el lint lo habría cazado.
const M = await import("../lib/escolar/materia/calificaciones.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) {
    pasadas++;
    console.log(`  ok  ${nombre}`);
  } else {
    fallos++;
    console.error(`  FALLA ${nombre} ${detalle}`);
  }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

/* ── El doble de Supabase ───────────────────────────────────────────────────
 * Imita la parte de PostgREST que el módulo usa: una cadena encadenable que es
 * además «thenable», porque el módulo a veces la espera directamente
 * (`await q.order(...)`) y a veces la cierra con `.maybeSingle()`.
 *
 * No valida SQL ni imita el motor: solo ANOTA. Lo que se afirma después es la
 * forma de la petición, que es lo que el módulo decide y lo que puede estar
 * mal.
 */
function dobleSupabase(respuestas = {}) {
  const llamadas = [];

  function consulta(tabla, op, payload, opts) {
    const reg = { tabla, op, select: null, filtros: [], orden: [], payload, opts };
    llamadas.push(reg);

    const resultado = () => {
      const r = respuestas[`${tabla}:${op}`] ?? respuestas[tabla] ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    };

    const api = {
      select(s) {
        reg.select = s;
        return api;
      },
      eq(k, v) {
        reg.filtros.push(["eq", k, v]);
        return api;
      },
      in(k, v) {
        reg.filtros.push(["in", k, v]);
        return api;
      },
      order(k) {
        reg.orden.push(k);
        return api;
      },
      limit(n) {
        reg.limite = n;
        return api;
      },
      maybeSingle: async () => resultado(),
      single: async () => resultado(),
      then: (res, rej) => Promise.resolve(resultado()).then(res, rej),
    };
    return api;
  }

  return {
    llamadas,
    from(tabla) {
      return {
        select: (s) => consulta(tabla, "select").select(s),
        upsert: (rows, opts) => consulta(tabla, "upsert", rows, opts),
        insert: (rows) => consulta(tabla, "insert", rows),
        update: (rows) => consulta(tabla, "update", rows),
        delete: () => consulta(tabla, "delete"),
      };
    },
  };
}

const fila = (p = {}) => ({
  curp: "AAAA000101HDFXXX01",
  tipo: "actividad",
  claveColumna: "Act 1",
  valor: 90,
  ...p,
});

console.log("\n── guardarCalificaciones: la clave que evita duplicar ──\n");
{
  const db = dobleSupabase();
  const r = await M.guardarCalificaciones(db, "GM-1", [fila()], 7);
  ok("devuelve ok", r.ok === true, JSON.stringify(r));
  eq(r.dato.escritas, 1, "cuenta una escrita");
  eq(db.llamadas.length, 1, "un solo viaje para una fila");
  eq(db.llamadas[0].tabla, "calificaciones", "escribe en `calificaciones`");
  eq(db.llamadas[0].op, "upsert", "es un upsert, no un insert");
  // Si esta clave cambia, re-subir el Excel deja DOS notas por celda y el
  // profesor no tiene forma de saber cuál se usa.
  eq(
    db.llamadas[0].opts.onConflict,
    "grupo_materia_id,curp,tipo,clave_columna",
    "el onConflict es la identidad exacta del índice único del .sql",
  );
  const p = db.llamadas[0].payload[0];
  eq(p.grupo_materia_id, "GM-1", "lleva el grupo_materia_id del parámetro");
  eq(p.registrado_por, 7, "guarda quién la registró");
  eq(p.clave_columna, "Act 1", "conserva el encabezado real del Excel");
  ok("no escribe `materia_id` legacy", !("materia_id" in p), JSON.stringify(p));
  ok("no inventa `id`: lo pone la base", !("id" in p), JSON.stringify(p));
}

{
  const db = dobleSupabase();
  const r = await M.guardarCalificaciones(db, "GM-1", [], 7);
  ok("sin filas no viaja a la base", r.ok === true && db.llamadas.length === 0);
  eq(r.dato.escritas, 0, "y reporta cero escritas");
}

{
  // El troceado: 5 filas con lote 2 son 3 viajes, y el último es parcial.
  const db = dobleSupabase();
  const filas = Array.from({ length: 5 }, (_, i) => fila({ claveColumna: `Act ${i}` }));
  const r = await M.guardarCalificaciones(db, "GM-1", filas, null, 2);
  eq(db.llamadas.length, 3, "trocea 5 filas en lotes de 2 → 3 viajes");
  eq(
    db.llamadas.map((l) => l.payload.length),
    [2, 2, 1],
    "el último lote es parcial, no se rellena",
  );
  eq(r.dato.escritas, 5, "la cuenta total no se pasa ni se queda corta");
}

{
  // Un fallo a medio camino tiene que decir CUÁNTAS entraron: si solo dijera
  // «falló», el profesor no sabría si hay medio archivo escrito.
  const db = dobleSupabase({ calificaciones: { error: { message: "boom" } } });
  const filas = Array.from({ length: 3 }, (_, i) => fila({ claveColumna: `A${i}` }));
  const r = await M.guardarCalificaciones(db, "GM-1", filas, null, 2);
  ok("un error devuelve ok:false", r.ok === false);
  ok("el mensaje incluye el del motor", r.error.includes("boom"), r.error);
  ok("…y cuántas se escribieron antes", /0 de 3/.test(r.error), r.error);
}

console.log("\n── calificarActividad: misma tabla y misma clave que el Excel ──\n");
{
  const db = dobleSupabase();
  const r = await M.calificarActividad(db, {
    grupoMateriaId: "GM-1",
    curp: "AAAA000101HDFXXX01",
    actividadId: "ACT-9",
    claveColumna: "Act 1",
    valor: 80,
    registradoPor: 7,
  });
  ok("devuelve ok", r.ok === true, JSON.stringify(r));
  eq(db.llamadas[0].tabla, "calificaciones", "la misma tabla que la subida");
  eq(
    db.llamadas[0].opts.onConflict,
    "grupo_materia_id,curp,tipo,clave_columna",
    "la misma clave: calificar a mano y subir Excel NO se duplican entre sí",
  );
  eq(db.llamadas[0].payload.tipo, "actividad", "fuerza tipo=actividad");
  eq(db.llamadas[0].payload.actividad_id, "ACT-9", "ata la nota a su actividad");
}

console.log("\n── calificacionesDeAlumno: el filtro va en la CONSULTA ──\n");
{
  const db = dobleSupabase({ calificaciones: { data: [] } });
  await M.calificacionesDeAlumno(db, "AAAA000101HDFXXX01");
  const l = db.llamadas[0];
  // Esta es la afirmación que impide el peor fallo del módulo: si el filtro se
  // hiciera en memoria, el servidor recibiría las notas de todo el grupo.
  ok(
    "filtra por curp en la consulta",
    l.filtros.some(([op, k, v]) => op === "eq" && k === "curp" && v === "AAAA000101HDFXXX01"),
    JSON.stringify(l.filtros),
  );
  ok("sin materia no filtra por grupo_materia_id", !l.filtros.some(([, k]) => k === "grupo_materia_id"));
}

{
  const db = dobleSupabase({ calificaciones: { data: [] } });
  await M.calificacionesDeAlumno(db, "AAAA000101HDFXXX01", "GM-7");
  const l = db.llamadas[0];
  eq(l.filtros.length, 2, "con materia son dos filtros, no uno");
  ok(
    "acota también por grupo_materia_id",
    l.filtros.some(([op, k, v]) => op === "eq" && k === "grupo_materia_id" && v === "GM-7"),
    JSON.stringify(l.filtros),
  );
}

{
  // Un error de la base devuelve lista vacía, NUNCA datos a medias: una
  // pantalla de notas con la mitad de las filas parece correcta.
  const db = dobleSupabase({ calificaciones: { error: { message: "x" }, data: [{ id: "1" }] } });
  const r = await M.calificacionesDeAlumno(db, "C");
  eq(r, [], "con error devuelve [] y descarta el data que venga");
}

console.log("\n── curpsDelGrupoMateria: el padrón que valida la subida ──\n");
{
  const db = dobleSupabase({
    grupo_materias: { data: { grupo_id: "G-1" } },
    inscripciones_alumno: { data: [{ curp: " aaaa000101hdfxxx01 " }, { curp: "BBBB" }, { curp: null }] },
  });
  const set = await M.curpsDelGrupoMateria(db, "GM-1");
  ok("devuelve un Set", set instanceof Set, String(set));
  eq(set.size, 2, "descarta la CURP nula sin romper");
  ok("normaliza a mayúsculas y sin espacios", set.has("AAAA000101HDFXXX01"), [...set].join(","));
  const insc = db.llamadas.find((l) => l.tabla === "inscripciones_alumno");
  ok(
    "pide solo las inscripciones activas",
    insc.filtros.some(([op, k, v]) => op === "eq" && k === "activo" && v === true),
    JSON.stringify(insc.filtros),
  );
  ok(
    "…del grupo de esa materia",
    insc.filtros.some(([op, k, v]) => op === "eq" && k === "grupo_id" && v === "G-1"),
    JSON.stringify(insc.filtros),
  );
}

{
  // `null` y no `new Set()`: «no pude leer el padrón» no es «el grupo está
  // vacío». Confundirlos haría que la subida rechazara a todo el grupo, o peor,
  // que lo aceptara entero sin comprobar.
  const db = dobleSupabase({ grupo_materias: { data: null } });
  const set = await M.curpsDelGrupoMateria(db, "GM-INEXISTENTE");
  ok("materia inexistente → null, no un Set vacío", set === null, String(set));
}
{
  const db = dobleSupabase({
    grupo_materias: { data: { grupo_id: "G-1" } },
    inscripciones_alumno: { error: { message: "x" } },
  });
  ok("padrón ilegible → null", (await M.curpsDelGrupoMateria(db, "GM-1")) === null);
}

console.log("\n── reducir el volumen NO borra ──\n");
{
  const db = dobleSupabase();
  await M.cambiarEstadoMateriaEnGrupo(db, "GM-1", false);
  eq(db.llamadas[0].op, "update", "desactivar es un update");
  ok(
    "ninguna operación es un delete",
    db.llamadas.every((l) => l.op !== "delete"),
    JSON.stringify(db.llamadas.map((l) => l.op)),
  );
  eq(db.llamadas[0].payload.activo, false, "pone activo=false");
  eq(db.llamadas[0].tabla, "grupo_materias", "sobre la pareja, no sobre `materias`");
}

console.log("\n── altaMateriaEnGrupo: idempotente, y sin tabla física ──\n");
{
  // Ya existía: reactiva la fila en vez de crear una segunda pareja.
  const db = dobleSupabase({ "grupo_materias:select": { data: { id: "GM-VIEJO" } } });
  const r = await M.altaMateriaEnGrupo(db, "G-1", "MAT-1");
  ok("devuelve el id existente", r.ok && r.dato.grupoMateriaId === "GM-VIEJO", JSON.stringify(r));
  ok(
    "no inserta una segunda fila para la misma pareja",
    db.llamadas.every((l) => l.op !== "insert"),
    JSON.stringify(db.llamadas.map((l) => l.op)),
  );
  const upd = db.llamadas.find((l) => l.op === "update");
  eq(upd.payload.activo, true, "la reactiva");
}
{
  const db = dobleSupabase({
    "grupo_materias:select": { data: null },
    "grupo_materias:insert": { data: { id: "GM-NUEVO" } },
  });
  const r = await M.altaMateriaEnGrupo(db, "G-1", "MAT-1");
  ok("alta nueva devuelve el id", r.ok && r.dato.grupoMateriaId === "GM-NUEVO", JSON.stringify(r));
  const ins = db.llamadas.find((l) => l.op === "insert");
  // Dejar `tabla_legacy` nula es la decisión que impide que la migración siga
  // alimentando la deuda que viene a cerrar.
  ok(
    "el alta nueva NO crea tabla física: tabla_legacy no se escribe",
    !("tabla_legacy" in ins.payload),
    JSON.stringify(ins.payload),
  );
}

console.log("\n── guardarAlias: un alias por PAREJA ──\n");
{
  const db = dobleSupabase();
  await M.guardarAlias(db, "GM-1", "Mate I", "tecnico01");
  const l = db.llamadas[0];
  eq(l.tabla, "materias_nombres_visibles", "va a la tabla de alias");
  eq(l.opts.onConflict, "grupo_materia_id", "la clave es la pareja, no la materia");
  eq(l.payload.grupo_materia_id, "GM-1", "escribe el puente");
  // Escribir `materia_id` aquí volvería a meter el nombre de la tabla física
  // como identidad: es exactamente la deuda que la migración cierra.
  ok("NO escribe el `materia_id` legacy", !("materia_id" in l.payload), JSON.stringify(l.payload));
}

console.log("\n── el puente legacy, que existe pero no se extiende ──\n");
{
  const db = dobleSupabase({ grupo_materias: { data: { id: "GM-1", grupo_id: "G-1" } } });
  const r = await M.grupoMateriaDesdeTablaLegacy(db, "5TOMCAMAT010");
  ok("resuelve el nombre de tabla a su pareja", r?.id === "GM-1", JSON.stringify(r));
  ok(
    "busca por tabla_legacy, no por materia_id",
    db.llamadas[0].filtros.some(([, k]) => k === "tabla_legacy"),
    JSON.stringify(db.llamadas[0].filtros),
  );
}
{
  const db = dobleSupabase({ grupo_materias: { data: null } });
  ok("sin pareja devuelve null", (await M.grupoMateriaDesdeTablaLegacy(db, "NADA")) === null);
}

console.log("\n── materiasDelAlumno: nunca desde las tablas físicas ──\n");
{
  const db = dobleSupabase({
    inscripciones_alumno: { data: [{ grupo_id: "G-1" }, { grupo_id: "G-1" }] },
    grupo_materias: {
      data: [
        {
          id: "GM-1",
          materia_id: "MAT-1",
          activo: true,
          // PostgREST devuelve las relaciones incrustadas como array aunque la
          // cardinalidad real sea uno. Las dos formas tienen que funcionar: si
          // solo se manejara una, la pantalla saldría con los nombres vacíos.
          materias: [{ nombre: "Matemáticas" }],
          grupos: { grado: "1RO", nombre: "A" },
          materias_nombres_visibles: [{ nombre_visible: "Mate I" }],
        },
      ],
    },
  });
  const r = await M.materiasDelAlumno(db, "AAAA000101HDFXXX01");
  eq(r.length, 1, "una materia");
  eq(r[0].nombre, "Matemáticas", "desenvuelve la relación en array");
  eq(r[0].grupo, "A", "…y la que viene como objeto");
  eq(r[0].nombreVisible, "Mate I", "trae el alias de la pareja");
  const insc = db.llamadas.find((l) => l.tabla === "inscripciones_alumno");
  ok(
    "parte de la inscripción del alumno por CURP",
    insc.filtros.some(([op, k, v]) => op === "eq" && k === "curp" && v === "AAAA000101HDFXXX01"),
    JSON.stringify(insc.filtros),
  );
  const gm = db.llamadas.find((l) => l.tabla === "grupo_materias");
  const inFiltro = gm.filtros.find(([op]) => op === "in");
  eq(inFiltro[2], ["G-1"], "deduplica los grupos repetidos de la inscripción");
  ok(
    "solo las activas por omisión",
    gm.filtros.some(([op, k, v]) => op === "eq" && k === "activo" && v === true),
    JSON.stringify(gm.filtros),
  );
}
{
  const db = dobleSupabase({ inscripciones_alumno: { data: [] } });
  const r = await M.materiasDelAlumno(db, "C");
  eq(r, [], "sin inscripción no hay materias…");
  ok(
    "…y no se pregunta por `grupo_materias` en vano",
    db.llamadas.every((l) => l.tabla !== "grupo_materias"),
    JSON.stringify(db.llamadas.map((l) => l.tabla)),
  );
}
{
  const db = dobleSupabase({
    inscripciones_alumno: { data: [{ grupo_id: "G-1" }] },
    grupo_materias: { data: [{ id: "GM-1", materia_id: "M", activo: false, materias: null, grupos: null, materias_nombres_visibles: null }] },
  });
  const r = await M.materiasDelAlumno(db, "C", false);
  eq(r[0].nombre, "", "una relación ausente da cadena vacía, no revienta");
  eq(r[0].nombreVisible, null, "y el alias ausente es null, no «null»");
  const gm = db.llamadas.find((l) => l.tabla === "grupo_materias");
  ok(
    "soloActivas=false no filtra por activo",
    !gm.filtros.some(([, k]) => k === "activo"),
    JSON.stringify(gm.filtros),
  );
}

console.log("\n── ninguna lectura toca una tabla física de materia ──\n");
{
  // El punto de la migración: si alguna función siguiera leyendo una tabla
  // «1ROAMAT011», la deuda seguiría viva aunque la tabla nueva existiera.
  const fuente = fs.readFileSync(
    path.join(root, "lib/escolar/materia/calificaciones.ts"),
    "utf8",
  );
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const tablas = [...sinComentarios.matchAll(/\.from\(([^)]*)\)/g)].map((m) => m[1].trim());
  const literales = tablas.filter((t) => t.startsWith('"'));
  eq(
    literales.sort(),
    ['"inscripciones_alumno"', '"materias_nombres_visibles"'],
    "las únicas tablas literales son las dos esperadas; el resto va por constante",
  );
  ok(
    "ninguna tabla con forma de materia legacy (1ROAMAT011)",
    !tablas.some((t) => /[0-9]?[A-Z]{3,}[0-9]{3}/.test(t)),
    tablas.join(","),
  );
}

console.log(
  `\n${fallos === 0 ? "Todo en orden" : "HAY FALLOS"}: ${pasadas} comprobaciones pasadas, ${fallos} fallidas.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
