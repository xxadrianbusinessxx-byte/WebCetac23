/**
 * test-validacion.mjs — Pruebas PURAS de `lib/validacion/` (PROMPT K).
 *
 * QUÉ MIDE: que los esquemas de entrada acepten lo que el portal aceptaba antes y
 *           rechacen lo que no debe pasar, y que los mensajes de error sigan siendo
 *           los de siempre —en castellano, pensados para el usuario—.
 * QUÉ ESCRIBE: nada. No toca la base.
 * CÓMO SE EJECUTA: node scripts/test-validacion.mjs
 *
 * Importa el FUENTE `.ts` directo: son módulos puros que solo importan `valibot`, así
 * que Node los ejecuta sin compilar (PROMPT H). Si algún día dejan de ser puros, esta
 * suite falla al cargar — y eso también es información.
 */
const { leerFormData } = await import("../lib/validacion/leer-form-data.ts");
const {
  MSJ, archivo, archivoConTope, archivoPresente, imagen, texto, textoMayusculas, textoOpcional,
  esquemaLogin, esquemaNoticia, esquemaAliasArchivo, esquemaSubirDocumento, esquemaArchivoAsistencias,
  esquemaSubirCalificaciones, esquemaArchivoMateria, esquemaFotoPerfil, esquemaRoster,
  esquemaArchivoEtiquetas, esquemaArchivoHorario, esquemaSolicitarJustificacion, esquemaCargaAcademica,
} = await import("../lib/validacion/esquemas-puro.ts");

let pasadas = 0;
let fallidas = 0;

function ok(nombre, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`  OK    ${nombre}`);
  } else {
    fallidas++;
    console.error(`  FALLA ${nombre} ${detalle}`);
  }
}

/** Un `File` de verdad, con tamaño y tipo, como el que llega de un formulario. */
const file = (nombre, tipo, bytes) => new File([new Uint8Array(bytes)], nombre, { type: tipo });

function fd(entradas) {
  const f = new FormData();
  for (const [k, val] of Object.entries(entradas)) {
    if (Array.isArray(val)) for (const x of val) f.append(k, x);
    else f.append(k, val);
  }
  return f;
}

/** ¿Pasa el esquema con ese FormData? */
const valibot = await import("valibot");
/**
 * Los esquemas de `esquemas-puro.ts` son de CAMPO; `leerFormData` lee un formulario, así
 * que en las pruebas de campo se envuelven en el objeto mínimo. Es la misma forma que usa
 * una action: un objeto de campos.
 */
const solo = (esquema) => valibot.object({ valor: esquema });
const pasa = (esquema, formData) => leerFormData(solo(esquema), formData).ok;
/** El valor ya validado (o `null` si no pasó), para comprobar las transformaciones. */
const valor = (esquema, formData) => {
  const r = leerFormData(solo(esquema), formData);
  return r.ok ? r.datos.valor : null;
};
/** El mensaje con el que un campo RECHAZA, o `null` si no rechazó. */
const falla = (esquema, formData) => {
  const r = leerFormData(solo(esquema), formData);
  return r.ok ? null : r.error;
};

// ============================================================================
// A) LOGIN — la puerta de entrada, y el único sitio al que se llega sin sesión
// ============================================================================
console.log("\nA) esquemaLogin: la puerta del portal");
{
  const bien = leerFormData(esquemaLogin, fd({ identificador: "  BRENDA OLGUIN  ", clave: " 1234 " }));
  ok("acepta identificador y clave", bien.ok, JSON.stringify(bien));
  ok("recorta el identificador", bien.ok && bien.datos.identificador === "BRENDA OLGUIN", JSON.stringify(bien.datos));
  ok("NO recorta la clave (hoy tampoco)", bien.ok && bien.datos.clave === " 1234 ", JSON.stringify(bien.datos));

  for (const [nombre, entradas] of [
    ["sin identificador", { clave: "1234" }],
    ["sin clave", { identificador: "ANA" }],
    ["identificador vacío", { identificador: "", clave: "1234" }],
    ["clave vacía", { identificador: "ANA", clave: "" }],
    ["identificador solo espacios", { identificador: "   ", clave: "1234" }],
  ]) {
    const r = leerFormData(esquemaLogin, fd(entradas));
    ok(`rechaza ${nombre}`, !r.ok, JSON.stringify(r));
    ok("  … con el mensaje de siempre", !r.ok && r.error === MSJ.login, JSON.stringify(r));
  }

  const conArchivo = leerFormData(esquemaLogin, fd({ identificador: "ANA", clave: file("x.png", "image/png", 4) }));
  ok("rechaza una clave que llega como archivo", !conArchivo.ok, JSON.stringify(conArchivo));

  const larguisimo = leerFormData(esquemaLogin, fd({ identificador: "A".repeat(500), clave: "1234" }));
  ok("rechaza un identificador de 500 caracteres", !larguisimo.ok);
}

