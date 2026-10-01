#!/usr/bin/env node
/**
 * migrar-ensayo-modelo-b.mjs — ensayo de punta a punta del modelo B
 * (calificaciones normalizadas) contra la base REAL.
 *
 * QUÉ MIDE: que las escrituras del modelo B funcionan en PostgreSQL de verdad
 *           —no contra un doble—: que el upsert re-sube sin duplicar, que la
 *           lectura por CURP no trae a nadie más, y que alias y mapeo se
 *           guardan por la pareja.
 * QUÉ ESCRIBE:
 *   · en seco (por omisión): NADA. Solo lecturas e imprime el plan.
 *   · con --apply: filas en `calificaciones` con una CURP CENTINELA, que borra
 *     al terminar (también si algo falla); y re-guarda UN alias y UN mapeo con
 *     sus MISMOS valores, lo que solo mueve su `updated_at`.
 * CÓMO SE EJECUTA:
 *   node scripts/migrar-ensayo-modelo-b.mjs            (en seco)
 *   node scripts/migrar-ensayo-modelo-b.mjs --apply    (ensayo real)
 *
 * ── Por qué existe, y por qué escribe ──────────────────────────────────────
 * El 2026-10-01 las tres escrituras del modelo B devolvían 42P10 en la base
 * —sus `onConflict` apuntaban a índices parcial y de expresión, que PostgreSQL
 * no infiere— mientras `test-calificaciones-io.mjs` estaba en verde. El doble
 * de esa suite acepta cualquier `onConflict`; solo la base dice si existe. Este
 * ensayo es esa pregunta hecha a la base.
 *
 * No se puede hacer en una transacción que se deshaga: este Supabase NO honra
 * `Prefer: tx=rollback` (medido el mismo día). Así que escribe de verdad y
 * limpia. Por eso lleva el prefijo `migrar-` y la guarda `--apply` (ORDEN.md
 * §4): un script que escribe no puede llamarse `test-`, `diag-` ni `probe-`.
 *
 * ── Por qué es seguro ──────────────────────────────────────────────────────
 * · La CURP centinela lleva guiones: una CURP real no puede tenerlos, así que
 *   el borrado final no puede alcanzar la nota de ningún alumno.
 * · Las notas van a la materia de PRÁCTICA (`5TOMCAMAT010`), cuyos datos ya se
 *   declararon de práctica.
 * · Antes de borrar, cuenta: si encuentra más filas centinela de las que
 *   escribió, NO borra y lo dice.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.join(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");

const CENTINELA = "ENSAYO-MODELO-B";
const TABLA_PRACTICA = "5TOMCAMAT010";

/* ── Entorno ────────────────────────────────────────────────────────────── */
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// El código que se ensaya es el de la app, no una copia: si el módulo cambia,
// el ensayo prueba lo nuevo.
const C = await import("../lib/escolar/materia/calificaciones.ts");
const Mp = await import("../lib/escolar/materia/mapeo-columnas-materia.ts");

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (cond) console.log(`  ok    ${nombre}`);
  else {
    fallos++;
    console.log(`  FALLA ${nombre}${detalle ? `  → ${detalle}` : ""}`);
  }
};

/* ── 1. Lecturas: el estado del puente ──────────────────────────────────── */
console.log(`\nModelo B — ensayo ${APPLY ? "REAL (--apply)" : "en seco (sin escribir)"}\n`);
console.log("1 · el puente\n");

const { data: gms } = await supabase.from("grupo_materias").select("id, tabla_legacy");
const porTabla = new Map((gms ?? []).filter((g) => g.tabla_legacy).map((g) => [g.tabla_legacy, g.id]));
console.log(`  grupo_materias: ${gms?.length ?? 0} · con tabla física: ${porTabla.size}`);

for (const tabla of ["materias_nombres_visibles", "materias_mapeo_columnas"]) {
  const { data } = await supabase.from(tabla).select("materia_id, grupo_materia_id");
  const filas = data ?? [];
  // Roto = tiene clave vieja con pareja, pero no el puente. Es lo que habría
  // pasado con los escritores viejos si no escribieran `grupo_materia_id`.
  const rotas = filas.filter((f) => f.materia_id && porTabla.has(f.materia_id) && !f.grupo_materia_id);
  const desalineadas = filas.filter(
    (f) => f.materia_id && f.grupo_materia_id && porTabla.get(f.materia_id) !== f.grupo_materia_id,
  );
  ok(`${tabla}: ${filas.length} filas, todas con puente`, rotas.length === 0, `${rotas.length} sin puente`);
  ok(`${tabla}: las dos claves apuntan a la misma pareja`, desalineadas.length === 0, `${desalineadas.length} desalineadas`);
}

