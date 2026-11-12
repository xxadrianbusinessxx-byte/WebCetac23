# INFORME — PROMPT AC: perfiles de visualización

**Fecha:** 2026-11-12 · **Base:** `1164a80` · **Pedido por el usuario en chat** («hay que hacer
perfiles de visualización como el de profesor y el de admin para alumno, tutor, administración,
directivo»), con dos decisiones suyas tomadas por pregunta directa (§6).

---

## 1. Qué se hizo

1. **Esquema:** `ALUMNOS.es_prueba boolean default false` + índice parcial `alumnos_es_prueba`
   (`supabase/agregar-alumno-de-prueba.sql`, PASO 1). Aplicado con el conector (`apply_migration`).
2. **Cuenta DIRECTIVO:** PROFESORES **ID 24**, Permisos `Directivo`, clave aleatoria que nadie
   conoce, `debe_cambiar_credenciales = true` (`supabase/crear-cuenta-directivo-de-prueba.sql`).
3. **Código:** el alumno marcado sale de las cinco lecturas de lista del personal.

| Archivo | Qué cambió |
|---|---|
| `lib/escolar/alumno/alumnos-prueba-puro.ts` | **nuevo** — `quitarAlumnosDePrueba`, `quitarCurpsDePrueba`, `conjuntoDeCurpsPrueba` |
| `lib/escolar/alumno/alumnos-prueba.ts` | **nuevo** — `leerCurpsDePrueba`: la única consulta a `es_prueba`; nunca lanza |
| `lib/escolar/alumno/roster-ciclo.ts` | `leerRosterDelCiclo` filtra (Servicio Escolar, plantilla del roster, etiquetas y situación médica) |
| `lib/escolar/alumno/datos-incompletos.ts` | filtra ANTES de contar (no infla el «de N revisados») |
| `lib/escolar/asistencia/asistencia-configuracion.ts` | `obtenerCurpsInscritasGrupo` filtra; 3.er parámetro opcional con el conjunto (plantilla de asistencia, plantilla de materia, boleta por grupo) |
| `lib/escolar/materia/calificaciones.ts` | `curpsDelGrupoMateria` filtra (padrón que valida la subida) |
| `scripts/test-alumnos-prueba.mjs` | **nueva** suite, 16 checks |
| `scripts/diag-alumnos-prueba.mjs` | **nuevo** diagnóstico `LEE(red)` + su fila en `scripts/README.md` |
| `ESTADO-ACTUAL.md` · `docs/sistema/pendientes.json` · `RUMBO.md` | 24 cuentas, 64 suites, pendiente `perfiles-de-visualizacion` |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Un solo agente: Claude.** El usuario pidió que se ejecutaran el prompt y el SQL con el conector
en vez de mandarlo a Cline.

| Pudo | No pudo / no hizo |
|---|---|
| Aplicar el DDL con `apply_migration` (`execute_sql` lo bloqueaba antes; esta vía pasó) | Dar de alta al alumno de prueba: exige sesión de técnico y una CURP que no debe pasar por el chat |
| Crear la cuenta DIRECTIVO con `execute_sql` | Ponerle clave a DIRECTIVO: es de un directivo, desde la app |
| Medir antes/después con REST de solo lectura | Probar con sesiones reales ni ver el filtro con un alumno marcado de verdad |

## 3. Cómo se ejecutó y se midió

`node scripts/diag-alumnos-prueba.mjs`:

| | columna | marcados | padrón | sin prueba | DIRECTIVO |
|---|---|---|---|---|---|
| antes | no aplicada | 0 | 357 | 357 | no existe |
| después | aplicada | 0 | 357 | 357 | ID 24 · Directivo · debe_cambiar=true |

Red de seguridad, mismo resultado antes y después: `test-auditoria-ciclo-f1` 17/17 ·
`test-calificaciones-io` 114/114 · `test-datos-incompletos` 42/42 · `test-plantilla-roster` 29/29.
`npm run test:ci` en verde (tsc, lint, 64 suites, permisos, matriz, invariantes, rumbo, estado, docs, build).

Incidente: el primer INSERT falló con `23505` en `PROFESORES_pkey` (ID 23): la identidad de `ID`
iba atrasada porque la 23 se insertó con ID explícito. El intento fallido consumió el 23 de la
secuencia y el reintento recibió el 24. No se tocó la secuencia; ver §7.

## 4. Qué normas respetó (CONTRATO §2)

- Alcance: los archivos de la tabla; no se tocaron `app/actions/`, `lib/auth/`, buscadores, login,
  tutores, inscripciones-borrador ni ciclo-estado.
- Capas: la decisión en `-puro.ts`; la lectura en `lib/`; ninguna action cambió.
- Datos: columna nueva **nullable** (el prompt la había escrito `not null`; se corrigió al leer el
  §2); sin DROP; `.sql` versionado; inserción idempotente.
- Identidad: alumno por CURP; alumno→grupo sigue por `inscripciones_alumno`; ciclo por `periodos.id`.
- R6: una sola lectura de `es_prueba`; ningún lector escribe su propio filtro.

## 5. Veredicto frente a la filosofía y la arquitectura

Aditivo y reversible: sin marcados, el sistema se comporta byte a byte igual (lo prueba la suite
y la medición). El criterio de fallo es el seguro: si la lectura falla, el alumno de prueba se ve;
nunca desaparece uno real. Coste: una consulta mínima por índice parcial en cada lectura de lista.

## 6. Desviaciones y decisiones propias

Del usuario: (a) cuenta DIRECTIVO nueva aparte de ADMIN (13); Administración reusa la 22;
(b) alumno ficticio en un grupo REAL, marcado y fuera de las listas.

Propias, frente al prompt:
1. `alumnos-prueba.ts` **sin** `import "server-only"`: `test-calificaciones-io` importa
   `calificaciones.ts` en Node y el paquete lanzaría.
2. `asistencia-plantillas.ts` **no** se tocó: no recorre grupos. La iteración real está en
   `app/actions/asistencias.ts` (`Promise.all` por grupo), y cada vuelta ya recarga el catálogo
   entero; +1 consulta por índice es marginal y evita tocar una action. El parámetro opcional
   queda disponible.
3. Columna nullable, no `not null` (CONTRATO §2, Datos).
4. Se filtró también, de rebote, la plantilla de materia (`materias.ts` usa `obtenerAlumnosDelGrupo`):
   es otra lista del profesor y es lo que se quería.

## 7. Lo no verificado

- El filtro con un alumno **realmente marcado**: falta el alta y el PASO 3.
- Las sesiones de alumno, tutor, Administración (22) y DIRECTIVO (24).
- La identidad de `PROFESORES.ID` sigue atrasada respecto a filas insertadas con ID explícito; el
  próximo INSERT puede volver a chocar una vez. No se corrigió (`setval`) por no estar pedido.
- Visto de paso, no tocado: `diag-credenciales-duplicadas` muestra que TECNICO, ADMINISTRACION
  ESCOLAR y SERVICIO ESCOLAR comparten la misma CLAVE.