// ============================================================================
// B) ARCHIVO — la única regla de hoy: `instanceof File && size > 0`
// ============================================================================
console.log("\nB) archivo: lo que hoy se comprobaba, y ni una cosa más");
{
  const s = archivo(MSJ.archivo);
  ok("acepta un archivo con contenido", pasa(s, fd({ valor: file("a.xlsx", "application/vnd.ms-excel", 10) })));
  ok("rechaza un archivo vacío", !pasa(s, fd({ valor: file("a.xlsx", "application/vnd.ms-excel", 0) })));
  ok("rechaza un texto donde se espera archivo", !pasa(s, fd({ valor: "no soy un archivo" })));
  ok("rechaza el campo ausente", !pasa(s, fd({})));
  ok("rechaza null explícito", !pasa(s, fd({ valor: null })));
  // Y el mensaje, no solo el rechazo: un negativo que pasa «por otro motivo» no prueba nada.
  ok("  … con el mensaje del archivo", falla(s, fd({ valor: "no soy un archivo" })) === MSJ.archivo);

  const conTope = archivoConTope(MSJ.archivo, 100, "El archivo supera el límite de 20MB.");
  ok("acepta justo en el tope (100 de 100)", pasa(conTope, fd({ valor: file("a.xlsx", "application/x", 100) })));
  ok("rechaza uno por encima (101 de 100)", !pasa(conTope, fd({ valor: file("a.xlsx", "application/x", 101) })));
  ok("  … con el mensaje del tope, no el genérico",
    falla(conTope, fd({ valor: file("a.xlsx", "application/x", 101) })) === "El archivo supera el límite de 20MB.");
  ok("sin tope NO rechaza 101", pasa(s, fd({ valor: file("a.xlsx", "application/x", 101) })));
}

// ============================================================================
// B2) ARCHIVO PRESENTE — `materias.ts` no comprobaba el tamaño: no se le añade uno
// ============================================================================
console.log("\nB2) archivoPresente: solo «es un File»");
{
  const s = archivoPresente("Selecciona un archivo.");
  ok("acepta un archivo vacío (hoy pasa)", pasa(s, fd({ valor: file("a.csv", "text/csv", 0) })));
  ok("rechaza un texto", !pasa(s, fd({ valor: "no soy archivo" })));
  ok("rechaza la ausencia", !pasa(s, fd({})));
}

// ============================================================================
// C) IMAGEN — archivo no vacío + type que empieza por image/
// ============================================================================
console.log("\nC) imagen: lo de noticias y el avatar");
{
  const s = imagen(MSJ.imagen);
  ok("acepta image/png", pasa(s, fd({ valor: file("a.png", "image/png", 5) })));
  ok("acepta image/jpeg", pasa(s, fd({ valor: file("a.jpg", "image/jpeg", 5) })));
  ok("rechaza un PDF", !pasa(s, fd({ valor: file("a.pdf", "application/pdf", 5) })));
  ok("rechaza una imagen vacía", !pasa(s, fd({ valor: file("a.png", "image/png", 0) })));
  ok("rechaza el campo ausente", !pasa(s, fd({})));
  ok("  … con el mensaje del tipo, no el de ausencia",
    falla(s, fd({ valor: file("a.pdf", "application/pdf", 5) })) === "Solo se permiten imágenes.");
}

// ============================================================================
// D) TEXTO — obligatorio, opcional y mayúsculas
// ============================================================================
console.log("\nD) texto: obligatorio, opcional y en mayúsculas");
{
  const m = "Escribe un motivo.";
  ok("texto acepta una cadena", pasa(texto(m), fd({ valor: "hola" })));
  ok("texto rechaza vacío", !pasa(texto(m), fd({ valor: "" })));
  ok("texto rechaza un archivo", !pasa(texto(m), fd({ valor: file("a.txt", "text/plain", 3) })));

  const op = textoOpcional(m);
  ok("opcional: ausente → cadena vacía", valor(op, fd({})) === "");
  ok("opcional: presente → su valor", valor(op, fd({ valor: "x" })) === "x");
  ok("opcional: rechaza un archivo", !pasa(op, fd({ valor: file("a.txt", "text/plain", 3) })));

  ok("mayúsculas: ' ab ' → 'AB'", valor(textoMayusculas(m), fd({ valor: " ab " })) === "AB");
}

// ============================================================================
// E) EL HELPER — la forma de respuesta es la que ya tenían las actions
// ============================================================================
console.log("\nE) leerFormData: contrato de respuesta y mensajes");
{
  const r = leerFormData(esquemaLogin, fd({ identificador: "ANA", clave: "1234" }));
  ok("devuelve { ok: true, datos }", r.ok && typeof r.datos === "object");
  ok("no devuelve `error` cuando va bien", r.ok && !("error" in r));

  const mal = leerFormData(esquemaLogin, fd({}));
  ok("devuelve { ok: false, error }", !mal.ok && typeof mal.error === "string");
  ok("no devuelve `datos` cuando falla", !mal.ok && !("datos" in mal));

  // Un campo repetido llega como array: el esquema tiene que verlo, no quedarse con el
  // último en silencio (dos `identificador` en el mismo POST).
  const repetido = leerFormData(esquemaLogin, fd({ identificador: ["ANA", "LUIS"], clave: "1234" }));
  ok("dos identificadores → rechazado, no el último", !repetido.ok, JSON.stringify(repetido));

  // El mensaje NUNCA es el del validador.
  const sospechosos = [];
  for (const entradas of [{}, { identificador: "A" }, { identificador: "A".repeat(500), clave: "x" }]) {
    const x = leerFormData(esquemaLogin, fd(entradas));
    if (!x.ok) sospechosos.push(x.error);
  }
  ok(
    "ningún mensaje parece del validador",
    sospechosos.every((s) => !/Invalid|Expected|received|must be/i.test(s)),
    JSON.stringify(sospechosos),
  );
  ok("los mensajes son los declarados", sospechosos.every((s) => s === MSJ.login), JSON.stringify(sospechosos));
}

