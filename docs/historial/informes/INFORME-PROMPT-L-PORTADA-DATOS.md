# INFORME — PROMPT L · Portada administrable (1/4): datos, reglas y firma

**Fecha:** 2026-09-23 · **Rama:** `feature/portada-administrable` · **Ejecutado por:** Claude
(no Cline, por decisión del usuario) · **Commit:** `ba6c627`

## El SQL — escrito, aplicado y probado

`supabase/crear-portada-medios.sql`. Lo aplicó Claude con autorización expresa del usuario,
conectando a la base por `DATABASE_URL` (conexión directa, IPv6) con un cliente `pg` instalado
en el scratchpad, **no** en el proyecto. **Aplicado dos veces sin error**: es idempotente.

Medición previa (solo lectura): `carreras.id` es `uuid`; **`PROFESORES.ID` es `smallint`**, no
`integer`; no existía ninguna tabla `portada_*`; Postgres 17.6. Las columnas de profesor van en
`bigint`, como `mensajes_internos` (precedente del repo).

| Regla | Cómo la garantiza la base |
|---|---|
| Máximo 5 imágenes | `orden between 1 and 5` + `unique (orden)` |
| Un video por carrera | `unique (carrera_id)` |
| Forma según el tipo | `check` (imagen ⇒ orden, sin carrera; video ⇒ carrera, sin orden ni variante) |
| Variante móvil completa o ausente | `check ((public_id_movil is null) = (version_movil is null))` |
| Reordenar intercambiando | `unique (orden) DEFERRABLE` + RPC con `set constraints … deferred` |

**Por qué `DEFERRABLE` y no un índice único parcial:** un índice único normal se comprueba fila a
fila y falla a mitad de un intercambio. Los videos tienen `orden` nulo, y los nulos no chocan, así
que una restricción corriente basta.

**Probado con 11 casos**, en una transacción deshecha al final (0 filas quedan): la base rechaza la
6.ª imagen, el orden repetido, un video con orden, la variante móvil a medias, el segundo video de
una carrera, reordenar con lista incompleta o con id repetido y una clave de ajuste inventada; y
**reordenar invirtiendo las 5 funciona y deja el orden invertido de verdad**. PostgREST expone las
dos tablas (200) y la RPC.

## `lib/escolar/portada/portada-puro.ts`

Cero I/O, imports con extensión (C5, C13). Constantes con su origen medido: 7:3 (el hero del diseño
mide 2880 × 1231 = 2,34:1), 4:5 para teléfono, 16:9 para video, ±3 %, topes del plan gratuito de
Cloudinary, 120 s. Rótulos públicos por clave (`MECATRONICA → MECATRÓNICA`, `RH → RECURSOS HUMANOS`)
sin tocar `carreras`.

**Un error del propio prompt, corregido:** citaba 2,26 y 2,41 como proporciones válidas. El 3 % sobre
7:3 da [2,263 – 2,403]: las dos caen fuera. Los bordes correctos, y los que prueba la suite, son
2,27/2,40 (pasan) y 2,25/2,42 (no).

**Un error mío, corregido antes de commitear:** `rotuloCarrera` usaba `??` tras un `.trim()`, que
siempre devuelve cadena, así que un nombre vacío nunca caía a la clave. Ahora `||`, con prueba.

## `scripts/test-portada.mjs`

**94 verificaciones** al cierre de M (72 al cierre de L). **Se comprobó que detecta fallos**: con la
tolerancia al 5 %, los dos casos de borde caen y la suite sale con 1.

## Firma, URLs y validación

- `lib/cloudinary/firma.ts`: `firmarSubida` (el secreto no sale), `leerRecurso`, `borrarRecurso` con
  `invalidate: true`.
- `lib/cloudinary/urls.ts`: `version` y `tipo` opcionales. **Comprobado** que las URLs de foto de
  perfil y avatar salen idénticas a las de antes.
- `leerEntrada`, hermana de `leerFormData` en el mismo archivo, con el recorrido común extraído a
  `validarPlano`. `test-validacion` sigue en 70/70.

## Validación

`test-portada` · `test-validacion` 70/70 · `test-orden` 14 reglas (C10 34/34 con la fila nueva) ·
`verificar-estado-actual` (41 suites) · `tsc` · `lint`.
