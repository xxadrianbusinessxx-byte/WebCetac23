# PROMPT V — Documentación para agentes: herramientas que fallan en voz alta, scripts sin secretos, una sola verdad en el arranque y recuperación comprobada

> Diagnóstico de Claude del 2026-10-04 sobre `b184b01`, en solo lectura y contrastado por
> críticos independientes. **Todo lo que dice «ESTADO ACTUAL» está verificado: no lo
> re-investigues.**
>
> **Se envía una parte por mensaje**: esta cabecera, la parte y el CONTRATO del final.
> Orden: **A → B** (ya), **C** (cuando estén las DECISIONES), **D y E** (después de C). Cada
> parte va en su commit, con `npm run test:ci` en verde antes.
>
> - Las líneas citadas son las de `b184b01`. **Localiza por el texto entrecomillado**; si
>   editas varias en un archivo, hazlo de abajo arriba.
> - Cambios **AJENOS** en el árbol de trabajo: `app/actions/escolar.ts`, `app/globals.css`,
>   `app/perfil/page.tsx`, `lib/cloudinary/upload.ts`, `lib/escolar/types.ts`,
>   `package.json` y `public/decoraciones-imagenes/.gitkeep`. No los toques ni los
>   incluyas: haz `git add` solo con tus archivos, nunca `-A`.
> - **No ejecutes nada de `scripts/_peligrosos/` ni `scripts/fase10-*`, tampoco para
>   validar.** No ejecutes los scripts de credenciales de la Parte B: basta con leerlos.
> - **Presupuesto del arranque**: son los 8 archivos que mide `verificar-docs`. Tras A1 la
>   base es la cifra sin CR (~10 344 tokens, la misma que da el CI). En cada parte, anota
>   el delta contra esa base. **No toques `TECHO_TOKENS`.** Si algo no cabe, detente.

## DECISIONES (numeración de la RETRO §7)

**Tomadas el 2026-10-04**: el usuario pidió ejecutar las recomendaciones.

| # | Decisión |
|---|---|
| 1 | Se mantiene `TECHO_TOKENS = 10500`, se poda REGLAS_NO_HACER (C1) y se mide sin CR (A1) |
| 2 | Estructura canónica: la de ORDEN §6 con el texto recomendado en C8. Su punto INFORME enumera las secciones del informe (abajo) |
| 3 | Varias partes independientes por prompt, con commit y `test:ci` por parte |
| 4 | El informe lo entrega quien implementa y lo archiva Claude en `docs/historial/informes/` |
| 6 | Se quita la fila `_borrador/` de `ORDEN.md:45`: lo que no está cableado no se versiona |
| 10 | Nivel 3 de autoridad: REGLAS + el resto de `docs/normativo/` + `criterios.prompts`. En la forma de trabajo mandan ORDEN y CONTRATO; en los principios, filosofia |

Secciones del informe por parte (lo pidió el usuario, y C8 lo deja en ORDEN §6):
1. qué se hizo;
2. quién lo ejecutó y qué pudo y no pudo hacer;
3. cómo se ejecutó y se midió (antes → después);
4. qué normas respetó (CONTRATO §2);
5. veredicto frente a la filosofía y la arquitectura;
6. desviaciones y decisiones propias;
7. lo no verificado.

---

## PARTE A — Las herramientas de contexto fallan en voz alta

### OBJETIVO
`gen-contexto.mjs`, `verificar-docs.mjs` y `diag-peso-cambio.mjs` miden lo mismo en local
y en el CI. Cuando les falta algo, **salen con un código distinto de 0**, en vez de
entregar un resultado incompleto que parece completo.

### MEDICIÓN (antes; pega la salida)
Los comandos de VALIDACIÓN, antes de tocar nada.

### ESTADO ACTUAL (verificado — no re-investigar)
- `verificar-docs.mjs:34`: `pesa()` usa `fs.statSync(...).size`, así que cuenta los CR. Con
  `core.autocrlf=true` da 10 485 tokens en local y 10 345 en el CI.