// ============================================================================
// F) LOS ESQUEMAS DE CADA ACTION — el mensaje que el usuario leía, intacto
// ============================================================================
console.log("\nF) un esquema por action: qué rechaza y con qué texto");
{
  const xlsx = () => file("a.xlsx", "application/vnd.ms-excel", 10);
  const png = () => file("a.png", "image/png", 10);

  const casos = [
    ["noticias · sin imagen", esquemaNoticia, fd({}), MSJ.imagen],
    ["noticias · un PDF no es imagen", esquemaNoticia, fd({ archivo: file("a.pdf", "application/pdf", 9) }), "Solo se permiten imágenes."],
    ["noticias · acepta una imagen", esquemaNoticia, fd({ archivo: png() }), null],
    ["materias · sin archivo", esquemaAliasArchivo, fd({}), "Selecciona un archivo."],
    ["documentos · sin archivo", esquemaSubirDocumento(20), fd({}), MSJ.archivo],
    ["documentos · 21 MB", esquemaSubirDocumento(20), fd({ archivo: file("a.pdf", "application/pdf", 21) }), "El archivo supera el límite de 20MB."],
    ["asistencias · sin archivo", esquemaArchivoAsistencias, fd({}), MSJ.archivo],
    ["calificaciones · sin materia", esquemaSubirCalificaciones, fd({ archivo: xlsx() }), "Faltan datos de sesión o materia."],
    ["calificaciones · sin archivo", esquemaSubirCalificaciones, fd({ materiaId: "m1" }), MSJ.archivo],
    ["escolar · subir materia sin archivo", esquemaArchivoMateria, fd({}), MSJ.archivo],
    ["escolar · foto sin imagen", esquemaFotoPerfil, fd({}), MSJ.imagen],
    ["escolar · roster sin archivo", esquemaRoster, fd({}), MSJ.archivo],
    ["escolar · roster con archivo y mapeo", esquemaRoster, fd({ archivo: xlsx(), mapeo: "{}" }), null],
    ["etiquetas · sin archivo", esquemaArchivoEtiquetas, fd({}), "Selecciona un archivo Excel válido."],
    ["horario · sin archivo", esquemaArchivoHorario, fd({}), "Selecciona un archivo Excel válido."],
    ["justificaciones · sin motivo", esquemaSolicitarJustificacion(5), fd({ curp: "X", fecha: "2026-01-01", archivo: file("a.pdf", "application/pdf", 3) }), "Indica CURP, fecha y motivo."],
    ["justificaciones · sin archivo", esquemaSolicitarJustificacion(5), fd({ curp: "X", fecha: "2026-01-01", motivo: "m" }), "Adjunta un archivo (PDF, PNG o JPG) obligatorio."],
    ["justificaciones · archivo de 6 MB", esquemaSolicitarJustificacion(5), fd({ curp: "X", fecha: "2026-01-01", motivo: "m", archivo: file("a.pdf", "application/pdf", 6) }), "El archivo supera el tamaño máximo (5 MB)."],
    ["justificaciones · la CURP sale en mayúsculas", esquemaSolicitarJustificacion(5), fd({ curp: " ab12 ", fecha: "2026-01-01", motivo: "m", archivo: file("a.pdf", "application/pdf", 3) }), null],
    ["carga-academica · sin archivo", esquemaCargaAcademica, fd({}), MSJ.archivo],
    ["carga-academica · sin contexto ni mapeo", esquemaCargaAcademica, fd({ archivo: xlsx() }), null],
  ];

  for (const [nombre, esquema, datos, esperado] of casos) {
    const r = leerFormData(esquema, datos);
    if (esperado === null) ok(`acepta ${nombre}`, r.ok, JSON.stringify(r));
    else ok(`${nombre} → «${esperado}»`, !r.ok && r.error === esperado, JSON.stringify(r));
  }

  const mayusculas = leerFormData(
    esquemaSolicitarJustificacion(5),
    fd({ curp: " ab12 ", fecha: "2026-01-01", motivo: "m", archivo: file("a.pdf", "application/pdf", 3) }),
  );
  ok("justificaciones · la CURP se recorta y se pone en mayúsculas", mayusculas.ok && mayusculas.datos.curp === "AB12", JSON.stringify(mayusculas));
}

// ============================================================================
// RESUMEN
// ============================================================================
console.log(`\n========================================`);
console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
console.log(`========================================`);
if (fallidas > 0) process.exit(1);


