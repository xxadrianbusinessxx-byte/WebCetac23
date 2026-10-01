"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIPOS_CALIFICACION = void 0;
exports.valorNota = valorNota;
exports.notaEnRango = notaEnRango;
exports.curpCanonica = curpCanonica;
exports.tipoDeColumna = tipoDeColumna;
exports.columnasConvertibles = columnasConvertibles;
exports.convertirTabla = convertirTabla;
exports.notasDeAlumno = notasDeAlumno;
exports.promedioActividades = promedioActividades;
/** El tipo de nota. Es el mismo `check` que la tabla impone. */
exports.TIPOS_CALIFICACION = ["actividad", "parcial", "promedio", "final"];
/* ── Normalización de valores ───────────────────────────────────────────── */
/**
 * Una nota del Excel a número.
 *
 * Devuelve `null` —no 0— cuando la celda está vacía o no es un número. La
 * diferencia importa: `0` es «sacó cero» y `null` es «no hay nota», y
 * confundirlas convierte una actividad no entregada en un cero que baja el
 * promedio.
 *
 * Acepta coma decimal porque los Excel en español la producen.
 */
function valorNota(celda) {
    if (typeof celda === "number")
        return Number.isFinite(celda) ? celda : null;
    if (typeof celda !== "string")
        return null;
    const t = celda.trim().replace(",", ".");
    if (t === "")
        return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}
/** ¿Está dentro de lo que una calificación puede valer? Avisa, no rechaza:
 *  una escala distinta es decisión del plantel, no un error de formato. */
function notaEnRango(n) {
    return n === null || (n >= 0 && n <= 100);
}
/** CURP a su forma canónica. Sin validar el formato: eso lo hace el alcance de
 *  la action contra `ALUMNOS`, que es quien sabe si existe. */
function curpCanonica(celda) {
    if (typeof celda !== "string")
        return null;
    const t = celda.trim().toUpperCase();
    return t.length > 0 ? t : null;
}
/* ── El reparto de columnas, según el mapeo ─────────────────────────────── */
/**
 * Qué tipo de nota es cada columna, según el mapeo que el profesor configuró.
 *
 * Las columnas ocultas se excluyen: el mapeo las declara como «no las ve el
 * alumno», y normalizar algo que nadie debe ver sería meterlo en una tabla que
 * el alumno sí consulta.
 */
function tipoDeColumna(encabezado, mapeo) {
    if (mapeo.columnasOcultas.includes(encabezado))
        return null;
    if (mapeo.columnasActividades.includes(encabezado))
        return "actividad";
    if (mapeo.columnasParciales.includes(encabezado))
        return "parcial";
    if (mapeo.columnaPromedio === encabezado)
        return "promedio";
    if (mapeo.columnaFinal === encabezado)
        return "final";
    return null;
}
/** Las columnas que van a producir filas, con su tipo. En orden de aparición,
 *  para que el resultado sea estable entre ejecuciones. */
function columnasConvertibles(encabezados, mapeo) {
    const out = [];
    encabezados.forEach((e, indice) => {
        const tipo = tipoDeColumna(e, mapeo);
        if (tipo)
            out.push({ indice, encabezado: e, tipo });
    });
    return out;
}
/* ── La conversión ──────────────────────────────────────────────────────── */
/**
 * Convierte la tabla del profesor en filas de `calificaciones`.
 *
 * Falla —y no convierte nada— en dos casos, los dos a propósito:
 *   · el mapeo no declara columna de CURP: sin identidad del alumno no hay
 *     nada que guardar;
 *   · esa columna no está entre los encabezados: el mapeo es de otro archivo.
 *
 * Fallar entero en vez de convertir «lo que se pueda» es deliberado: media
 * subida es peor que ninguna, porque deja al profesor creyendo que guardó.
 *
 * Las filas sin CURP legible se SALTAN con aviso, no tumban la subida: en un
 * Excel real hay filas de totales y renglones en blanco.
 */