const { data: mapeos } = await supabase.from("materias_mapeo_columnas").select("materia_id, columna_curp, activo");
const sinCurp = (mapeos ?? []).filter((m) => m.activo !== false && !m.columna_curp);
console.log(
  `\n  AVISO de uso, no de esquema: ${sinCurp.length} de ${mapeos?.length ?? 0} mapeos activos no declaran ` +
    `la columna de CURP (${sinCurp.map((m) => m.materia_id).join(", ") || "ninguno"}).\n` +
    "  Esas materias no pueden subir al modelo nuevo hasta que el profesor la marque.",
);

const { count: nCal } = await supabase.from("calificaciones").select("id", { count: "exact", head: true });
const { count: nCent } = await supabase
  .from("calificaciones")
  .select("id", { count: "exact", head: true })
  .eq("curp", CENTINELA);
console.log(`\n  calificaciones: ${nCal ?? "?"} filas · centinela de un ensayo anterior: ${nCent ?? "?"}`);
ok("no quedan restos de un ensayo anterior", (nCent ?? 0) === 0);

const gmPractica = porTabla.get(TABLA_PRACTICA);
ok(`la materia de práctica ${TABLA_PRACTICA} tiene pareja`, Boolean(gmPractica));

/* ── 1b. Las lecturas, contra PostgREST de verdad ───────────────────────────
 * El doble de `test-calificaciones-io.mjs` acepta cualquier sintaxis de filtro.
 * Un `grupos!inner` mal escrito o un filtro sobre relación incrustada que
 * PostgREST no entiende solo aparece aquí. Se imprimen CUENTAS, nunca datos
 * de alumnos.
 */
console.log("\n1b · las lecturas del modelo B, contra la base\n");
const N = await import("../lib/escolar/materia/nombres-visibles.ts");
const Ce = await import("../lib/escolar/ciclo/ciclo-estado.ts");

const aliasPorPareja = await N.listarAliasPorGrupoMateria(supabase);
const { count: aliasActivos } = await supabase
  .from("materias_nombres_visibles")
  .select("id", { count: "exact", head: true })
  .eq("activo", true);
ok(
  `listarAliasPorGrupoMateria ve todos los alias activos (${aliasPorPareja.size} de ${aliasActivos})`,
  aliasPorPareja.size === aliasActivos,
);

const operativo = await Ce.obtenerCicloOperativoGlobal(supabase);
if (operativo.ok && operativo.periodo) {
  const parejas = await C.listarParejasDelPeriodo(supabase, String(operativo.periodo.id));
  ok(`listarParejasDelPeriodo lee el ciclo operativo (${parejas?.length ?? "null"} parejas)`, Array.isArray(parejas) && parejas.length > 0);
  if (parejas) {
    const conAlias = parejas.filter((p) => p.alias).length;
    const inactivas = parejas.filter((p) => !p.activo).length;
    console.log(`        ${conAlias} con alias · ${inactivas} inactivas · ${parejas.filter((p) => !p.tieneTablaFisica).length} sin tabla física`);
  }
  const cat = await C.catalogoParaAlta(supabase, String(operativo.periodo.id));
  ok(
    `catalogoParaAlta lee grupos y materias activas (${cat?.grupos.length ?? "null"} grupos · ${cat?.materias.length ?? "null"} materias)`,
    Boolean(cat && cat.grupos.length > 0 && cat.materias.length > 0),
  );
  // Con la carrera, ninguna etiqueta debe repetirse entre grupos distintos: sin
  // ella, 10 de las 24 del ciclo 2026-2027 se repetían («2DO A» de Mecatrónica
  // y de RH) y el técnico podía dar de alta en el grupo equivocado.
  if (cat) {
    const etiquetas = cat.grupos.map((g) => `${g.grado} ${g.nombre} ${g.carrera ?? ""}`);
    const repetidas = etiquetas.filter((e, i) => etiquetas.indexOf(e) !== i);
    ok(
      `grado + grupo + carrera distingue a todos los grupos (${new Set(etiquetas).size} etiquetas para ${etiquetas.length} grupos)`,
      repetidas.length === 0,
      `repetidas: ${[...new Set(repetidas)].join(", ")}`,
    );
  }
} else {
  console.log(`  (sin ciclo operativo: ${operativo.error ?? "ninguno"}; no se ensaya la lista del técnico)`);
}

