/**
 * test-perfil-extras.mjs — los extras del perfil desde la RPC v2 (PROMPT Z).
 *
 * QUE PRUEBA: `lib/escolar/alumno/perfil-extras-puro.ts` (modulo puro). Con la RPC
 * `obtener_perfil_alumno` v2, el número de control, las etiquetas dinámicas y el
 * contacto del tutor salen de su respuesta; con la v1 (SQL sin aplicar) la función
 * devuelve null y el perfil consulta como siempre. Las reglas tienen que ser las
 * mismas que las de las lecturas a las que sustituye.
 *
 * QUE ESCRIBE: nada. Solo lee del filesystem.
 *
 * Uso:
 *   node scripts/test-perfil-extras.mjs
 */

const P = await import("../lib/escolar/alumno/perfil-extras-puro.ts");

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

// --- v1 o respuesta rara: null (el perfil consulta como antes) -----------------
ok("sin perfil_v (RPC v1): null", P.extrasDesdeRpcPerfil({ alumno: {}, nombres_visibles: [] }) === null);
ok("perfil_v 1: null", P.extrasDesdeRpcPerfil({ perfil_v: 1 }) === null);
ok("perfil_v como texto: null", P.extrasDesdeRpcPerfil({ perfil_v: "2" }) === null);
ok("null, undefined o un número: null", [null, undefined, 7].every((x) => P.extrasDesdeRpcPerfil(x) === null));

// --- v2 ---------------------------------------------------------------------
const etiquetas = [
  { id: "1", curp: "X", titulo: "Beca", valor: "Sí", orden: 0, created_at: "a", updated_at: "a" },
  { id: "2", curp: "X", titulo: "Club", valor: "Robótica", orden: 1, created_at: "b", updated_at: "b" },
];
const v2 = P.extrasDesdeRpcPerfil({
  perfil_v: 2,
  numero_control: "  23222040230009 ",
  etiquetas_dinamicas: etiquetas,
  tutor_principal: { id: "t", nombre: "María", apellidos: "López Peña", telefono: "555", correo: null },
});
ok("v2: número de control recortado", v2?.numeroControl === "23222040230009", v2?.numeroControl);
ok("v2: etiquetas tal cual y en su orden", v2?.etiquetasDinamicas.length === 2 && v2.etiquetasDinamicas[1].titulo === "Club");
ok("v2: contacto del tutor como nombreCompletoTutor", v2?.tutorContacto?.nombre === "María López Peña" && v2.tutorContacto.telefono === "555" && v2.tutorContacto.correo === null, JSON.stringify(v2?.tutorContacto));
const vacio = P.extrasDesdeRpcPerfil({ perfil_v: 2, numero_control: "   ", etiquetas_dinamicas: null, tutor_principal: null });
ok("v2 sin datos: número null, etiquetas [], tutor null", vacio?.numeroControl === null && vacio.etiquetasDinamicas.length === 0 && vacio.tutorContacto === null);
ok("un perfil_v futuro (3) también se acepta", P.extrasDesdeRpcPerfil({ perfil_v: 3 }) !== null);

// --- mismas reglas que las lecturas viejas -----------------------------------
ok("numeroControlLeido: como leerNumeroControl", P.numeroControlLeido(" A1 ") === "A1" && P.numeroControlLeido("") === null && P.numeroControlLeido(null) === null && P.numeroControlLeido(42) === null);
ok("contactoTutor: sin apellidos no deja espacio colgando", P.contactoTutor({ nombre: "Ana", apellidos: null }).nombre === "Ana");
ok("contactoTutor(null) = null", P.contactoTutor(null) === null);
ok("la respuesta v2 no expone password_hash (el SQL no lo pide)", !Object.keys(v2?.tutorContacto ?? {}).includes("password_hash"));

console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas ? 1 : 0);
