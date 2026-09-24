# PROMPT CLINE — J · El esquema deja de ser una creencia: tipos generados desde la base

## OBJETIVO — qué debe ser cierto al terminar

`lib/supabase/database.types.ts` existe, **generado desde el esquema real**, y un
`--check` en el CI falla cuando el archivo del repo y la base dejan de coincidir.

**Por qué es el cambio de mayor alcance que le queda al repo.** Hoy
`grep -rn "Database\[" lib` devuelve **cero**: cada columna está tipada a mano
contra un esquema que vive en otro sitio y que nadie compara con el código. Las
tres deudas estructurales vivas son, las tres, de esa forma:

- `calendario_escolar` con `periodo_id` (uuid) conviviendo con `ciclo_escolar`
  (texto) — la causa raíz de los fallos históricos de calendario y asistencia
- identidad de profesor repartida entre `profesor_id` y `profesor_clave`
- una tabla física por materia, con columnas creadas por RPC

Ninguna de las tres la ve `tsc` hoy. Con tipos generados, **confundir un uuid con
un texto pasa a ser un error de compilación** en vez de una fila mal escrita en
producción, que es donde se descubren ahora.

## ANTES DE NADA — genera tu propio contexto

```bash
node scripts/gen-contexto.mjs --tarea=crear lib/supabase/ scripts/
```

Y lee `docs/normativo/GLOSARIO.md` entero: este prompt va sobre los términos que
ese archivo existe para separar.

## MEDICIÓN INICIAL (pegada — no re-investigar)

```
$ grep -rln "Database\[" lib        →  (vacío)
$ ls supabase/*.sql | wc -l         →  47
```

47 archivos de esquema, y **desde disco no se puede saber cuáles están
aplicados**: es un punto ciego declarado del panel, porque comprobarlo requiere
red y credenciales.

