/**
 * test-login-fuente.mjs — el login decide igual con la RPC que con las consultas (PROMPT Z-bis).
 *
 * QUE PRUEBA: `validarAccesoPortal` (lib/auth/portal-login.ts) con las dos fuentes de
 * `lib/auth/fuente-login.ts`: candidatos traídos por la RPC `candidatos_login`
 * (`fuenteDesdeCandidatos`) y las consultas de siempre (simuladas aquí con los mismos
 * datos en memoria). Para cada caso —profesor, alumno, tutor por usuario o por
 * clave, contraseña inicial multi-hijo, tutor inactivo, clave equivocada— las dos
 * fuentes tienen que dar el MISMO resultado. Usa hashes scrypt reales, generados
 * aquí: no hay ninguna contraseña de verdad.
 *
 * QUE ESCRIBE: nada. Solo lee del filesystem (no toca la base ni la red).
 *
 * Uso:
 *   node scripts/test-login-fuente.mjs
 */
import { registerHooks } from "node:module";

// `server-only` lanza fuera de React Server: aquí es un módulo vacío.
registerHooks({
  resolve(esp, ctx, siguiente) {
    if (esp === "server-only") return { url: "data:text/javascript,export {};", format: "module", shortCircuit: true };
    return siguiente(esp, ctx);
  },
});

const L = await import("../lib/auth/portal-login.ts");
const F = await import("../lib/auth/fuente-login.ts");
const TC = await import("../lib/escolar/tutores/tutores-credenciales.ts");
const A = await import("../lib/escolar/alumno/alumnos.ts");
const P = await import("../lib/escolar/catalogo/profesores.ts");

let pasadas = 0;
let fallidas = 0;
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`ok  ${titulo}`);
  } else {
    fallidas++;
    console.log(`FALLA  ${titulo}${detalle ? ` -> ${detalle}` : ""}`);
  }
}

// --- datos sintéticos ---------------------------------------------------------
const profesores = [
  { ID: 7, "NOMBRE/PROFESOR/DIRECTIVO": "Laura Méndez Ruiz", CLAVE: "DOC777", Permisos: "Profesor", debe_cambiar_credenciales: false },
  { ID: 9, "NOMBRE/PROFESOR/DIRECTIVO": "Óscar Peña Gil", CLAVE: "DIR999", Permisos: "Directivo", debe_cambiar_credenciales: true },
];
const alumnos = [
  { CURP: "AAAA000000HZZZZZ01", NOMBRE: "José Ángel", P_APELLIDO: "García", S_APELLIDO: "Núñez", CLAVE: "ZZZ01X" },
  { CURP: "BBBB000000MZZZZZ02", NOMBRE: "María", P_APELLIDO: "Muñoz", S_APELLIDO: "Peña", CLAVE: "ZZZ02Y" },
];
const hashPadre = TC.hashContraseñaTutor("Personal-2026");
const hashInicialHijo1 = TC.hashContraseñaTutor("0000HZZZ");
const hashInicialHijo2 = TC.hashContraseñaTutor("0000MZZZ");
const tutorActivo = { id: "t-1", clave_tutor: "TUT-AAAA1111", nombre: "Rosa", apellidos: "García", curp: null, telefono: null, correo: null, usuario: "rosa.garcia", password_hash: hashPadre, debe_cambiar_credenciales: true, activo: true, created_at: "", updated_at: "" };
const tutorInactivo = { ...tutorActivo, id: "t-2", clave_tutor: "TUT-BBBB2222", usuario: "baja", activo: false };
const tutores = [tutorActivo, tutorInactivo];
const iniciales = { "t-1": [hashInicialHijo1, hashInicialHijo2], "t-2": [] };

/** Las «consultas de siempre», en memoria, con las mismas reglas que buscarTutorPorUsuario/Clave. */
const consultas = {
  via: "consultas",
  profesor: async (id) => P.elegirProfesorPorNombre(profesores, id),
  alumno: async (id) => A.elegirAlumnoPorNombre(alumnos, id),
  tutorPorUsuario: async (id) => tutores.find((t) => t.usuario.toLowerCase() === id.trim().toLowerCase()) ?? null,
  tutorPorClave: async (id) => {
    const m = tutores.filter((t) => t.clave_tutor === id.trim().toUpperCase());
    return m.length === 1 ? m[0] : null;
  },
  coincideInicial: async (tutorId, clave) => TC.verificarContraseñaEntreHashes(clave, iniciales[tutorId] ?? []),
};