if (gmPractica) {
  const padron = await C.curpsDelGrupoMateria(supabase, gmPractica);
  ok(`curpsDelGrupoMateria lee el padrón de la práctica (${padron?.size ?? "null"} alumnos)`, padron instanceof Set);
  ok("la pareja de práctica se reconoce activa o inactiva", (await C.grupoMateriaActiva(supabase, gmPractica)) !== null);
}

// Un alumno inscrito cualquiera: la consulta incrustada de `materiasDelAlumno`
// (materias, grupos y alias con su `activo`) solo se valida contra la base.
const { data: unaInsc } = await supabase
  .from("inscripciones_alumno")
  .select("curp")
  .eq("activo", true)
  .limit(1)
  .maybeSingle();
if (unaInsc?.curp) {
  const ms = await C.materiasDelAlumno(supabase, unaInsc.curp);
  ok(`materiasDelAlumno resuelve la carga de un alumno inscrito (${ms.length} materias)`, ms.length > 0);
  ok("…con el nombre de cada materia resuelto", ms.every((m) => m.nombre.length > 0));
}

if (!APPLY) {
  console.log(
    "\nEn seco: no se escribió nada. El plan con --apply:\n" +
      `  · escribir notas con CURP ${CENTINELA} en ${TABLA_PRACTICA} (${gmPractica ?? "sin pareja"})\n` +
      "  · re-subir la misma clave con otro valor y comprobar que NO se duplica\n" +
      "  · leer por CURP y comprobar que solo vuelve la centinela\n" +
      "  · re-guardar un alias y un mapeo con sus MISMOS valores (solo mueve updated_at)\n" +
      "  · borrar la centinela y comprobar que quedan 0\n",
  );
  process.exit(fallos === 0 ? 0 : 1);
}

/* ── 2. Escritura real ──────────────────────────────────────────────────── */
if (!gmPractica) {
  console.log("\nSin pareja de práctica no hay dónde ensayar. Nada escrito.");
  process.exit(1);
}

