# INFORME — PROMPT AA (vínculo exacto de la materia en el importador de horario)

Fecha: 2026-10-26. Base: `a15659c`. Prompt:
`docs/historial/prompts/PROMPT_AA_VINCULO_EXACTO_HORARIO.md` (con su retroalimentación al final).

## 1. Qué se hizo

Al importar el horario semanal, cada fila se vincula ahora a la materia del catálogo cuyo
nombre o clave coincide **exactamente**. El nombre sin romano final (que casa con las materias
genéricas, `INGLES`, `CIENCIAS NATURALES`…) se prueba solo si no hay exacta. Antes las dos se
juntaban y «Inglés I» quedaba ambiguo (`INGLES I` + `INGLES`) y sin vínculo.

| Archivo | Capa | Qué |
|---|---|---|
| `lib/escolar/horario/horario-importar-validacion-puro.ts` | dominio puro | + `MateriaIndexable`, `IndiceMaterias<M>`, `indiceMateriasDesdeFilas`, `resolverMateriaEnIndice` |
| `lib/escolar/horario/horario-importar-validacion.ts` | dominio I/O | `cargarIndiceMaterias` solo consulta y delega; se borran `IndiceMaterias` y `resolverMateriaCatalogo` privados |
| `scripts/test-horario-importar-validacion-puro.mjs` | suite | 20 → 29 checks |
| `scripts/diag-vinculo-materias-horario.mjs` | diagnóstico `LEE(red)` | nuevo; antes/después |
| `scripts/README.md` · `docs/sistema/modulos/HORARIO_SEMANAL_MODULO.md` | docs | fila del diag, suite y regla de `materia_id` |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

Claude, a pedido del usuario («Haz la implementación tú»), sin auditor independiente: implementó
y se auditó contra el CONTRATO §2. No hubo sesión de técnico: la re-importación real no se probó.

## 3. Cómo se ejecutó y se midió

`node scripts/diag-vinculo-materias-horario.mjs`, mismo script antes y después, sin escrituras:

| Medida | Antes | Después |
|---|---|---|
| materias activas | 46 | 46 |
| filas / nombres distintos de `horario_semanal` | 169 / 36 | 169 / 36 |
| ambiguos con equivalencia plana (propiedad de los datos) | 12 nombres · 69 filas | 12 · 69 |
| sin vínculo con la regla del importador | 12 · 69 (la función no existía; regla vieja = plana) | **0 · 0** |
| filas con `materia_id` nulo hoy | 0 | 0 |

`npm run test:ci`: `tsc` y `lint` (2 avisos ajenos) en verde; `test:suites` **62/63**: falla
`test-auditoria-ciclo-f1.mjs` (15/1), **también sin este cambio** (`git stash` → mismo 15/1): su
lista `LECTORES_CICLO_GLOBAL` sigue citando `app/oceano/page.tsx`, retirado por `0171d9e` (el
portal pasó a `/perfil`). Como la cadena `&&` se corta ahí, el resto se corrió a mano: permisos,
`gen-matriz --check`, `gen-invariantes --check`, `gen-rumbo --check`, `verificar:estado`,
`verificar:docs` y `build`, todo en verde.

## 4. Normas (CONTRATO §2)

- Alcance: solo los archivos del prompt. Asistencia, `horario-semanal*.ts`, aplicar y catálogo intactos.
- Capas: la regla vive en el módulo puro con suite; el archivo con I/O solo consulta.
- Datos: ninguna escritura, ningún SQL. El `upsert` del aplicar no cambia.
- Identidad: no toca ciclo, profesor ni calificaciones.
- Medición antes/después con el mismo diag.

## 5. Veredicto frente a la filosofía y la arquitectura

Corrige la causa y no el síntoma: la ambigüedad nacía de la regla, no de los datos (que siguen
teniendo 12 nombres ambiguos para la equivalencia plana). La genérica se conserva como respaldo
porque 2°, 4°, 6° y los grupos B de 3°/5° MC aún dependen de ella. Autoevaluación, sin auditor.

## 6. Desviaciones y decisiones propias

1. El diag no lleva una copia de la regla vieja (el prompt la permitía): mide la ambigüedad plana
   como propiedad de los datos y usa la función pura REAL cuando existe. Así no queda una segunda
   implementación de la regla (R6).
2. Tipos genéricos sobre `MateriaIndexable` en lugar de importar `MateriaRow`: el módulo puro no
   depende de `catalogo/` por un tipo.
3. 9 casos en vez de 7: se añadieron «módulo completo por nombre» y «sin coincidencia».

## 7. Lo no verificado

- Re-importar `horario_semanal_corregido_bloques_v2.xlsx` con sesión y ver 0 «sin vínculo» en la
  vista previa. El Excel original tiene «Módulo II. Submódulo I» abreviado: ese bloque quedaría
  sin vínculo con cualquier regla.
- El arreglo de `test-auditoria-ciclo-f1.mjs` (ajeno, previo) no se hizo.
- Sin push ni despliegue: hasta entonces producción usa la regla vieja, y re-importar el horario
  borraría el vínculo de 69 bloques.