/** Lo que devolvería la RPC para ese identificador (mismas reglas, ya resueltas). */
async function candidatos(id) {
  const porUsuario = await consultas.tutorPorUsuario(id);
  const porClave = porUsuario ? null : await consultas.tutorPorClave(id);
  const elegido = porUsuario ?? porClave;
  return {
    candidatos_v: 1,
    profesores,
    alumnos,
    tutor_usuario: porUsuario,
    tutor_clave: porClave,
    hashes_iniciales: elegido ? iniciales[elegido.id] : [],
  };
}

const CASOS = [
  ["profesor con su clave", "Laura Mendez Ruiz", "DOC777"],
  ["profesor en minúsculas", "laura méndez ruiz", "doc777"],
  ["directivo (debe cambiar clave)", "OSCAR PEÑA GIL", "DIR999"],
  ["profesor con clave equivocada", "Laura Méndez Ruiz", "otra"],
  ["alumno con su clave", "Jose Angel Garcia Nunez", "ZZZ01X"],
  ["alumno en otro orden", "Muñoz Peña María", "zzz02y"],
  ["alumno con clave equivocada", "María Muñoz Peña", "ZZZ01X"],
  ["tutor por usuario y contraseña propia", "rosa.garcia", "Personal-2026"],
  ["tutor por usuario en mayúsculas", "ROSA.GARCIA", "Personal-2026"],
  ["tutor con la contraseña inicial del hijo 2", "rosa.garcia", "0000MZZZ"],
  ["tutor por clave_tutor", "tut-aaaa1111", "0000HZZZ"],
  ["tutor con contraseña equivocada", "rosa.garcia", "nada"],
  ["tutor inactivo con su contraseña", "baja", "Personal-2026"],
  ["nadie", "zz nadie", "x"],
  ["identificador vacío", "   ", "x"],
];
for (const [titulo, id, clave] of CASOS) {
  const conConsultas = await L.validarAccesoPortal(null, id, clave, consultas);
  const conRpc = await L.validarAccesoPortal(null, id, clave, F.fuenteDesdeCandidatos(await candidatos(id.trim()), consultas));
  ok(`${titulo}: misma decisión con RPC y con consultas`, JSON.stringify(conConsultas) === JSON.stringify(conRpc), `${JSON.stringify(conConsultas)} vs ${JSON.stringify(conRpc)}`);
}

// Y las decisiones son las esperadas (no solo iguales entre sí).
const r = async (id, clave) => L.validarAccesoPortal(null, id, clave, F.fuenteDesdeCandidatos(await candidatos(id), consultas));
ok("el profesor entra con su rol y su ID", (await r("Laura Mendez Ruiz", "DOC777"))?.profesorId === 7);
ok("el directivo entra marcado para cambiar clave", (await r("Oscar Peña Gil", "DIR999"))?.debeCambiarCredenciales === true);
ok("el alumno entra con su CURP", (await r("Jose Angel Garcia Nunez", "ZZZ01X"))?.curp === alumnos[0].CURP);
ok("el tutor entra con la contraseña inicial de cualquiera de sus hijos", (await r("rosa.garcia", "0000MZZZ"))?.rol === "tutor");
ok("el tutor inactivo NO entra", (await r("baja", "Personal-2026")) === null);
ok("con clave equivocada nadie entra", (await r("Laura Méndez Ruiz", "otra")) === null && (await r("rosa.garcia", "nada")) === null);

// Si se pregunta por la contraseña inicial de OTRO tutor, se consulta (no se usan hashes ajenos).
let consultado = 0;
const espia = { ...consultas, coincideInicial: async (...a) => (consultado++, consultas.coincideInicial(...a)) };
await F.fuenteDesdeCandidatos(await candidatos("rosa.garcia"), espia).coincideInicial("t-2", "x");
ok("los hashes de la RPC solo valen para el tutor que eligió", consultado === 1);

console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas ? 1 : 0);