let escritas = 0;
try {
  console.log("\n2 · calificaciones, con el código de la app\n");

  const filas = [
    { curp: CENTINELA, tipo: "actividad", claveColumna: "Act 1", valor: 80 },
    { curp: CENTINELA, tipo: "actividad", claveColumna: "Act 2", valor: 70 },
    { curp: CENTINELA, tipo: "parcial", claveColumna: "P1", valor: 75 },
  ];
  const r1 = await C.guardarCalificaciones(supabase, gmPractica, filas, null);
  ok("guardarCalificaciones escribe (sin 42P10)", r1.ok, r1.ok ? "" : r1.error);
  if (r1.ok) escritas = filas.length;

  // Re-subir: misma clave, otro valor. Si la clave de conflicto no fuera la
  // del índice, esto DUPLICARÍA o fallaría.
  const r2 = await C.guardarCalificaciones(
    supabase,
    gmPractica,
    [{ curp: CENTINELA, tipo: "actividad", claveColumna: "Act 1", valor: 95 }],
    null,
  );
  ok("re-subir la misma celda no falla", r2.ok, r2.ok ? "" : r2.error);

  const leidas = await C.calificacionesDeAlumno(supabase, CENTINELA, gmPractica);
  ok("re-subir ACTUALIZA: siguen siendo 3 filas, no 4", leidas.length === 3, `hay ${leidas.length}`);
  const act1 = leidas.find((f) => f.clave_columna === "Act 1");
  ok("…y la celda re-subida tiene el valor nuevo", Number(act1?.valor) === 95, `valor ${act1?.valor}`);
  ok("la lectura por CURP no trae a nadie más", leidas.every((f) => f.curp === CENTINELA));

  const rA = await C.calificarActividad(supabase, {
    grupoMateriaId: gmPractica,
    curp: CENTINELA,
    actividadId: null,
    claveColumna: "Act 2",
    valor: 88,
    registradoPor: null,
  });
  ok("calificarActividad escribe (sin 42P10)", rA.ok, rA.ok ? "" : rA.error);
  const tras = await C.calificacionesDeAlumno(supabase, CENTINELA, gmPractica);
  ok("calificar a mano y subir Excel caen en la MISMA fila", tras.length === 3, `hay ${tras.length}`);

  console.log("\n3 · alias y mapeo por la pareja (mismos valores)\n");

  // Un alias activo que ya tenga puente: re-guardarlo igual solo mueve updated_at.
  const { data: alias } = await supabase
    .from("materias_nombres_visibles")
    .select("grupo_materia_id, materia_id, nombre_visible, actualizado_por")
    .eq("activo", true)
    .not("grupo_materia_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (alias) {
    const rAl = await C.guardarAlias(supabase, alias.grupo_materia_id, alias.nombre_visible, alias.actualizado_por);
    ok(`guardarAlias por pareja escribe (sin 42P10) · «${alias.nombre_visible}»`, rAl.ok, rAl.ok ? "" : rAl.error);
    const { data: despues } = await supabase
      .from("materias_nombres_visibles")
      .select("materia_id, nombre_visible")
      .eq("grupo_materia_id", alias.grupo_materia_id);
    ok("sigue siendo UNA fila para esa pareja", despues?.length === 1, `hay ${despues?.length}`);
    ok("con su clave vieja intacta", despues?.[0]?.materia_id === alias.materia_id, despues?.[0]?.materia_id);
  } else {
    ok("hay un alias activo con puente para ensayar", false);
  }

  const mapeoActual = await Mp.obtenerMapeoPorGrupoMateria(supabase, gmPractica);
  if (mapeoActual) {
    const { data: filaMapeo } = await supabase
      .from("materias_mapeo_columnas")
      .select("actualizado_por")
      .eq("grupo_materia_id", gmPractica)
      .maybeSingle();
    const rM = await Mp.guardarMapeoPorGrupoMateria(
      supabase,
      gmPractica,
      mapeoActual,
      filaMapeo?.actualizado_por ?? "",
    );
    ok("guardarMapeoPorGrupoMateria escribe (sin 42P10)", rM.ok, rM.ok ? "" : rM.error);
    const releido = await Mp.obtenerMapeoPorGrupoMateria(supabase, gmPractica);
    ok(
      "el mapeo re-guardado es el mismo",
      JSON.stringify(releido) === JSON.stringify(mapeoActual),
      "cambió al re-guardarlo",
    );
  } else {
    console.log(`  (sin mapeo activo en ${TABLA_PRACTICA}: no se ensaya el mapeo)`);
  }
} finally {
  /* ── 4. Limpieza, pase lo que pase ────────────────────────────────────── */
  console.log("\n4 · limpieza\n");
  const { count: antes } = await supabase
    .from("calificaciones")
    .select("id", { count: "exact", head: true })
    .eq("curp", CENTINELA);
  // Nunca más de lo que este ensayo pudo escribir: 3 filas. Si hay más, algo
  // que no entiendo está pasando, y borrar a ciegas es justo lo que no se hace.
  if ((antes ?? 0) > 3) {
    fallos++;
    console.log(`  FALLA hay ${antes} filas centinela y este ensayo escribe 3 como máximo. NO se borra nada.`);
  } else if ((antes ?? 0) > 0) {
    const { error } = await supabase.from("calificaciones").delete().eq("curp", CENTINELA);
    ok(`borradas las ${antes} filas centinela`, !error, error?.message);
  }
  const { count: despues } = await supabase
    .from("calificaciones")
    .select("id", { count: "exact", head: true })
    .eq("curp", CENTINELA);
  ok("no queda ninguna fila centinela", (despues ?? 0) === 0, `quedan ${despues}`);
  console.log(`\n(escritas en este ensayo antes de la limpieza: ${escritas})`);
}

console.log(`\n${fallos === 0 ? "Modelo B funciona contra la base." : `HAY FALLOS: ${fallos}.`}\n`);
process.exit(fallos === 0 ? 0 : 1);
