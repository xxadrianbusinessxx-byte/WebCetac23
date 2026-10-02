#!/usr/bin/env node
/**
 * test-seguimiento-medico.mjs — suite pura de `lib/escolar/alumno/seguimiento-medico-puro.ts`
 * y de su contrato con `supabase/crear-historial-seguimiento-medico.sql`.
 *
 * QUÉ MIDE: quién puede firmar una edición médica (desde la sesión), qué campos
 *           se auditan (solo los del apartado «Seguimiento médico»), cómo se lee
 *           una entrada del historial, y que la función SQL escribe EXACTAMENTE
 *           los 14 campos personales y acepta los mismos roles que TypeScript.
 *           Ese último cruce existe porque, si alguien añade un campo a
 *           `CAMPOS_PERSONALES_PRIMARIOS` y no al SQL, la función lo ignoraría
 *           sin error y el dato no se guardaría.
 * QUÉ ESCRIBE: nada. Carga los `.ts` y lee el `.sql` del filesystem. No toca la
 *              base ni la red.
 * CÓMO SE EJECUTA: node scripts/test-seguimiento-medico.mjs
 */
import fs from "node:fs";
import path from "node:path";

const S = await import("../lib/escolar/alumno/seguimiento-medico-puro.ts");
const { CAMPOS_SEGUIMIENTO_MEDICO, CAMPOS_INFORMACION_PERSONAL } = await import(
  "../lib/escolar/alumno/grupos-campos-personales.ts"
);
const { CAMPOS_PERSONALES_PRIMARIOS } = await import("../lib/escolar/alumno/etiquetas.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const UUID = "C9B1C00C-FBA0-4E4A-B7D6-C0CB75425B2B";

/* ── 1. Quién firma ────────────────────────────────────────────────────── */
console.log("\nquién firma la edición");
eq(
  S.editorDesdeSesion({ rol: "tutor", matricula: ` ${UUID} `, nombre: "  Ana López " }),
  { rol: "tutor", profesorId: null, tutorId: UUID.toLowerCase(), nombre: "Ana López" },
  "tutor → su tutores.id (normalizado) y su nombre",
);
eq(S.editorDesdeSesion({ rol: "tutor", matricula: "4321" }), null, "tutor sin uuid en la sesión → no firma");
eq(
  S.editorDesdeSesion({ rol: "directivo", matricula: "4321", profesorId: 7, nombre: "Dir" }),
  { rol: "directivo", profesorId: 7, tutorId: null, nombre: "Dir" },
  "directivo → PROFESORES.ID, nunca la CLAVE",
);
eq(
  S.editorDesdeSesion({ rol: "administracion", matricula: "x", profesorId: 22 }),
  { rol: "administracion", profesorId: 22, tutorId: null, nombre: null },
  "administración → PROFESORES.ID; sin nombre → null",
);
eq(S.editorDesdeSesion({ rol: "administracion", matricula: "4321" }), null, "administración sin profesorId → no firma");
eq(S.editorDesdeSesion({ rol: "directivo", matricula: "4321", profesorId: 0 }), null, "profesorId 0 → no firma");
eq(S.editorDesdeSesion({ rol: "directivo", matricula: "4321", profesorId: 1.5 }), null, "profesorId no entero → no firma");
eq(S.editorDesdeSesion({ rol: "alumno", matricula: "A1", curp: "X" }), null, "el alumno nunca firma");
eq(S.editorDesdeSesion({ rol: "maestro", matricula: "4321", profesorId: 3 }), null, "el profesor no edita el seguimiento médico");
eq(S.editorDesdeSesion({ rol: "tecnico", matricula: "1", profesorId: 21 }), null, "el técnico no edita el seguimiento médico");
eq(S.editorDesdeSesion(null), null, "sin sesión → null");

/* ── 2. Qué se audita ──────────────────────────────────────────────────── */
console.log("\nqué campos se auditan");
const soloPersonal = Object.fromEntries(CAMPOS_INFORMACION_PERSONAL.map((c) => [c, "x"]));
eq(S.camposMedicosDelPatch(soloPersonal), [], "«Información personal» no deja historial");
eq(
  S.camposMedicosDelPatch({ PESO: "52", CORREO: "a@b.c", ALERGIAS: null }),
  ["ALERGIAS", "PESO"],
  "solo las claves médicas, en el orden del apartado; vaciar (null) también cuenta",
);
const todos = Object.fromEntries(CAMPOS_PERSONALES_PRIMARIOS.map((c) => [c, "x"]));
eq(S.camposMedicosDelPatch(todos), [...CAMPOS_SEGUIMIENTO_MEDICO], "los auditados son EXACTAMENTE los del apartado");
eq(S.camposMedicosDelPatch({ toString: "x", "TIPO DE SANGRE": "O+" }), ["TIPO DE SANGRE"], "claves heredadas no cuentan");
eq(S.camposMedicosDelPatch({}), [], "patch vacío → nada que auditar");

/* ── 3. Cómo se lee una entrada ────────────────────────────────────────── */
console.log("\nentradas del historial");
const filas = [
  {
    id: 1,
    editor_rol: "tutor",
    editor_nombre: " Ana López ",
    cambios: [{ campo: "ALERGIAS", antes: null, despues: "Penicilina" }],
    editado_at: "2026-09-30T23:10:00+00:00",
  },
  {
    id: 3,
    editor_rol: "administracion",
    editor_nombre: null,
    cambios: [
      { campo: "ENFERMEDAD CRONICA", antes: "Asma", despues: "  " },
      { campo: "PESO", antes: "50", despues: "52" },
    ],
    editado_at: "2026-10-01T16:31:00+00:00",
  },
  {
    id: 2,
    editor_rol: "directivo",
    editor_nombre: "Dir",
    cambios: [{ campo: "LENTES", antes: "No", despues: "Sí" }],
    editado_at: "2026-10-01T16:31:00+00:00",
  },
];
const e = S.entradasHistorialMedico(filas);
eq(e.map((x) => x.id), [3, 2, 1], "la más reciente primero; empate de instante → id mayor primero");
eq([e[0].fecha, e[0].hora], ["2026-10-01", "10:31"], "fecha y hora del PLANTEL, no UTC");
eq([e[2].fecha, e[2].hora], ["2026-09-30", "17:10"], "las 23:10 UTC siguen siendo el día anterior en el plantel");
eq(e.map((x) => x.quien), ["Administración escolar", "Dirección", "Padre o tutor"], "rol legible");
eq([e[0].nombre, e[2].nombre], [null, "Ana López"], "nombre recortado; ausente → null");
eq(
  e[0].cambios,
  [
    { campo: "ENFERMEDAD CRONICA", etiqueta: "Enfermedad crónica", antes: "Asma", despues: null },
    { campo: "PESO", etiqueta: "Peso", antes: "50", despues: "52" },
  ],
  "cada cambio con su etiqueta amigable; valor en blanco → null («—»)",
);
eq(e[0].cambios.length + e[1].cambios.length + e[2].cambios.length, 4, "no se pierde ningún cambio");

const raras = S.entradasHistorialMedico([
  { id: 9, editor_rol: "tutor", editor_nombre: null, cambios: "no es lista", editado_at: "2026-10-01T00:00:00Z" },
  { id: 8, editor_rol: "otro", editor_nombre: null, cambios: [{ campo: "XYZ", antes: 1, despues: 2 }, { antes: "sin campo" }, null], editado_at: "basura" },
  { id: 7, editor_rol: "", editor_nombre: null, cambios: [{ campo: "PESO", antes: "1", despues: "2" }], editado_at: "2026-01-01T12:00:00Z" },
]);
eq(raras.map((x) => x.id), [7, 8], "jsonb que no es lista → la entrada no se muestra; instante inválido va al final");
eq([raras[1].fecha, raras[1].hora], ["", ""], "instante inválido → sin fecha, no una inventada");
eq(raras[1].quien, "otro", "rol desconocido se muestra tal cual");
eq(raras[0].quien, "Desconocido", "rol vacío → «Desconocido»");
eq(raras[1].cambios, [{ campo: "XYZ", etiqueta: "XYZ", antes: "1", despues: "2" }], "campo desconocido se conserva; items rotos se descartan");
eq(S.entradasHistorialMedico([]), [], "sin filas → lista vacía");
ok("límite razonable de entradas", S.LIMITE_HISTORIAL_MEDICO > 0 && S.LIMITE_HISTORIAL_MEDICO <= 200);

/* ── 4. Contrato con el SQL ────────────────────────────────────────────── */
console.log("\ncontrato con supabase/crear-historial-seguimiento-medico.sql");
const sql = fs
  .readFileSync(path.join(import.meta.dirname, "..", "supabase", "crear-historial-seguimiento-medico.sql"), "utf8")
  .replace(/--[^\n]*/g, "");

const set = sql.match(/update\s+public\."ETIQUETAS PERSONALES"\s+set([\s\S]*?)where/i);
ok("la función tiene su UPDATE de ETIQUETAS PERSONALES", Boolean(set));
const columnas = set
  ? [...set[1].matchAll(/"([^"]+)"\s*=\s*v_fila\."([^"]+)"/g)].map((m) => {
      ok(`«${m[1]}» se asigna desde su propia columna`, m[1] === m[2]);
      return m[1];
    })
  : [];
eq([...columnas].sort(), [...CAMPOS_PERSONALES_PRIMARIOS].sort(), "el UPDATE escribe EXACTAMENTE los 14 campos personales");

const roles = sql.match(/editor_rol\s+in\s*\(([^)]*)\)/i);
const rolesSql = roles ? [...roles[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : [];
eq(rolesSql, Object.keys(S.ETIQUETA_ROL_EDITOR).sort(), "el CHECK de editor_rol acepta los mismos roles que TypeScript");
ok("el historial no se puede reescribir (revoke update/delete)", /revoke\s+update,\s*delete/i.test(sql));
ok("la fila «antes» se lee bloqueada (for update)", /for\s+update/i.test(sql));

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
if (fallos > 0) process.exit(1);