function convertirTabla(tabla, mapeo) {
    if (!mapeo.columnaCurp) {
        return {
            ok: false,
            error: "El mapeo de columnas no declara cuál es la CURP. Configúrala antes de subir: sin ella las notas no se pueden atribuir a ningún alumno.",
        };
    }
    const iCurp = tabla.encabezados.indexOf(mapeo.columnaCurp);
    if (iCurp < 0) {
        return {
            ok: false,
            error: `El archivo no tiene la columna de CURP que el mapeo declara («${mapeo.columnaCurp}»). Puede que el mapeo sea de otro archivo.`,
        };
    }
    const columnas = columnasConvertibles(tabla.encabezados, mapeo);
    if (columnas.length === 0) {
        return {
            ok: false,
            error: "Ninguna columna del archivo está clasificada como actividad, parcial, promedio o final. Revisa el mapeo.",
        };
    }
    const filas = [];
    const avisos = [];
    const vistas = new Set();
    tabla.filas.forEach((fila, n) => {
        const curp = curpCanonica(fila[iCurp]);
        if (!curp) {
            avisos.push(`Fila ${n + 1}: sin CURP legible, se omite.`);
            return;
        }
        if (vistas.has(curp)) {
            // Una CURP repetida en el mismo archivo es un error del archivo, no algo
            // que resolver callando: la segunda fila pisaría a la primera en el
            // upsert y nadie sabría cuál quedó.
            avisos.push(`Fila ${n + 1}: la CURP ${curp} ya apareció antes; se omite la repetida.`);
            return;
        }
        vistas.add(curp);
        for (const { indice, encabezado, tipo } of columnas) {
            const valor = valorNota(fila[indice]);
            // Las celdas vacías NO generan fila: guardar `null` para cada actividad
            // sin entregar llenaría la tabla de nada.
            if (valor === null)
                continue;
            if (!notaEnRango(valor)) {
                avisos.push(`Fila ${n + 1}, «${encabezado}»: ${valor} está fuera de 0-100.`);
            }
            filas.push({ curp, tipo, claveColumna: encabezado, valor });
        }
    });
    if (filas.length === 0) {
        return { ok: false, error: "No se pudo leer ninguna calificación del archivo." };
    }
    return { ok: true, filas, avisos };
}
/**
 * Las notas de UN alumno, agrupadas para presentar.
 *
 * Filtra por CURP aquí también, aunque la consulta ya lo haga: es la última
 * puerta antes de pintar, y la que impide que un fallo de alcance acabe
 * enseñando la nota de otro. Cuesta una comparación.
 */
function notasDeAlumno(todas, curp) {
    const mias = todas.filter((c) => c.curp === curp);
    const de = (t) => mias.filter((c) => c.tipo === t);
    const uno = (t) => de(t)[0]?.valor ?? null;
    return {
        actividades: de("actividad"),
        parciales: de("parcial"),
        promedio: uno("promedio"),
        final: uno("final"),
    };
}
/**
 * Promedio de las actividades, con los pesos del mapeo si los hay.
 *
 * Sin pesos: media simple. Con pesos: solo cuentan las actividades que tienen
 * peso declarado, y se normaliza por la suma de esos pesos — así un reparto a
 * medio configurar (tres actividades de 20 % cada una) da un promedio sobre lo
 * declarado en vez de castigar al alumno por lo que el profesor no ha puesto.
 */
function promedioActividades(actividades, pesos) {
    const conValor = actividades.filter((a) => a.valor !== null);
    if (conValor.length === 0)
        return null;
    if (!pesos) {
        const suma = conValor.reduce((s, a) => s + (a.valor ?? 0), 0);
        return Math.round((suma / conValor.length) * 100) / 100;
    }
    let acumulado = 0;
    let pesoTotal = 0;
    for (const a of conValor) {
        const p = a.clave_columna ? pesos[a.clave_columna] : undefined;
        if (typeof p !== "number" || p <= 0)
            continue;
        acumulado += (a.valor ?? 0) * p;
        pesoTotal += p;
    }
    if (pesoTotal === 0)
        return null;
    return Math.round((acumulado / pesoTotal) * 100) / 100;
}