El proyecto es `nnhjqqjonabchluuwmkp` y `.env.local` ya tiene
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL`.

Precedente que hay que copiar, no reinventar: `scripts/gen-matriz-permisos.mjs`
con `--check`. Es el guardián que mejor ha funcionado del repo —por él la §4 de
la matriz **no** se desincronizó nunca— y su contrato es exactamente el que hace
falta aquí.

---

## SECUENCIA — tres partes, con parada entre cada una

### Parte 1 · Generar, sin tocar nada más

```bash
npx supabase gen types typescript --project-id nnhjqqjonabchluuwmkp > lib/supabase/database.types.ts
```

(Si el `--project-id` pide autenticación, `--db-url "$DATABASE_URL"` sirve igual y
no necesita sesión de la CLI.)

Envuélvelo en `scripts/gen-tipos-db.mjs`, con la cabecera de siempre y su fila en
`scripts/README.md`. **Léelo bien: este script SÍ toca la red**, así que su
etiqueta en el README no es `LEE(fs)` — es `LEE(red)`, y va en la sección que
corresponda, no entre las suites puras.

Dos modos, como `gen-matriz`:

- sin argumentos: escribe el archivo
- `--check`: no escribe y sale con 1 si lo generado difiere de lo que hay en disco

**No importes el tipo en ningún sitio todavía.** Esta parte solo produce el
archivo y demuestra que se puede regenerar.

**PARA AQUÍ.** Reporta: cuántas tablas salieron, cuántas líneas tiene el archivo,
y **si alguna tabla del código no aparece** en el esquema real o al revés. Esa
lista es, por sí sola, el hallazgo más valioso de este prompt.

### Parte 2 · Enchufar el cliente, y nada más

`lib/supabase/` son 3 archivos y 64 líneas: ahí es donde se crea el cliente.
Pásale el genérico:

```ts
createClient<Database>(url, key)
```

Y **para**. No persigas los errores de tipo que aparezcan: `npx tsc --noEmit` va a
encender media aplicación, y eso es información, no una tarea.

**PARA AQUÍ, y esto es lo importante del prompt.** Reporta la lista completa de
errores de tipo agrupada por archivo y por causa. Cada uno es un sitio donde el
código creía una cosa y la base dice otra. **No arregles ninguno todavía.**

### Parte 3 · Decidir qué hacer con lo que salga

Con la lista delante, y **solo con ella**, clasifica cada error en una de tres:

1. **El código está mal** → arréglalo, es un bug real que nadie veía.
2. **El tipo generado es correcto pero el código usa un camino legacy declarado**
   (R8: `ciclo_escolar` texto, `profesor_clave`) → **no se arregla**. Se marca con
   un `@deprecated` y su alternativa, y se anota. Retirar legacy no es este
   prompt.
3. **Son las tablas por materia**, cuyos nombres y columnas se crean por RPC y no
   pueden estar en un tipo estático → aíslalas tras el tipo laxo que ya exista, y
   dilo. Esa deuda no la cierra un generador.

Si la clasificación te lleva a tocar más de **diez archivos**, para y entrega la
lista: entonces el arreglo es su propio prompt y este termina en la Parte 2 con el
tipo generado y el `--check` puestos.

---

## REGLAS

- **El tipo generado manda sobre el código, nunca al revés.** Si el archivo
  generado dice algo incómodo, el que está mal es el código o el esquema. Editar
  `database.types.ts` a mano lo convierte en la segunda fuente que R6 prohíbe:
  ponle en la cabecera que es generado y que no se edita.
- **Ninguna migración.** Este prompt no cambia el esquema: lo lee. Si descubres
  que falta una FK o sobra una columna, va al informe y a `pendientes.json`, no a
  un `.sql` nuevo.
- Nombra los términos como los nombra el `GLOSARIO`: `periodos.id`, no «el
  ciclo»; `idInterno`, no «el nombre de la materia».
- **No hay staging.** Todo lo que corras contra la base es producción. Este prompt
  solo lee, y tiene que seguir siendo verdad al terminar.

## LÍMITES — qué NO se toca

- `supabase/*.sql` — ninguno se edita, ninguno se borra
- `lib/auth/**` — no se delega sin revisión
- El legacy de R8: `ciclo_escolar` texto y `profesor_clave` se quedan
- `docs/historial/**`

## VALIDACIÓN

```bash
node scripts/gen-tipos-db.mjs --check
npx tsc --noEmit
node scripts/test-orden.mjs
node scripts/verificar-docs.mjs
npm run test:ci
npm run lint
npm run build
```

Sobre el CI: añade el paso de `--check` **solo si el workflow puede llegar a la
base**. Necesita un secreto (`DATABASE_URL` o el token de la CLI) y hoy el
workflow es deliberadamente de solo lectura del disco: «NADA que toque Supabase
entra aquí». **Si no hay secreto configurado, no lo metas** — deja el `--check`
como comando de mano, dilo en el informe y anótalo en `pendientes.json` como lo
que es: una decisión de una persona.

## INFORME FINAL

`docs/historial/informes/INFORME-PROMPT-J-TIPOS-DESDE-LA-BASE.md`:

### El esquema real
Tablas, columnas y cuántas líneas. Y la lista de discrepancias con lo que el
código creía: tablas que no existen, columnas que faltan, tipos que no coinciden.

### Los errores de `tsc`, clasificados
La tabla de las tres categorías, con el archivo y la línea de cada uno.

### Las tres deudas
Qué dice el esquema real sobre `calendario_escolar.ciclo_escolar`,
`profesor_clave` y las tablas por materia. Es la primera vez que el repo va a
tener eso medido y no contado.

### Validación
Los comandos, y si el `--check` entró o no en el CI y por qué.

---

```
CONTRATO (obligatorio):
1. Antes de tocar nada: correr el diagnóstico de solo lectura que aplique
   (scripts/README.md, columna LEE) y pegar la medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action
   solo valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración
   de datos sin autorización explícita en este mismo prompt.
4. No crear un camino paralelo a una fuente única existente
   (periodos para ciclo, inscripciones_alumno para alumno→grupo).
5. Validar: npx tsc --noEmit + la suite pura del módulo + next build.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```