- `gen-contexto.mjs:195`: la regex `/```\n(CONTRATO …/` no admite `\r\n`. Con CRLF, `:196`
  devuelve «(no se pudo leer CONTRATO-DE-CAMBIO.md §1)» y sale con exit 0.
- `gen-contexto.mjs:280-282` compara `--tarea` por subcadena y no la valida.
  `--tarea=inexistente`, `modificar`, `migracion`, `legacy` y `decision` dan la misma
  salida que sin `--tarea`. `ui` casa con «arquitectura» y «cualquier». «sintoma» (sin
  tilde) no casa.
- `gen-contexto.mjs:288`: `hay()` no normaliza `\`. Con rutas de Windows se pierden las
  sugerencias ancladas (permisos, apariencia y scripts).
- `gen-contexto.mjs:91-104`: si cambia el encabezado del presupuesto, salen 0 filas y el
  paquete dice «No cargues documentación fuera de esta lista» con la lista vacía.
  `reglasOrden()` (`:218`) devuelve `[]` ante cualquier fallo, y el brief afirma «Ninguna
  regla… arrastra deuda viva».
- `gen-contexto.mjs:489`: `--salida` escribe en cualquier ruta sin comprobar nada.
- `diag-peso-cambio.mjs`: con `lib/auth/permisos.ts` imprime «→ **Claude**» y luego
  `ReferenceError: irreversible is not defined` (`:305`), con exit 1. La causa es que
  `:262` y `:235` no desestructuran `irreversible`.

### RESULTADO ESPERADO
- **A1. `verificar-docs`** mide los bytes sin `\r`. **No edites** el párrafo fechado del
  comentario de `TECHO_TOKENS`: añade debajo una línea fechada con la medida sin CR y el
  margen real.
- **A2. `gen-contexto`**:
  - `leer()` normaliza CRLF → LF.
  - Sale con exit 1, y un mensaje claro, si falta el CONTRATO (rama cline), si el
    presupuesto tiene 0 filas o si una `--tarea` no casa con ninguna fila (en ese caso
    lista las válidas, como `--tareas`).
  - Compara `--tarea` por **palabra completa** y sin tildes (NFD).
  - Normaliza `\` → `/` en las rutas al principio, una sola vez.
  - En la rama claude, si `test-orden --json` falla, escribe «no se pudo leer test-orden».
- **A3.** `--salida` solo acepta rutas bajo `docs/historial/prompts/`, y no sobrescribe un
  archivo existente sin `--forzar`.
- **A4. `diag-peso-cambio`** desestructura `irreversible` donde se usa.

### REGLAS
No cambies el contenido del paquete fuera de esto: eso es la Parte E. No añadas
dependencias.

### VALIDACIÓN
```bash
npm run verificar:docs                                                  # ≈ la cifra del CI
node scripts/gen-contexto.mjs --tarea=inexistente lib/auth/types.ts; echo $?   # ≠ 0
node scripts/gen-contexto.mjs --tarea=sintoma lib/escolar/ciclo/calendario.ts  # casa «síntoma»
node scripts/gen-contexto.mjs "app\actions\asistencias.ts"            # incluye «Tocar permisos…»
node scripts/diag-peso-cambio.mjs lib/auth/permisos.ts; echo $?          # 0 y veredicto Claude
npm run test:ci
```

---

## PARTE B — Scripts: ni secretos en la salida ni una cuarentena que se pueda desarmar

### OBJETIVO
- Ningún script de diagnóstico imprime una credencial, nada que la derive (la CURP de la
  que sale la contraseña del tutor) ni ninguna función de su valor.
- Los de `_peligrosos/` no pueden ejecutarse ni por accidente.
- La prueba de carga no arranca sin confirmación.
- El inventario dice lo que cada script hace.

### MEDICIÓN (antes; pega la salida)
```bash
node scripts/test-orden.mjs --detalle      # C6 y C10
git grep -niE "console\.(log|error)\(.*(clave|contrase|password|inicial|curp)" -- 'scripts/*.mjs' ':!scripts/_archivo' ':!scripts/_peligrosos'
```

### ESTADO ACTUAL (verificado — no re-investigar)
- **Imprimen secretos o lo que los deriva:**
  - `diag-credenciales-duplicadas.mjs`: `:60` (`PROFESORES.CLAVE`) y `:83` (`ALUMNOS.CLAVE`,
    que es la contraseña del alumno según `lib/auth/portal-login.ts`).
  - `verificar-login-credenciales-iniciales.mjs:56-60`: la contraseña inicial y la `curp=`.
  - `6j-verificar-password-tutor.mjs`: `:76` (`curp_alumno`) y `:81` («Contraseña inicial
    esperada»).
  - `diagnostico-login-tutor.mjs:101`: `clave=` y `curpAlumno`. Su cabecera, en `:4`, dice
    «NO expone contraseñas». No tiene fila en el README.
  - `migrar-marcar-claves-compartidas-profesores.mjs:76`: la CLAVE por profesor, también en
    el dry-run.

  La contraseña inicial de un tutor son los 8 últimos caracteres de la CURP del alumno
  (`lib/escolar/tutores/tutores-credenciales.ts:45-53`). `6k-verificar-clave-tutor.mjs` imprime `clave_tutor`, que es un
  identificador público: **no se toca**. `migrar-crear-tecnico.mjs:70` tiene la clave
  inicial como literal; `migrar-crear-administracion` la pide por `--clave=`.
  `scripts/README.md:155` publica las claves compartidas. El único precedente correcto es
  `diag-profesor-alcance.mjs:28` (`enmascarar`, que solo muestra la longitud).
- **`_peligrosos/`** (23 archivos): ninguno tiene guarda en el código. Hoy no arrancan solo
  porque buscan `scripts/.env.local`, que no existe; «arreglar» esa ruta los arma contra
  producción. `.clineignore` no los cubre.
  `probe-etiqueta-cols.mjs`, `probe-foto-col.mjs` y `probe-personal-comment.mjs` hacen
  **PATCH sobre la ficha real de un alumno** (CURP fija). Comparten la fila agrupada
  `scripts/README.md:185` con otros 6 probes que no lo hacen.
- **`fase10-carga.mjs`** es una prueba de carga con service_role contra producción y su
  rampa llega a 1 000 (`:26`). La cabecera (`:10-12`) documenta `--niveles 50,100` con
  espacio, pero el parser (`:26-32`) solo acepta `=`. `fase10-perfil-datos.mjs:11` tiene el
  mismo problema con `--runs`, y su consulta del panel directivo (`:219-225`,
  `select("*")` de toda la tabla) no es la de la app
  (`lib/escolar/tutores/tutores-credenciales.ts:250,265-268`: dos columnas, en lotes de
  50). Los dos están en la fila agrupada `:137`, dentro de «Diagnósticos vivos (`LEE`)».
- **C6** (`test-orden.mjs:203-209`) mide sobre `codigoDesnudo()`, que **vacía las cadenas**
  (`:92-100`). Por eso no ve `fetch(…, { method: "DELETE" })`
  (`_peligrosos/probe-materia-crud.mjs:34`). Hay RPC de lectura por POST
  (`diag-materias-alumno.mjs:37`).
- **`scripts/README.md`**:
  - `ESCRIBE` y `DESTRUCTIVO` se definen (`:45-46`) y no los usa ninguna fila.
  - `gen-rumbo`, `gen-estado` y `gen-informe` figuran como `LEE(fs)`, pero escriben.
  - `:12` dice «las 40 suites» y `:111` «6 archivos».
  - `:82` usa el rango `test-auditoria-ciclo-f0..f8.mjs`, que C10 cuenta como 9 sin fila.
  - Faltan `diag-sql-aplicado.mjs` y `diagnostico-login-tutor.mjs`.
  - La «sospecha abierta» de calendario vacío contradice ESTADO §5.

### RESULTADO ESPERADO
- **B1. Credenciales.** En cada línea citada, el valor y la CURP pasan a `[oculta]`. Para
  distinguir grupos, usa etiquetas opacas por orden de aparición («grupo A, B…» con su
  recuento). **Nunca una función del valor**: un hash de `4321` se invierte en
  milisegundos.
  - Corrige la cabecera de `diagnostico-login-tutor.mjs`.
  - `migrar-crear-tecnico.mjs` pide `--clave=`, como `migrar-crear-administracion`.
  - En `README.md:155`, deja solo los recuentos.
  - Añade al README, en la clasificación, la regla: «un script que deriva o compara
    credenciales no imprime ni el valor ni la CURP».
- **B2. Cuarentena, en este orden:**
  1. En los 23 `.mjs` de `_peligrosos/`, la primera sentencia después de los `import` es
     `throw new Error("CUARENTENA: no se ejecuta. Ver scripts/README.md");`.
  2. Regla **DURA** nueva en `test-orden.mjs`. Lee el fuente crudo, no `codigoDesnudo`, y
     exige esa línea como primera sentencia tras los imports. Comprueba que está en verde.
  3. Solo entonces, añade `scripts/_peligrosos/` a `.clineignore` y quita la línea
     `contexto.feliz`, cuya ruta ya no existe.
- **B3. Carga.** `fase10-carga.mjs` exige `--confirmar-carga`. **La comprobación va antes de
  leer `.env.local` y antes de cualquier `fetch`**; sin el flag, exit 1. Acepta `--x=v` y
  `--x v`, y la cabecera dice lo mismo que el parser. En `fase10-perfil-datos.mjs`, arregla
  la cabecera y alinea su consulta del panel directivo con la de `tutores-credenciales.ts`.
- **B4. C6.** Añade la detección `method:\s*["'](POST|PUT|PATCH|DELETE)` en `test-`, `diag-`
  y `probe-`:
  - Aplícala al fuente **sin comentarios pero con las cadenas** (no a `codigoDesnudo`).
  - Excluye `_peligrosos/` y `_archivo/` **solo de esta detección nueva**; la actual sigue
    recorriendo lo de hoy.
  - Las RPC de lectura (POST a `/rest/v1/rpc/`) quedan como excepción declarada, con su
    motivo.
  - **Control positivo**: la medición previa tiene que encontrar `diag-materias-alumno.mjs:37`.
    Si no lo encuentra, o si marca un script vivo que no sea RPC de lectura, detente y
    repórtalo.
- **B5. README.**
  - **Etiquetas.** Añade `CARGA` a la tabla: «genera carga real sobre producción: solo una
    persona, con autorización y fuera de horario». Los `gen-` llevan una etiqueta por
    script:
    - `gen-rumbo`: «escribe RUMBO.md salvo con `--check`»;
    - `gen-informe`: «escribe `docs/informes/<mes>.md` salvo con `--stdout`»;
    - `gen-estado`: «escribe `.panel/` (ignorado por git); no tiene modo de solo lectura».
  - **Filas.**
    - Saca de la fila `:185` los 3 probes de PATCH a una fila propia: «PATCH sobre la ficha
      real de un alumno (CURP fija)».
    - Da fila propia a `fase10-carga` (`CARGA`), a `fase10-perfil-datos` (`LEE(red)`,
      rendimiento) y a `6j` («salida sensible: no ejecutar desde Cline»; ponlo también en
      los demás de B1).
    - El rango de `:82` se lista por nombre.
    - Añade las filas de `diag-sql-aplicado.mjs` y `diagnostico-login-tutor.mjs`.
  - **Texto.**
    - En `:12` y `:111`, sin cifras.
    - La «sospecha abierta» pasa a remitir a ESTADO §5.
    - Al principio del README: «Un script sin fila aquí se trata como `ESCRIBE`: no se
      ejecuta sin leerlo entero».
  - **Al final**, aprieta el umbral de C10 a lo que mida test-orden (≤ 21). Después,
    `node scripts/gen-rumbo.mjs`: `RUMBO.md` publica C10 y va en este commit.

### REGLAS
No borres ni muevas scripts. No crees un módulo común para enmascarar: bastan una o dos
líneas por script.

### VALIDACIÓN
```bash
git grep -L "CUARENTENA" -- scripts/_peligrosos/          # vacío
git grep -n "confirmar-carga" scripts/fase10-carga.mjs    # antes de la lectura de .env.local
git grep -niE "console\.(log|error)\(.*(clave|contrase|password|inicial|curp)" -- 'scripts/*.mjs' ':!scripts/_archivo' ':!scripts/_peligrosos'   # revisar cada resultado: ninguno imprime valor ni CURP
node scripts/test-orden.mjs                                # regla nueva y C6 en verde; C10 apretado
node scripts/gen-rumbo.mjs --check
npm run test:ci
```

---

## PARTE C — Una sola verdad en el arranque y en las normas (requiere las DECISIONES 1, 2, 6 y 10)

### OBJETIVO
- Ningún documento de arranque ni normativo contradice al código ni a otro normativo.
- Ninguna cifra que se pueda derivar se copia a mano.
- **Coste neto en el arranque ≤ 0** respecto a la base LF: la poda de C1 (~−620 tokens) paga
  lo que suman C2–C5 y C11. Debería quedar en torno a 9 800.

### MEDICIÓN (antes; pega la salida)
`npm run verificar:docs` y el `git grep` de VALIDACIÓN.

### DECISIONES TOMADAS (no las reabras)
- **Calificaciones**: rige el modelo B (`calificaciones` por `grupo_materia_id` + CURP; SQL
  aplicado en `d7415a7`). Las tablas físicas por materia son legado (R8) y siguen vivas en
  la vista del profesor.
- **Calendario**: la identidad es `periodo_id`; `ciclo_escolar` es legado. Excepción que
  **no se toca** (R8): el fallback de `obtenerCalendarioDePeriodo` cuando falta la columna,
  y la escritura de la UNIQUE de texto.
- **Validación**: `npm run test:ci`, más la suite del módulo para iterar.
- **Umbrales**: lo que no se delega es **aflojar** uno (subirlo, o pasar una regla DURA a
  trinquete). Apretarlo cuando baja la deuda forma parte del cambio.
- **Cifras**: no se escriben a mano fuera de su fuente.
  - Roles → `ROLES_PORTAL`.
  - Suites → `scripts/test-*.mjs`.
  - Server Actions → MATRIZ-PERMISOS §5, que es generado.
  - Claves compartidas → el pendiente `claves-compartidas-profesores`.
  - Tamaño de la documentación → `npm run verificar:docs`.

### RESULTADO ESPERADO
- **C0.** En `verificar-docs.mjs`, debajo de la línea de A1, añade una línea fechada con la
  DECISIÓN 1 tal como quede escrita arriba.
- **C1. REGLAS_NO_HACER** (es la poda):
  - **Encabezado del P0.** Desde «Fuente del incidente raíz documentado» hasta el `---` que
    cierra «## Incidente P0 que originó este archivo (resumen)» (`:8-38`), todo pasa a:
    > Incidente raíz: **P0 2026-09-03** (ciclo activo sin contexto académico). Relato,
    > reparación y cifras: `docs/historial/BITACORA-2026-09.md` («Incidente P0 — movido de
    > REGLAS») y `docs/historial/informes/INFORME-PROMPT-1-ESQUEMA-Y-DATOS.md` §T4.

    (Esa sección de la BITACORA la crea Claude antes de enviarte esta parte.)
  - **R3.** «Herramientas existentes de verificación (solo lectura): …» (`:97-98`) pasa a:
    > Verificación: la RPC `activar_ciclo_operativo` y `validarIntegridadCiclo`
    > (`lib/escolar/ciclo/ciclo-estado.ts`). Diagnóstico:
    > `node scripts/diag-calendario-periodo.mjs`. `8-diagnostico-ciclos.mjs` y
    > `p0-diag-contexto.mjs` son de la época del P0 y agrupan por texto.
  - **R5.** Conserva el título «## R5. …» y sustituye su cuerpo (`:121-134`) por:
    > `calendario_escolar.periodo_id` es la relación estructural. La columna de texto
    > `ciclo_escolar` es legado (R8) y no tiene por qué coincidir con `periodos.nombre`.
    > Prohibido en código nuevo: resolver el calendario por texto o construir
    > `ciclo_escolar` a partir de `periodos.nombre` para leer. Se lee con
    > `obtenerCalendarioDePeriodo` (`lib/escolar/ciclo/calendario.ts`). Falta la FK:
    > pendiente `fk-calendario-periodo`.
  - **Checklist, punto 4** («bajo el mismo nombre del periodo», `:175-176`) pasa a:
    > 4. ¿Tiene días `clase` por `calendario_escolar.periodo_id = periodos.id`? (lo cuenta
    > `validarIntegridadCiclo`)
  - **Deuda y consolidación.** «## Deuda arquitectónica conocida (NO resuelta en P0)» y
    «## Consolidación arquitectónica…» (`:186-214`) se borran. **Antes**, añade a
    `docs/sistema/pendientes.json` este objeto y corre `node scripts/gen-rumbo.mjs` en el
    mismo paso:
    `{"id":"inscripciones-2do-a-rh","titulo":"4 inscripciones activas en 2DO A RH (semestre 2 inactivo, sin horario)","detalle":"Deuda 3 del P0 (antes en REGLAS_NO_HACER). Requiere decisión del directivo: mover de grupo o desactivar la inscripción. Sin verificar desde el 2026-09-03.","riesgo":"bajo","quien":"persona — directivo","verificar":null,"doc":"docs/historial/BITACORA-2026-09.md","revisado":"2026-09-03","estado":"abierto"}`
- **C2. GLOSARIO:**
  - En `:14`, quita `"AGO2026-ENE2027"`.
  - La «**Trampa activa:**» (`:19-23`) pasa a:
    > … `ciclo_escolar` (LEGACY: solo sus **lecturas** están `@deprecated`; las escrituras
    > aún usan la UNIQUE de texto) y `periodo_id` (correcta). El texto no tiene por qué
    > coincidir con `periodos.nombre`: leer **siempre** por `periodo_id`.
  - «Todo acceso a datos usa esto» (`:40`) → «Todo acceso a las **tablas físicas legado**
    usa esto».
  - Borra el blockquote «> Una materia = **una tabla física por grupo**…» (`:46-53`) y
    añade a la tabla «Materia» (`:38-44`) esta fila:
    > `| **Calificaciones (modelo B)** | Tabla `calificaciones` por `grupo_materia_id` + CURP (`supabase/crear-calificaciones-normalizadas.sql`). Las tablas físicas por materia (columnas creadas por RPC) son legado (R8): las usa la vista del profesor. Trampa: `materia_id` en `materias_nombres_visibles` y `materias_mapeo_columnas` es TEXTO (= nombre de tabla); unir por `grupo_materia_id`. |`
  - «16 de 20 profesores comparten `4321`» (`:60`) → «**No es identidad y no es única**
    (cuántas la comparten: pendiente `claves-compartidas-profesores`)».
- **C3. CONTRATO:**
  - §1, punto 5 → «5. Validar: npm run test:ci (el CI completo) + la suite del módulo.» El
    bloque sigue en 12 líneas.
  - §2 Verificación: las casillas de tsc, suite y build (`:56-58`) se funden en una:
    «`npm run test:ci` en verde».
  - `:51` → «Calificaciones por `grupo_materia_id` (modelo B); `idInterno` solo para las
    tablas físicas legado; nunca `nombreVisible`».
  - `:78` → «| Identifica un profesor por CLAVE | La CLAVE es una contraseña compartida
    (pendiente `claves-compartidas-profesores`). |».
  - `:65` → «El informe lo entrega quien implementa (chat y mensaje del commit) y lo
    archiva Claude en `docs/historial/informes/`».
  - Añade a §2 Documentación: «Si añadiste o cambiaste una Server Action:
    `npm run gen:matriz`. Si editaste `pendientes.json`: `node scripts/gen-rumbo.mjs`, en
    el mismo paso». Y: «¿Respeta `docs/normativo/INVARIANTES.md`?».
- **C4. AGENTS** (está en el arranque):
  - «(obligatoria, ~37 KB)» → «(obligatoria; su coste: `npm run verificar:docs`)».
  - «…consume la mitad de la ventana… ~500 KB de docs.» → «…gasta la ventana antes de
    escribir una línea: casi toda la documentación del repo es historial.»
  - «**No ejecutar migraciones destructivas…**» y su frase (`:40-41`) → «**Ninguna
    migración de datos ni SQL sin autorización explícita** (CONTRATO §1.3). Los cambios de
    datos: mínimos, reversibles, explicados y verificables.»
  - «Al terminar: `npx tsc --noEmit`…» (`:44-45`) → «Al terminar: `npm run test:ci` y, si
    cambió la arquitectura, `ESTADO-ACTUAL.md`.»
  - Orden de autoridad, nivel 3: lo que diga la DECISIÓN 10.
  - «Cómo se redacta un prompt: `criterios.prompts`.» → «Quién implementa lo orienta
    `node scripts/diag-peso-cambio.mjs <rutas>`. Estructura del prompt:
    `docs/normativo/ORDEN.md` §6.»
  - Fila «| Cline | **solo el paquete del prompt** | con ~800 KB…» → «| Cline | **solo el
    paquete del prompt** (sustituye a `docs/00-INDICE.md`) | no necesita decidir nada: la
    decisión llega tomada |».
  - Bajo «### Qué nunca se delega sin revisión», que se conserva, el párrafo (`:106-109`)
    pasa a:
    > Decidir el esquema · elegir la fuente de verdad de un dominio · tocar `lib/auth/` ·
    > retirar legacy o un fallback · **aflojar** un umbral de `test-orden.mjs` (subirlo o
    > pasar una regla DURA a trinquete) · subir `TECHO_TOKENS` o añadir un archivo al
    > arranque. Aflojarlo para que el CI pase apaga el guardián; apretarlo cuando baja la
    > deuda es parte del cambio.
- **C5. 00-INDICE** (está en el arranque):
  - «pesa ~500 KB; cargarla entera consume la mitad de la ventana» → «La mayor parte de la
    documentación es historial; cargarla entera agota la ventana».
  - Filas del presupuesto:
    - «**Cualquier cambio** (mínimo obligatorio, ~37 KB)» → «(mínimo obligatorio; coste:
      `npm run verificar:docs`)».
    - «Crear un archivo, función, script o SQL nuevo»: añade «· SQL:
      `filosofia.estructural` §9-§10».
    - «Decidir arquitectura (nuevo módulo, nueva tabla)» → «Decidir arquitectura o quién
      implementa (nuevo módulo, nueva tabla, decisión humana) | +
      `filosofia.estructural` §1-§3 · `scripts/diag-peso-cambio.mjs` · `AGENTS.md` §Qué
      nunca se delega».
    - «Optimizar rendimiento» → «+ pendiente `remedir-rendimiento`
      (`docs/sistema/pendientes.json`) · `filosofia.estructural` §11 y §16 · línea base
      histórica (la consulta Claude):
      `docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md`».
    - «Auditar un cambio»: añade «· `docs/normativo/ORDEN.md` («La prueba del algodón» y
      «Cómo se rompe este orden»)».
    - «Tocar permisos, roles o una Server Action» → «+ `docs/sistema/MATRIZ-PERMISOS.md`
      (§3 y la entrada de §5 del archivo)».
  - Mapa:
    - Quita «138» de la fila de MATRIZ-PERMISOS.
    - Bajo «### `docs/historial/` — pasado…», que se conserva, la tabla (`:79-85`) pasa a
      una frase: «Lo que contiene cada subcarpeta lo dice `docs/historial/README.md`. Las
      mediciones de rendimiento (FASES 9/10) son anteriores al refactor: no describen el
      presente.»
    - Fila `supabase/*.sql` → «Esquema escrito; **escrito ≠ aplicado**: lo que falta
      ejecutar o verificar son los pendientes abiertos de `docs/sistema/pendientes.json`
      cuyo `doc` es un `.sql`. No borrar ninguno.»
    - Añade filas para `docs/sistema/pendientes.json` («fuente única de pendientes; la
      leen gen-rumbo, gen-estado y gen-contexto») y `docs/sistema/TOKENS-OCEANO.css`
      («tokens; `app/globals.css` copia su bloque literal»).
- **C6. README raíz:**
  - «con cuatro roles (alumno, profesor, directivo, tutor)» → «con los roles de
    `lib/auth/types.ts` (`ROLES_PORTAL`)».
  - Fila `test:suites` → «Todas las `scripts/test-*.mjs`…».
  - Añade la fila `npm run test:ci` → «El CI completo (lo mismo que GitHub). Antes de cada
    commit.»
- **C7. ESTADO-ACTUAL y `verificar-estado-actual.mjs`, en el mismo commit:**
  - Quita «**HEAD:** … · árbol limpio» (`:10`).
  - El verificador mide los commits desde la última edición de `ESTADO-ACTUAL.md`
    (`git log -1 --format=%H -- ESTADO-ACTUAL.md`), con la misma tolerancia (10, aviso por
    encima de 1). Conserva en `--json` las claves `headDeclarado` (ese sha) y
    `commitsAtras`, porque las lee `gen-estado.mjs:207-213`.
  - `:21-22`: añade «(SQL pendiente: `sql-portada-carreras`)».
  - `:45` → «Identidad de materia | `grupo_materia_id` (modelo B); `idInterno` en el
    legado».
  - `:56`: la deuda 3 queda «en retirada: modelo B en calificaciones».
  - §8 se reduce a «Ver `AGENTS.md` §Antes de dar un cambio por bueno».
  - El archivo sigue en ≤ 150 líneas.
- **C8. ORDEN:**
  - «sexto rol» (`:139`) → «otro rol»; «los roles son **5** (`alumno`, …, `tecnico`).»
    (`:143-144`) → «se añadió el rol `tecnico`.» El resto del bloque se queda igual.
  - Fila `_borrador/` (`:45`): según la DECISIÓN 6.
  - Las filas «| `lib/escolar/` |…» y «| `lib/*-puro.ts` |…» (`:158-159`) entran en la tabla
    de `:117-123`; las citas van debajo de la tabla.
  - Tabla de familias (`:53-62`): añade `administracion/` y `portada/`, y en la fila de la
    raíz `mensajes-internos.ts` y `documentos-permisos-puro.ts`. Sin cifras.
  - §4, prefijos (`:216-223`): añade `verificar-`, `check-`, `sync-`, `fase10-`,
    `diagnostico-` y los numerados, con su contrato según el README de la Parte B, o «sin
    contrato: se trata como `ESCRIBE`».
  - Una línea normativa, en su sección, por cada una de estas reglas:
    - C8: la action no llama a `.from()`;
    - C9: tamaño máximo = `LIMITE_LINEAS` de test-orden;
    - C16: `onConflict` contra una UNIQUE/PK declarada;
    - C17: `test:ci` = el workflow;
    - la cuarentena de B2.

    De C14 solo falta su excepción: en el bloque de `:125-131`, «se permite
    `export type X = …`».
  - §6 «Estructura de un prompt», según la DECISIÓN 2. Recomendada: «1. OBJETIVO ·
    2. CONTEXTO (paquete de `gen-contexto --agente=cline`) · 3. ESTADO ACTUAL (verificado,
    «no re-investigar») · 4. DECISIONES TOMADAS · 5. MEDICIÓN (antes/después, mismo
    script) · 6. RESULTADO ESPERADO · 7. REGLAS / SEGURIDAD / RENDIMIENTO · 8. ALCANCE (qué
    sí y qué NO) · 9. VALIDACIÓN (comandos) · 10. INFORME · 11. CONTRATO (§1, literal)».
  - «**Un prompt, un dominio.**…» (`:287-288`) → «**Un prompt, un dominio**, o varias partes
    independientes con commit y `test:ci` por parte; cruzar dominios dentro de una parte la
    hace imposible de auditar.»
  - En la fila «Se archiva», añade «(lo archiva Claude)».
- **C9. filosofia.estructural:**
  - «(ver docs/OPTIMIZACION_*.md)» (`:484`) → «(ver
    `docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md`)». Pon entre backticks, y con
    raíz, las demás rutas escritas en texto plano (`:11-13`, `:18`, `:321`, `:366`,
    `:388-389`).
  - El bloque «Patrón actual del proyecto (debe mantenerse):» (`:262-269`) pasa a:
    > RLS público en tablas + autorización de negocio en Server Actions. `exigir(capacidad)`
    > es la primera línea de toda action (rol de la cookie firmada); el alcance (sobre
    > quién) se resuelve después, con la sesión; la entrada, con `leerFormData`; la decisión
    > se delega a `lib/` (ORDEN §2).
  - §4, fuentes oficiales:
    - a `calendario_escolar` añade «(por `periodo_id`; `ciclo_escolar` es legado, R5)»;
    - nueva fila `PROFESORES.ID` → identidad del profesor;
    - nueva fila `calificaciones` → notas por `grupo_materia_id` + CURP (modelo B).
  - §15 (`:449-454`): «la forma de trabajo… se define en criterios.prompts» → «la forma de
    trabajo la fijan ORDEN §6 y CONTRATO; criterios.prompts la desarrolla».
  - La línea `INVARIANTE:` que termina en «…no este archivo.» (`:444`) pasa a «…no la
    filosofía.». Después corre `npm run gen:invariantes`.
  - En la cabecera, una línea: «Las líneas `INVARIANTE:` generan
    `docs/normativo/INVARIANTES.md` (`npm run gen:invariantes`; límites en
    `scripts/gen-invariantes.mjs`)».
- **C10. criterios.prompts:**
  - §4 queda así:
    > Cline no conserva conocimiento entre prompts. Recibe `AGENTS.md`, el paquete de
    > `gen-contexto` y el CONTRATO. El prompt no repite la documentación: la cita. Las
    > decisiones de esquema y de fuente de verdad llegan tomadas (DECISIONES TOMADAS).
  - §6-7, una frase: «si aparece una integración mejor, se detiene y lo reporta; no
    rediseña».
  - §19 → remite a CONTRATO §1. §24 → remite a ORDEN §6. §12 → remite a filosofia §4 y al
    GLOSARIO. §13 → remite a filosofia §9 y §14 y a R8.
  - §26: añade «Medición antes/después».
  - En `:37`, «tres» → «cuatro». En `:23`, la ruta pasa a `docs/historial/informes/`.
- **C11. gen-rumbo:**
  - La primera línea **dentro** del bloque GENERADO es fija: «Contexto, no alcance: nada de
    esto entra en tu tarea si el prompt no lo nombra.».
  - Cada pendiente lleva un sufijo: «· persona» si `quien` casa con `/^persona/i`, y
    «· agente» si no.
  - Las reglas se emiten como `- ${id} (${regla}) = ${actual}`, con `regla` tomada de
    `test-orden --json`.
  - Regenera RUMBO y mide el delta.
- **C12. gen-contexto:**
  - Quita la línea «Además, siempre: `npx tsc --noEmit` · `npm run test:ci` · …»: la
    validación la da el CONTRATO.
  - La línea «No bajar un umbral…» pasa a usar el texto de «aflojar» de C4.

### REGLAS
- Nada de documentos ni secciones nuevas; tampoco se reescribe un documento entero.
- `INVARIANTES.md` no se edita a mano.
- No toques los `.sql`, ni `lib/` ni `app/`.

### VALIDACIÓN
```bash
npm run verificar:docs        # ≤ la base LF; esperado ~9 800
npm run verificar:estado
git grep -nE "40 suites|cuatro roles|~500 KB|~800 KB|~37 KB|16 de 20|138 Server|los roles son \*\*5" -- AGENTS.md README.md ESTADO-ACTUAL.md docs/00-INDICE.md docs/normativo/ scripts/README.md   # 0
node scripts/gen-invariantes.mjs --check && node scripts/gen-rumbo.mjs --check
npm run test:ci
```

---

## PARTE D — docs/sistema y el mapa describen el presente (después de C)

### OBJETIVO
- El MAPA lleva del síntoma al archivo correcto en todos los dominios, y sus anclas
  resuelven.
- Lo que tiene fecha o ya se ejecutó sale de la carpeta del presente sin que se pierda un
  hecho vivo.

### MEDICIÓN (antes; pega la salida)
`npm run verificar:docs`, y el recuento en seco de lo que marcarían las comprobaciones de
D4 (impleméntalas primero en modo informe).

### ESTADO ACTUAL (verificado — no re-investigar)
- **MAPA-DEL-SISTEMA**:
  - `:92` pone `nivelAccesoProfesor` en la fila de alcance sobre alumnos, pero es de las
    carpetas de Documentos (`lib/escolar/documentos.ts:223`).
  - `:53` manda a `ciclo-orquestador.ts`, que nadie importa.
  - `:25` dice «siete familias».
  - `:101` dice «Cloudinary es la única API externa», y existe `lib/oembed/`.
  - `:72` («el promedio está mal») solo cita `calcularPromedioPonderado`, cuando la vista
    del alumno usa `promedioActividades` (`calificaciones-puro.ts:239`).
  - `:76` dice «una RPC», pero hay RPC + fallback O1 (`app/actions/escolar.ts:213-268`).
  - `:118` da la deuda 3 por viva.
  - 4 de 26 anclas `ruta::símbolo` están rotas, entre ellas `:60`
    (`calcularPorcentajeAsistencia` está en `asistencia-estados.ts:268`), `:70` y `:82`.
  - `lib/escolar/asistencia/asistencia-estados.ts` no aparece en ningún documento.
- **FLUJO-TECNICO** tiene conteos caducados (`:4`), y su recorrido empieza en una ruta que
  hoy redirige (`:58-59`).
- **MATRIZ-UX:113-118** cita 6 `*-client.tsx` retirados (`8d17188`).
- **MATRIZ-PERMISOS**: `:81` dice «138». `:84` manda regenerar §4 con `gen-seccion4`, y
  `:647` dice «A mano. Es la decisión».
- **`modulos/CICLO_EVALUACIONES_MODULO.md:85`** describe el calendario solo por texto.
- **Documentos fuera de sitio**:
  - `docs/normativo/PROMPT_E_CAPAS_Y_TAMANO.md` y `PROMPT_F_HIGIENE_FINAL.md`, ya
    ejecutados.
  - En `docs/sistema/`:
    - `EVALUACION-REPO-2026-09-08.md`, sin hechos únicos;
    - `PENDIENTES-2026-09-16.md`, al que apuntan `pendientes.json` (`:16`, `:114`,
      `:136`, `:158`), `eslint.config.mjs:19` y `gen-rumbo.mjs:90`;
    - `SOSTENIBILIDAD-DEL-REPARTO.md`;
    - `MIGRACION-MATERIAS-A-ID.md`, citado por `scripts/test-calificaciones-puro.mjs:11`;
    - `modulos/CALIFICACIONES-Y-BOLETAS.md`, superado.
- **`pendientes.json`**:
  - `remedir-rendimiento` (`:141-150`) parte de una premisa falsa: «asistencia ~1000 →
    3863», cuando ya eran 3 863 en FASE 0.
  - Lo que sigue abierto en el código:
    - C-1: `lib/escolar/alumno/alumnos.ts:76-78`, `.range(0, 4999)` en cada login;
    - C-2: `materia-vista-alumno.ts`, `select("*")`;
    - C-3: `lib/escolar/openapi.ts:53`;
    - P0-3/6B: el stub de `foto-perfil.ts:18-27`.
  - `prompt5-parte-b` (`:174-183`) apunta a `docs/normativo/PROMPT_E_CAPAS_Y_TAMANO.md`.

### RESULTADO ESPERADO
- **D1. MAPA.**
  - Corrige `:92`, `:53` y `:72`, y las anclas rotas.
  - `:25` → «las familias de ORDEN §1b».
  - En `:101`, añade `lib/oembed/`.
  - En `:76`, documenta la RPC + el fallback O1.
  - `:118`: la deuda 3, en retirada.
  - Añade `asistencia-estados.ts` a la fila de asistencia.
  - Añade en §1 las filas de dominio nuevo de `[LITERALES D1]`, tal cual.
- **D2. FLUJO.** Quita los conteos y los «(N L)». El paso 1 del recorrido y la línea del
  modelo B salen de `[LITERALES D2]`.
- **D3.**
  - `MATRIZ-UX:113-118`, con las rutas de `[LITERALES D3]`.
  - `MATRIZ-PERMISOS`: `:81` sin cifra. `:84` y `:647` dicen lo mismo: «§4 se decide a
    mano; `gen-seccion4` es una ayuda código → doc; `test-permisos` vigila que coincidan».
  - `CICLO_EVALUACIONES_MODULO:85` → «… identificado por `periodo_id` (F5); `ciclo_escolar`
    es legado».
- **D4. `verificar-docs`**, ampliando su bucle actual:
  - **(a) Anclas.** El símbolo de cada ancla `ruta::símbolo` aparece en esa ruta.
  - **(b) Rutas de `pendientes.json`.** Existen el `doc` (entero, si no es null) y los
    tokens de `verificar` que empiezan por una de las RAICES.
  - **(c) Listas de arranque.** La lista de «Lectura de arranque» de AGENTS ⊆ `ARRANQUE`,
    y la fila «Cualquier cambio» ⊆ `ARRANQUE`.
  - **(d) Nombres sueltos.** Todo `x.ts|tsx|mjs|sql` entre backticks y sin raíz debe
    existir con ese basename en `git ls-files`.
    - La notación `a..b` se trata como rango.
    - Las excepciones van en un mapa con su motivo, como `AUSENTES_A_PROPOSITO`.
    - **Si marca más de 15, detente y entrega la lista.**

  Lo que marque dentro del alcance de D se corrige aquí.
- **D5. Mover con `git mv`, en orden.** Antes de cada movimiento, `git grep -n <nombre>` en
  todo el repo. **No edites los `.sql`**: su comentario es historia del esquema.
  1. PROMPT_E y PROMPT_F → `docs/historial/prompts/`. En `test-orden.mjs`, quita el quinto
     argumento de `comprobar("C8"…)` y de `comprobar("C9"…)`, el comentario «las once
     reglas» y el «hoy faltan 35». En `prompt5-parte-b`, el `doc` pasa a
     `docs/historial/prompts/PROMPT_CLINE_B4_PURO_VS_IO.md`.
  2. `EVALUACION-REPO-2026-09-08.md` → `docs/historial/auditorias/`.
  3. `PENDIENTES-2026-09-16.md` → `docs/historial/auditorias/`. Actualiza
     `pendientes.json` (`:16`, `:114`, `:136`, `:158`), `eslint.config.mjs:19` y
     `gen-rumbo.mjs:90`.
  4. `SOSTENIBILIDAD-DEL-REPARTO.md` → `docs/historial/auditorias/`. La decisión del techo
     ya consta en C0.
  5. `MIGRACION-MATERIAS-A-ID.md` y `modulos/CALIFICACIONES-Y-BOLETAS.md` →
     `docs/historial/auditorias/`. Actualiza `scripts/test-calificaciones-puro.mjs:11` y
     lo que esté en el corpus de `verificar-docs`.
- **D6. `pendientes.json`** (después, `node scripts/gen-rumbo.mjs` en el mismo paso):
  - `remedir-rendimiento`:
    - El detalle pierde la premisa falsa y lista lo abierto en código (C-1, C-2, C-3 y
      P0-3/6B, cada uno con su `archivo:línea`).
    - `verificar` queda en `null`: las consultas de `fase10-perfil-datos` son anteriores al
      refactor, y el instrumento lo decidirá la FASE 11.
  - Añade:
    `{"id":"rotar-pat-y-bypass","titulo":"Confirmar que se rotaron el PAT de Supabase y el secreto de bypass de Vercel","detalle":"Solo constan en el historial de rendimiento (FASES 4-5) como «rotar al terminar». Confirmar en los paneles.","riesgo":"medio","quien":"persona — responsable de Supabase y Vercel","verificar":null,"doc":"docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md","revisado":"2026-10-04","estado":"abierto"}`

### REGLAS
- Mover al historial es `git mv` sin editar el contenido.
- Lo que no cabe en una fila del MAPA no se convierte en un documento nuevo.
- No inventes los literales: si falta alguno, detente.

### VALIDACIÓN
```bash
npm run verificar:docs        # anclas, rutas de pendientes y listas, en verde
git grep -nE "PENDIENTES-2026-09-16|MIGRACION-MATERIAS-A-ID|CALIFICACIONES-Y-BOLETAS|PROMPT_E_CAPAS|PROMPT_F_HIGIENE" -- ':!docs/historial' ':!supabase'   # solo rutas nuevas
node scripts/gen-rumbo.mjs --check
npm run test:ci
```

---

## PARTE E — La recuperación se comprueba sola (después de C)

### OBJETIVO
Cada tarea representativa recibe lo mínimo que necesita sin arrastrar documentos enteros
de más, y una suite impide que eso retroceda.

### MEDICIÓN (antes; pega la salida)
La primera ejecución de la suite E2, antes de tocar el generador en E1.

### ESTADO ACTUAL (verificado — no re-investigar)
Medido con 10 tareas × 2 agentes; todas salen con exit 0.
- **T1 («calendario vacío»)** no llega a `asistencia-estados.ts` y le sobran MATRIZ-UX
  (43 KB), que entra por la sugerencia automática de `app/components/`, y unos 42 KB de
  MATRIZ-PERMISOS.
- **T4 (rendimiento)** arrastra unos 125 KB de historial sin aviso.
- **T9** no marca `lib/auth/`, `supabase/` ni `test-orden.mjs` como no delegables.
- **T10 («revisar»)** es tarea de Claude.
- **Sugerencias automáticas.** La de permisos mete MATRIZ-PERMISOS entera en 7 de cada 10
  tareas. `/ciclo|periodo/` se dispara con el nombre de un diagnóstico.
- **Paquete de Cline.** Pega filas del GLOSARIO (hasta 2,6 KB) aunque el GLOSARIO ya está
  en la fila 0.
- **Suites.** Ninguna `test-*.mjs` ejecuta gen-contexto.

### RESULTADO ESPERADO
- **E1. gen-contexto:**
  - (a) Si una fila cita `docs/historial/`, el paquete de Cline lleva también el aviso de
    historial.
  - (b) Flag `--diag=<script>`: el paquete cita ese script y su fila del README. Sin el
    flag no se añade nada.
  - (c) Marca «requiere revisión de Claude (AGENTS §Qué nunca se delega)» en
    `lib/auth/**`, `supabase/**`, `scripts/test-orden.mjs`, `scripts/verificar-docs.mjs` y
    los archivos con `@deprecated` o «fallback».
  - (d) Avisa si un archivo en alcance está a menos del 5 % del límite de C9. Para eso,
    añade `limite: LIMITE_LINEAS` a la entrada C9 del `--json` de test-orden (campo nuevo y
    aditivo) y léelo de ahí.
  - (e) Los TÉRMINOS se listan solo por su nombre canónico, con «definición en
    `GLOSARIO.md`».
  - (f) La sugerencia «ciclo» se limita a `lib/escolar/ciclo/` y `supabase/`.
  - (g) Con `--tarea=auditar` o `--tarea=prompt` y `--agente=cline`, error: «es tarea de
    Claude».
  - (h) La sugerencia «apariencia» solo se añade si no se pasó `--tarea`; si se pasó, solo
    con `--tarea=apariencia`.
- **E2. `scripts/test-gen-contexto.mjs`**, con su fila en `scripts/README.md` junto a
  test-orden: «no prueba un módulo: prueba el índice y el generador».
  - Ejecuta `process.execPath scripts/gen-contexto.mjs` con la raíz como cwd. **Nunca usa
    `--salida`.**
  - Los casos se escriben en el propio test.
  - Las aserciones son **de inclusión y de exclusión sobre la estructura** (las filas
    «- **X** →» y las rutas citadas en ellas). **Nunca snapshot.**

  | Caso | `--tarea` | Rutas | Debe citar | No debe citar |
  |---|---|---|---|---|
  | T1 | bug | `app/components/calendario-asistencia-alumno.tsx` `app/actions/asistencias.ts` `lib/escolar/asistencia/asistencias.ts` `lib/escolar/ciclo/calendario.ts` | MAPA-DEL-SISTEMA | MATRIZ-UX |
  | T2 | crear | `lib/escolar/alumno/informacion-personal.ts` `supabase/crear-rpc-obtener-perfil-alumno.sql` | ORDEN · marca de revisión (supabase) | — |
  | T3 | ciclo | `lib/escolar/ciclo/calendario.ts` `supabase/agregar-fk-calendario-periodo.sql` | CICLO_EVALUACIONES_MODULO · marca de revisión | — |
  | T4 | rendimiento | `lib/escolar/materia/materia-vista-alumno.ts` `app/actions/calificaciones.ts` | `remedir-rendimiento` · aviso de historial | MATRIZ-UX |
  | T5 | permisos | `lib/auth/permisos.ts` | MATRIZ-PERMISOS · marca de revisión | — |
  | T6 | — | `scripts/diag-calendario-periodo.mjs` | scripts/README | CICLO_EVALUACIONES_MODULO |
  | T7 | rendimiento | `lib/escolar/materia/materia-vista-alumno.ts` | aviso de historial | — |
  | T8 | crear,arquitectura | `lib/escolar/` | ORDEN · filosofia.estructural | — |
  | T9 | arquitectura | `lib/auth/permisos.ts` `scripts/test-orden.mjs` | diag-peso-cambio · marca de revisión ×2 | — |
  | T10 | auditar (cline) | `app/actions/calificaciones.ts` | exit ≠ 0 | — |
  | T11 | peticion | `app/actions/asistencias.ts` | FLUJO-TECNICO | — |
  | T12 | horario | `lib/escolar/horario/horario-importar.ts` | HORARIO_SEMANAL_MODULO | — |
  | T13 | prompt (cline) | `lib/auth/types.ts` | exit ≠ 0 | — |
  | T14 | apariencia | `app/globals.css` | MATRIZ-UX | — |

  Más:
  - **Casos negativos**:
    - `--tarea=inexistente` → exit ≠ 0;
    - `--tarea=ui` → exit ≠ 0, o una salida sin «arquitectura»;
    - una ruta con `\` equivale a la misma ruta con `/`;
    - `sintoma` equivale a `síntoma`.
  - **Siempre**: el paquete de Cline contiene `CONTRATO (obligatorio):` y ocupa ≤ 8 KB.
  - **Rama claude**: solo smoke (exit 0), porque depende de `.panel/`, que no existe en el
    CI.
  - **Rojos conocidos**: van en una lista nominal `ROJAS_CONOCIDAS = ["T1:…", …]`. La suite
    falla si aparece un rojo que no está en la lista, y avisa si uno de la lista pasa a
    verde para que se borre.
- **En el mismo commit**:
  - `ESTADO-ACTUAL.md:122` pasa a «**52 suites**». Lo exige `verificar-estado-actual`.
  - `:125` pasa a «Dos de las 52 no prueban un módulo: `test-orden` (el repo) y
    `test-gen-contexto` (el índice y el generador)». Sin líneas nuevas.

### REGLAS
La suite solo lee: no escribe archivos ni toca la red. Los casos no se escriben en
`00-INDICE.md`, que está en el arranque.

### VALIDACIÓN
```bash
node scripts/test-gen-contexto.mjs     # verde, salvo ROJAS_CONOCIDAS
node scripts/test-orden.mjs            # C10: la suite nueva tiene fila
npm run verificar:estado               # 52 suites
npm run test:ci
```

---

### INFORME
Por cada parte, en el chat y en el mensaje del commit (DECISIÓN 4):
- archivos tocados;
- tokens del arranque antes y después (contra la base LF);
- salida de `npm run test:ci`;
- lo que marcaron las mediciones previas (B4, D4, E2) y qué hiciste con ello;
- lo que NO pudiste verificar, y lo que dejaste sin hacer y por qué.

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

> En este prompt, el «diagnóstico» del punto 1 es la MEDICIÓN de cada parte. El punto 5 lo
> cumple `npm run test:ci`, que lo incluye; la Parte C3 lo deja escrito así.

---

## PARA CLAUDE — no se envía a Cline

- [x] Pedir al usuario las DECISIONES 1, 2, 6 y 10 (RETRO §7) y escribirlas en el bloque
  DECISIONES antes de enviar C.
- [x] Antes de C: copiar tal cual `REGLAS_NO_HACER.md:13-36` y `:186-214` a
  `docs/historial/BITACORA-2026-09.md`, bajo «Incidente P0 — movido de REGLAS
  (AAAA-MM-DD)».
- [x] Antes de D (no aquí: los redactó el implementador de D en los documentos; ver
  EJECUCIÓN): escribir `[LITERALES D1]`, una fila «síntoma → 2-4 archivos → suite» por
  cada dominio (administración, portada/oEmbed, seguimiento médico, mensajes y
  notificaciones, navegación Océano y calificaciones B); `[LITERALES D2]`, el paso 1 sobre
  `/oceano` (`app/oceano/page.tsx` → `contenido-docente-oceano.tsx:130`) y la línea del
  modelo B; `[LITERALES D3]`, las 6 rutas actuales de `MATRIZ-UX:113-118`; y la cuarta
  ancla rota.
- [x] Después de D:
  - [x] índice de `docs/historial/auditorias/README.md` con lo movido en D5;
  - [x] bloque «Vigencia (revisado AAAA-MM-DD)» al principio de
    `OPTIMIZACION_RENDIMIENTO_400_500.md`: la línea base que se puede volver a medir, lo
    superado y lo abierto con su archivo:línea;
  - [x] en ese mismo bloque, cómo buscar por id las optimizaciones aplicadas
    (`git grep` de O1, O5, O9 y 6A-n en `lib/` y `app/`);
  - [x] en ese mismo bloque, que en FASE 10 hubo ≤ 300 peticiones en vuelo, no 1 000; que
    `:1400` dice «FASE 6» donde debe decir «FASE PRE-3»; y que O1 ≠ O-1;
  - [x] en `docs/historial/README.md:28`: «las mediciones son anteriores al refactor».
- [x] Archivar los informes de Q, R, S y T (a partir de sus commits) y el de V.
- [x] Memoria propia corregida el 2026-10-04: los hechos de proyecto remiten a
  `pendientes.json` o a ESTADO.
- [ ] Revisar cada parte contra CONTRATO §2. En B, comprobar a mano que
  `--confirmar-carga` va antes de leer `.env.local` y que ningún script imprime una CURP.
  (Parcial: ver EJECUCIÓN.)

---

## EJECUCIÓN Y RETROALIMENTACIÓN (2026-10-04 → 2026-10-06)

No lo ejecutó Cline. Lo ejecutó Claude (Opus 5.5) a pedido del usuario, con las DECISIONES
recomendadas, en un flujo de agentes. En A–E hubo tres agentes por parte: un
**implementador**, sin commit; un **auditor** independiente, que solo propone, contra
CONTRATO §2/§3 y la filosofía; y un **cierre**, que aplica la auditoría, repite
`npm run test:ci` y firma. F y el cierre final, un único agente. Antes de enviarlo, dos
críticos revisaron la RETRO y este prompt, y sus correcciones ya están en el texto de arriba:
por ejemplo, la cabecera prohíbe ejecutar `_peligrosos/` y `fase10-*` «tampoco para
validar», cuando el borrador de la VALIDACIÓN de B lo pedía.

Commits: A `48b8d53` · prompt y RETRO `19dc335` · B `03eb384` · C `5e4e8c9` · D `67863b7` ·
E `84c26aa` · F (casillas de PARA CLAUDE) `62ee492` · informe final, el commit que añade esta
sección. Informe: `docs/historial/informes/INFORME-PROMPT-V.md`. El límite de uso cortó la
ejecución tres veces, una de ellas en mitad del cierre de E; se reanudó por partes, porque
cada parte es un commit (detalle en el Resumen del informe).

| Punto del prompt | Qué pasó | Corrección que la ejecución le hace al prompt |
|---|---|---|
| Cabecera: «se envía una parte por mensaje» (a Cline) | Lo ejecutó Claude con implementador, auditor y cierre. Los auditores encontraron 24 issues que el implementador no vio (4 medios, 20 bajos) | Si lo ejecuta Claude, decirlo en la cabecera y mantener un auditor independiente por parte: el implementador no se audita a sí mismo |
| Cabecera: base «~10 344», y el delta de cada parte «contra esa base» | A midió 10 345 (redondeo por archivo); B subió a 10 347 por RUMBO, y C partió de ahí | La base de cada parte es el cierre de la anterior, medida con `verificar-docs`, no una cifra de la cabecera |
| A4: «`:262` y `:235`» | Solo `:262`: en `:235`, `irreversible` sería una variable sin usar | Antes de citar dos líneas para un mismo arreglo, comprobar que el símbolo se usa en las dos |
| A: el alcance no nombraba `scripts/README.md` | La fila de `gen-contexto` describía un uso que pasaba a salir con 1; la corrigió el cierre | Una parte que cambia el contrato de un script nombra también su fila del README (ORDEN §4) |
| B1: ocultar «el valor impreso» en las líneas citadas | El grep no veía volcados de filas ni literales (`6i` llevaba la contraseña real de un tutor), y la CURP es credencial. Se amplió a más scripts, y 13 operativos quedaron marcados, no enmascarados | Separar en el OBJETIVO los scripts de credenciales de los operativos, y pedir la decisión sobre las CURPs antes de enviar |
| B2 y B4: C18 y C6 con su control positivo | El auditor abrió huecos: el import sin `;`, `rpc(variable)` y el método con backtick o en minúsculas | La VALIDACIÓN de un guardián nuevo pide también las mutaciones que debe rechazar, no solo el hallazgo conocido |
| B → D1: «`MAPA:90` y `:93`, para D1» | El implementador de D no lo recogió; lo hizo el cierre | Lo que una parte deja a otra se copia a la lista de la parte que lo recibe, no solo al informe |
| C7: `verificar-estado-actual` cuenta los commits desde la última edición | El comentario y el paso del workflow, y la señal de `gen-estado`, seguían describiendo el check viejo | Al cambiar lo que mide un verificador, nombrar todos los textos que lo describen (workflow, panel, README) |
| C10 y §26 de `criterios.prompts` | §26 decía «Tests, TypeScript y ESLint», contra CONTRATO §1.5. Se arregló en su forma mínima, y la remisión a ORDEN §6 quedó sin dueño, porque D no la nombraba | Si una parte fija una lista que otro normativo duplica, la deduplica en esa misma parte |
| PARA CLAUDE «Antes de D: `[LITERALES]`» y la REGLA de D, «si falta alguno, detente» | No se escribieron aquí. El implementador de D (Claude) los redactó en los documentos, y el auditor encontró 4 errores que corrigió el cierre | Una parte que depende de una casilla de PARA CLAUDE sin marcar no se envía. Si la ejecuta Claude, la casilla es el paso 0 de la parte y pasa por la auditoría |
| Líneas citadas: `gen-rumbo.mjs:90`, `docs/historial/README.md:28`, «`:1400` dice FASE 6» | Estaban en `:99` y `:30`; la tercera, tras insertar el bloque de Vigencia, en `:1425` | Citar por texto o por encabezado. En un documento al que se le inserta un bloque, nunca por línea |
| D4: los nombres sueltos, contra lo que hay «en el repo» | Con `git ls-files` a secas, un módulo nuevo sin `git add` contaba como ausente | «En el repo» = lo indexado más lo no ignorado sin seguimiento (`--others --exclude-standard`), si existe en disco |
| E1(b): `--diag` cita el script y su fila | Le decía a Cline «Córrelo» también con `fase10-carga` o `migrar-*`. El cierre lo vetó por prefijo y por la marca de la fila | Todo mecanismo que mande correr un script aplica la Clasificación del README (`ESCRIBE`, `CARGA`, `DESTRUCTIVO`, salida sensible) |
| E2: coste de la suite, «2-3 s, una ejecución de test-orden» | ≈ 9,5-20 s y 19 ejecuciones de `test-orden --json` | Medir el coste de una suite antes de declararlo |
| E: el literal «Dos de las 52» para ESTADO-ACTUAL | Se escribió «Dos de ellas»: `verificar-estado-actual` no vigila esa segunda cifra | Revisar los literales del prompt contra su propia DECISIÓN «Cifras» |
| PARA CLAUDE: «revisar cada parte contra CONTRATO §2… que ningún script imprime una CURP» | Los auditores revisaron A–E contra §2/§3; F y el cierre final no tuvieron auditor. `--confirmar-carga` está en `:30`, antes de leer `.env.local` (`:65`). 13 operativos siguen imprimiendo CURPs, marcados | La casilla queda parcial hasta que el usuario decida sobre las CURPs (decisión 1 del Resumen del informe) |
| Ejecución en un solo flujo largo | Tres cortes por el límite de uso; el tercero, entre la sección del informe y el commit de E | Un commit por parte como unidad de reanudación, y guardar en el scratchpad lo que devuelve cada agente, para que otro cierre pueda retomarlo |
