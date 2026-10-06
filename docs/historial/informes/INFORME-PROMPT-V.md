# INFORME — PROMPT V (documentación para agentes)

Fecha: 2026-10-04. Ejecutado por Claude (no Cline) a pedido del usuario, con las
decisiones recomendadas (bloque DECISIONES del prompt). Base: `b184b01`. El prompt
está en `docs/historial/prompts/PROMPT_V_DOCUMENTACION_PARA_IA.md` y su porqué en
`docs/historial/auditorias/RETRO-AUDITORIA-DOCS-IA-2026-10-04.md`.

**Cómo leer este informe.** Cada parte pasó por tres agentes: un **implementador**
que hizo el cambio sin commit, un **auditor** independiente que lo revisó contra el
CONTRATO (`docs/normativo/CONTRATO-DE-CAMBIO.md` §2 y §3) y la filosofía, y un
**cierre** que aplicó los ajustes de la auditoría, volvió a validar y firmó el
commit. Cada sección de parte tiene las 7 subsecciones de la DECISIÓN 2: qué se
hizo, quién y con qué límites, cómo se midió, qué normas respetó, el veredicto
frente a la filosofía y la arquitectura, las desviaciones y lo que queda sin
verificar. El «Resumen» lo rellena el cierre final, cuando estén todas las partes.
Las cifras son fotos del 2026-10-04: la fuente viva es el script que las mide.

## Resumen

| Parte | Estado | Commit | Agentes | Veredicto filosofía |
|---|---|---|---|---|

---

## Parte A — Las herramientas de contexto fallan en voz alta

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte A: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (los 2 ajustes, aplicados en el cierre)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `scripts/verificar-docs.mjs` | `pesa()` lee el Buffer y resta los bytes `0x0D`: mide lo versionado, igual que el CI. Línea fechada nueva bajo el párrafo de `TECHO_TOKENS` (el párrafo no se editó). `TECHO_TOKENS` sigue en 10500 | A1 |
| `scripts/gen-contexto.mjs` | `leer()` pasa CRLF → LF. `\` → `/` en las rutas, una vez, al leer los argumentos. `--tarea` por palabra completa y sin tildes (NFD); si una no casa, exit 1 con la lista de tareas válidas. Exit 1 si el presupuesto da 0 filas o si falta el CONTRATO (rama cline). `reglasOrden()` devuelve `null` si test-orden falla, y la rama claude escribe «no se pudo leer test-orden» | A2 |
| `scripts/gen-contexto.mjs` | `--salida` solo bajo `docs/historial/prompts/`; no pisa un archivo existente sin `--forzar` y nunca una carpeta. Cabecera JSDoc actualizada (QUÉ ESCRIBE y SALE CON 1) | A3 |
| `scripts/diag-peso-cambio.mjs` | `:262` desestructura `irreversible` (ya lo devolvía `pesar()`) | A4 |
| `scripts/README.md` | Fila de `gen-contexto.mjs`: `--salida=docs/historial/prompts/X.md`, `--forzar` y los casos de exit 1 | Ajuste 1 de la auditoría (cierre) |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Este informe (DECISIÓN 4) | Cierre |

Diff de los scripts, sin contar los CR: +137/−28 (README incluido).

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer A1-A4 en lugar de Cline, sin commit | Leer el repo y `docs/historial/`; correr la VALIDACIÓN y `test:ci` antes y después; probar los fallos en una copia aislada del scratchpad, con la versión de `b184b01` como control positivo | Reproducir en el árbol real el fallo CRLF del CONTRATO, el presupuesto vacío o test-orden ilegible: habría que editar normativos o mover scripts. Comprobar la cifra en el CI de GitHub: no hay push. Tocar `scripts/README.md`: la parte no lo nombra (CONTRATO §2, alcance) |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de A y la filosofía | Re-ejecutar la VALIDACIÓN, `tsc`, eslint de los 3 scripts y los `--check`; repetir los fallos en su propia copia; comparar byte a byte el paquete de Cline nuevo con el de `b184b01` en 5 casos válidos | Re-ejecutar el build: lo dejó al cierre, porque `app/` no importa los `.mjs`. Corregir: un auditor no edita, solo propone (2 issues de severidad baja) |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Editar `scripts/README.md` (ajuste 1) y corregir en este informe la frase de `cambio`/`cualquier` (ajuste 2); repetir la VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Push: lo prohíben las reglas duras. Incluir el prompt V y la RETRO, que siguen sin seguimiento: no son archivos de la parte |

Ninguno de los tres tocó la base de datos, la red, `scripts/_peligrosos/`, `scripts/_archivo/`, `fase10-*` ni los 7 cambios ajenos del árbol.

### 3. Cómo se ejecutó y se midió

| Comando de VALIDACIÓN | Antes (`b184b01` + ajenos) | Después (cierre) |
|---|---|---|
| `npm run verificar:docs` | exit 0 · 10 485 tokens con CR (techo 10 500, margen aparente 15) | exit 0 · **10 345** tokens sin CR, igual que el CI · 0 rutas muertas |
| `gen-contexto --tarea=inexistente lib/auth/types.ts` | exit 0 y la misma salida que sin `--tarea` | exit 1 · mensaje y lista de las 13 tareas |
| `gen-contexto --tarea=sintoma lib/escolar/ciclo/calendario.ts` | exit 0 sin «Localizar un bug… síntoma» (la fila de ciclo salía solo por la sugerencia automática) | exit 0 con esa fila · idéntico byte a byte a `--tarea=síntoma` |
| `gen-contexto "app\actions\asistencias.ts"` | exit 0 sin «Tocar permisos…» | exit 0 con «Tocar permisos…» · idéntico a la ruta con `/` |
| `diag-peso-cambio lib/auth/permisos.ts` | «→ **Claude**» y luego `ReferenceError: irreversible`, exit 1 | exit 0 · TOTAL 3/14 → **Claude** («toca la AUTORIZACIÓN») · `--calibrar` sigue en 7/8 |
| `npm run test:ci` | EXIT 0 | EXIT 0 · 51/51 suites · test-orden 17 reglas OK · test-permisos 738/0 · auditoría de permisos 309/0 · `--check` de matriz, invariantes y rumbo al día · `verificar:estado` OK · build OK · lint: 1 aviso previo (`gen-panel.mjs:41` `MARCA`), ninguno nuevo |

**Tokens del arranque**: 10 485 con CR → 10 345 sin CR. Delta contra la base LF: **0**, porque no se tocó ninguno de los 8 archivos del arranque; la bajada de 140 sale solo de medir sin CR. Margen real hasta `TECHO_TOKENS = 10500`: **155**. El prompt decía «~10 344»; la cifra exacta es 10 345 por el redondeo por archivo.

**Casos de fallo**, probados en una copia aislada con la versión de `b184b01` como control:

| Caso | `b184b01` | Ahora |
|---|---|---|
| CONTRATO en CRLF | exit 0 con «(no se pudo leer CONTRATO-DE-CAMBIO.md §1)» | exit 0 y el paquete lleva el CONTRATO |
| CONTRATO sin bloque | exit 0 con el paquete sin CONTRATO | cline: exit 1 · claude: exit 0 (no lo usa) |
| Encabezado del presupuesto renombrado o sin `00-INDICE.md` | exit 0 con la lista vacía | exit 1 (también con `--tareas`) |
| Sin `scripts/test-orden.mjs`, `--agente=claude` | afirmaba «Ninguna regla… arrastra deuda viva» | «no se pudo leer test-orden» en las dos secciones |
| `--salida` fuera de `docs/historial/prompts/`, con `..`, absoluta, la carpeta, vacía o en una subcarpeta inexistente | escribía donde fuera | exit 1, sin escribir nada |
| `--salida` a un archivo existente | lo pisaba | exit 1 sin `--forzar`; con `--forzar` lo sobrescribe |

El paquete de Cline para entradas válidas es **idéntico byte a byte** al de `b184b01` en 5 casos (lo comprobó el auditor): no cambió contenido fuera de A.

### 4. Qué normas respetó

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| Ajenos intactos (reglas duras) | sí | Diff vacío con `--ignore-cr-at-eol --ignore-blank-lines` sobre los 7; el commit lleva solo rutas concretas |
| RESULTADO A1 | sí | 10 345 = suma de los blobs de HEAD / 4; párrafo fechado intacto y línea nueva debajo; techo sin tocar |
| RESULTADO A2: CRLF, exit 1 sin CONTRATO, con 0 filas o `--tarea` sin fila | sí | Copia aislada con control positivo; en el repo, `--tarea=inexistente` da exit 1 |
| RESULTADO A2: palabra completa y NFD | sí | `sintoma` = `síntoma`; `modificar`, `migracion`, `legacy`, `decision` y `permiso` dan exit 1; `ui` casa con la fila de apariencia y no con «arquitectura» |
| RESULTADO A2: `\` → `/` una vez | sí | Salida idéntica con `\` y con `/`; `capaDe`/`suitesDe` ya no normalizan por su cuenta |
| RESULTADO A2: rama claude sin test-orden | sí | «no se pudo leer test-orden»; ya no afirma «ninguna deuda» |
| RESULTADO A3 | sí | 10 rutas inválidas con exit 1; el hash del prompt V no cambió |
| RESULTADO A4 | sí | exit 0 y veredicto Claude; `:235` no usa `irreversible` |
| REGLAS de A: sin cambiar el paquete fuera de A, sin dependencias | sí | 5 paquetes idénticos byte a byte; ningún import nuevo |
| §2 Alcance: solo lo pedido | sí | Los 3 scripts de A + la fila del README que pidió la auditoría + este informe |
| §2 Alcance: legacy en pie (R8) | sí | No se borra nada; siguen el agente por defecto `cline` y el campo `claves` |
| §2 Alcance: sin fuente paralela (R6) | sí | Todo se lee de `00-INDICE`, CONTRATO §1 y `test-orden --json` |
| §2 Capas | n/a | Solo `scripts/`; no toca `lib/`, `app/` ni actions |
| §2 Datos | n/a | Sin esquema, sin base, sin `supabase/` |
| §2 Identidad | n/a | No toca dominio |
| §2 Verificación: tsc, suites, build | sí | `test:ci` en verde en el cierre (incluye los tres) |
| §2 Verificación: medición antes y después con el mismo script | sí | Tabla de la sección 3 |
| §2 Verificación: nada de `_peligrosos/` ni `_archivo/` | sí | Solo scripts de solo lectura permitidos |
| §2 Documentación: ESTADO-ACTUAL y MAPA §2 | n/a | No cambia ninguna regla estructural ni cierra deuda de `pendientes.json` |
| §2 Documentación: informe en `docs/historial/informes/` | sí | Este archivo (DECISIÓN 4) |
| ORDEN §4: `scripts/README.md` describe el contrato del script | sí | Era «no» en la auditoría; corregido en el cierre (ajuste 1) |
| §3 Motivos de rechazo inmediato | sí | Ninguno: sin `_peligrosos/`, sin migración, sin segunda fuente, con medición; la única cifra a mano es la línea fechada que pide A1 |
| Umbrales, `TECHO_TOKENS` y regeneradores | sí | 17 reglas OK; los `--check` al día; no se tocó `pendientes.json` ni ninguna Server Action |
| Finales de línea | sí | `gen-contexto` y `verificar-docs` en CRLF en el árbol; `diag-peso-cambio` y `README` en LF; `git diff --check` limpio |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15: fuente única | respeta | El script sigue sin reescribir nada; si la fuente falta, ahora se para en vez de inventar una lista vacía. El README ya no describe un uso que falla |
| §16: medir antes y después | respeta | Antes y después de todos los comandos, más los fallos con control positivo; el cierre lo repitió |
| R8: el legacy no se retira antes de tiempo | respeta | `cline` por defecto (por los prompts archivados) y `claves` (lo usan las sugerencias automáticas, que son de la Parte E) |
| Reutilizar antes de crear | respeta | A4 usa el `irreversible` que `pesar()` ya devolvía; `listaTareas()` sirve a `--tareas` y al error |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | Medir sin CR no afloja: el CI ya medía 10 345, y ahora local y CI coinciden |
| Economía del arranque | respeta | Delta 0, margen 155 |
| ORDEN §4: dónde va cada cosa | respeta | Cambios dentro de los scripts, cabecera JSDoc y fila del inventario alineadas |
| Fallar en voz alta (objetivo de la parte) | respeta | Cada caso que antes daba exit 0 con un resultado incompleto sale con 1 y un mensaje, o está corregido |
| Capas e identidad | n/a | Herramientas de documentación, sin dominio |

**Veredicto global:** la Parte A sigue la filosofía y la arquitectura del repo; lo único que cambia es que las herramientas, cuando no pueden leer su fuente, lo dicen y se paran.

### 6. Desviaciones y decisiones propias

**Desviaciones**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| A4: el ESTADO cita `:262` y `:235` | Solo `:262` | `irreversible` solo se usa después de `:262`; en `:235` (bucle de `--calibrar`) sería una variable sin usar y eslint avisaría |
| Validación «`--tarea=sintoma` casa síntoma» | Ningún cambio de código; aclaración | Antes ya salía la fila de ciclo, pero por la sugerencia automática; la de «síntoma» no salía y ahora sí |
| Fallo CRLF del CONTRATO | Probado en una copia aislada | En esta copia el CONTRATO está en LF; no se cambian los finales de un normativo solo para probar |
| Fila de `gen-contexto` en `scripts/README.md` | La editó el cierre, en el commit de A | La pidió la auditoría (ajuste 1): la B5 no recoge esa fila y quedaría describiendo un uso que ahora sale con 1 |

**Decisiones propias del implementador**
- `pesa()` resta todos los `0x0D`, no solo los de `\r\n`: local y CI coinciden aunque un archivo se versione con CRLF.
- `--tarea` casa si sus palabras aparecen **enteras y seguidas** en el nombre de la fila. Admite tareas de varias palabras («ciclo escolar», «Server Action»), y el singular «permiso» ya no casa con «permisos».
- **Corregido en el cierre (ajuste 2)**: el implementador escribió que «cambio» y «cualquier» solo casan con la fila 0. No es así: por palabra completa, «cambio» casa también con «Auditar un cambio antes de aceptarlo», y «cualquier» con «Ejecutar cualquier script» (comprobado: cada una añade esa fila). Las palabras vacías («o», «de», «un») casan con varias filas; es inocuo, pero conviene saberlo.
- Las comprobaciones de `--tarea` y del CONTRATO van al leer los argumentos: el script falla pronto y nunca escribe a medias. La de 0 filas corta también `--tareas`.
- La comprobación del CONTRATO solo aplica a la rama cline; la claude no lo usa.
- `reglasOrden()` devuelve `null` (no `[]`) si test-orden falla, si el JSON es inválido o si no trae reglas.
- `--salida`: `\` → `/`, `path.resolve` y `path.relative` dentro de la carpeta; error claro si la subcarpeta no existe; una carpeta nunca se sobrescribe, ni con `--forzar`.
- La normalización de rutas se hace una sola vez; se quitó el `replace` redundante de `capaDe()` y `suitesDe()`, sin cambio en la salida.
- Si falta `00-INDICE.md` o el CONTRATO, `presupuesto()` y `contrato()` devuelven vacío o `null` en vez de lanzar ENOENT, para salir con el mensaje claro.

**Nota para la Parte E.** Si E1(g) («es tarea de Claude») se implementa mirando la fila casada, `--tarea=cambio --agente=cline` daría ese error, porque «cambio» casa con «Auditar un cambio…». E1(g) debe comprobar el literal pedido (auditar o prompt), o asumir ese caso a propósito. Las 11 tareas de la tabla E2 ya son válidas, y `ui` cumple el caso negativo tal como está escrito.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| La cifra 10 345 en el CI real de GitHub | no verificado | No hay push. La equivalencia sale de la suma de los blobs de HEAD y de la cifra del ESTADO ACTUAL del prompt |
| Los fallos (CRLF, presupuesto vacío, test-orden ilegible) en el árbol real | verificado solo en copia | Reproducirlos exigiría editar normativos o mover scripts |
| Suite propia de `gen-contexto` | pendiente | La crea la Parte E (E2) |
| `docs/historial/prompts/PROMPT_V_DOCUMENTACION_PARA_IA.md` y la RETRO | sin seguimiento | No son archivos de la parte; que decida el cierre final si van en un commit |
| Aviso de lint en `gen-panel.mjs:41` (`MARCA`) | previo | Ajeno a la Parte A |
| `--tarea=cambio` con E1(g) | a vigilar | Ver la nota para la Parte E en la sección 6 |

---

## Parte B — Scripts: ni secretos en la salida ni una cuarentena que se pueda desarmar

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte B: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (el issue medio y los dos bajos de `test-orden`, aplicados en el cierre; el de `MAPA:90` queda para D1)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `diag-credenciales-duplicadas.mjs` | CLAVE de profesores y alumnos y CURPs → grupo A, B… con su recuento; la CURP sale `[oculta]` | B1 |
| `verificar-login-credenciales-iniciales.mjs` · `verificar-credenciales-iniciales.mjs` | contraseña y CURP → `[oculta]`; cada fila se nombra por los 8 primeros caracteres de `tutor_id` | B1 |
| `6j-verificar-password-tutor.mjs` | CURP del tutor y del alumno, contraseña inicial y el valor que coincide → `[oculta]` o el nombre del campo | B1 |
| `diagnostico-login-tutor.mjs` | `clave=` y `curpAlumno` → `[oculta]`; la cabecera ya no dice «NO expone contraseñas» sin serlo | B1 |
| `migrar-marcar-claves-compartidas-profesores.mjs` | CLAVE por profesor (también en el dry-run) → `[oculta]` con su grupo; la cabecera, sin los valores | B1 |
| `migrar-crear-tecnico.mjs` · `migrar-crear-administracion.mjs` | técnico: sin el literal de la clave, exige `--clave=` (≥ 6) antes de leer `.env.local` y no la imprime; administración: no repite la que llega por `--clave=` | B1 |
| `6i-diagnostico-login-tutor.mjs` · `diag-profesor-alcance.mjs` · `probe-profesores-data.mjs` · `probe-materias-alumnos.mjs` | 6i: la contraseña literal de un tutor real pasa a `--pw=`; alcance: `profesor_clave` (la CLAVE) solo como recuento; los dos probes: volcados con CLAVE y CURP → `[oculta]` | B1 (extra) |
| `scripts/_peligrosos/*.mjs` (23) | +1 línea: `throw new Error("CUARENTENA: …")` como primera sentencia tras los `import` | B2.1 |
| `scripts/test-orden.mjs` | C18 nueva (DURA, fuente crudo, falla también con la carpeta vacía); C6 ve el método HTTP sobre el fuente sin comentarios y con cadenas (`codigoDesnudo({ conservarCadenas })`), con la excepción nominal `C6_RPC_DE_LECTURA`; C10 apretado de 34 a 19 | B2.2 · B4 · B5 |
| `scripts/test-orden.mjs` | C18: el `import` acaba en su especificador, no en el primer `;`. C6: `rpc(variable)` quita la exención; el método se ve con backtick, con la clave entre comillas y en cualquier caja. Las comillas de esas regex van como `\x22`, `\x27` y `\x60` | Cierre (issues bajos 2 y 3) |
| `.clineignore` | `+ scripts/_peligrosos/`; fuera la línea `contexto.feliz` (ruta inexistente) | B2.3 |
| `fase10-carga.mjs` · `fase10-perfil-datos.mjs` | carga: `--confirmar-carga` en `:30`, antes de `.env.local` (`:65`) y del primer `fetch` (`:122`); `--x=v` y `--x v`. Perfil: cabecera `--runs=N`; panel directivo con la consulta de la app (`SELECT_TUTOR` copiada con cita, `order(created_at desc)`, credenciales en lotes de 50) | B3 |
| `scripts/README.md` | `CARGA`; una etiqueta por `gen-`; filas propias (3 probes de PATCH, `fase10-*`, `6j`, `diag-sql-aplicado`, `diagnostico-login-tutor`, la serie `f0…f8` por nombre); sin cifras derivables; la sospecha remite a ESTADO §5; «sin fila = `ESCRIBE`»; regla de credenciales | B1 · B5 |
| `scripts/README.md` | La regla se amplía a todo script que imprima una CURP, y 12 filas lo marcan: «salida sensible: no ejecutar desde Cline (imprime CURPs)» | Cierre (issue medio 1) |
| `RUMBO.md` | Regenerado en el cierre sobre `19dc335`: publica C10 = 19 | B5 |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Esta sección | Cierre |

Diff de la parte sin contar los CR ni este informe: 41 archivos, +310/−97 (`test-orden` +99/−8, README +55/−32).

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer B1-B5 en lugar de Cline, sin commit | Leer código e historial para diagnosticar; medir antes y después; mutar `test-orden` con copia byte a byte y restaurarlo (comprobado con `cmp`); `node --check` de los 38 scripts editados; probar aislado el parser de `fase10-carga`; `test:ci` | Ejecutar los scripts editados (credenciales, `_peligrosos/`, `fase10`, probes): lo prohíben la cabecera y la parte. Confirmar en la base que la RPC desplegada es la del `.sql`. Decidir si se enmascaran las CURPs de los diagnósticos operativos: cambia herramientas, lo dejó para Claude o el usuario |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de B y la filosofía | Repetir la VALIDACIÓN barata, el control positivo de B4 y los `--check`; revisar el diff línea a línea; probar en el scratchpad los dos huecos (import sin `;`, `rpc(variable)`) y su arreglo | Corregir: un auditor solo propone (1 issue medio, 3 bajos). Ejecutar scripts que conectan a Supabase |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Marcar las 12 filas y ampliar la regla (issue 1); endurecer C18 y C6 (issues 2 y 3) y probarlos aislados con los casos del auditor; regenerar RUMBO; VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Editar el MAPA (issue 4): es de D1. Push: prohibido. Enmascarar las CURPs operativas: decisión del usuario (ver §6) |

Ninguno de los tres ejecutó un script de `_peligrosos/`, `_archivo/`, `fase10-*` ni de credenciales, ni conectó con Supabase, ni tocó los 7 archivos ajenos.

### 3. Cómo se ejecutó y se midió

Orden del implementador: MEDICIÓN → B1 → B2 (throw → C18 en verde → `.clineignore`) → B3 → B4 (control positivo antes de declarar la excepción) → B5 → C10 → `gen-rumbo` → VALIDACIÓN. El cierre: issues → `test-orden` antes/después con el mismo comando → VALIDACIÓN → `test:ci`.

| Medición | Antes (sin B) | Después (cierre) |
|---|---|---|
| `node scripts/test-orden.mjs --detalle` | 17 reglas OK. C6 = 0, pero solo miraba `.insert/.update/.upsert/.delete/.rpc(`. C10 34/34. C11 21/21 | 18 reglas OK. C6 = 0 viendo también el método HTTP. **C10 19/19**. C11 21/21. **C18 = 0**. Con los arreglos del cierre, salida idéntica a la de antes de aplicarlos |
| `git grep -niE "console…(clave\|contrase\|password\|inicial\|curp)"` (vivos) | 94 líneas; 9 scripts de credenciales imprimían valor o CURP, 2 probes volcaban filas con CLAVE y 6i tenía como literal la contraseña de un tutor real | 97 líneas revisadas: ningún script de credenciales imprime valor ni CURP. Quedan `clave_tutor` (público), la clave al azar de administración (una vez, si se generó) y CURPs en 13 scripts operativos, marcados en 12 filas del README |
| Control positivo de B4 (método HTTP sin excepción, 93 scripts vivos) | 1 hallazgo: `diag-materias-alumno.mjs:37` POST, la RPC de lectura `obtener_perfil_alumno` | El mismo hallazgo, también con la regex ampliada del cierre |
| `git grep -L "CUARENTENA" -- scripts/_peligrosos/` | los 23 | vacío |
| `git grep -n "confirmar-carga" scripts/fase10-carga.mjs` | nada | comprobación en `:30`; `.env.local` en `:65`; primer `fetch` en `:122` |
| `node scripts/gen-rumbo.mjs --check` | al día | al día (regenerado sobre `19dc335`, C10 = 19) |
| Tokens del arranque (`verificar:docs`) | 10 345 | **10 347** (+2, solo por RUMBO); techo 10 500 sin tocar; 0 rutas muertas |
| `npm run test:ci` | verde | **verde, exit 0**: tsc; lint 0 errores y 1 aviso previo (`gen-panel.mjs:41`); 51/51 suites; test-permisos 738/0; auditoría de permisos 309/0; `--check` de matriz, invariantes y rumbo al día; `verificar:estado` OK; `verificar:docs` OK; build OK |

**Pruebas de que los guardianes muerden** (implementador con mutaciones en el árbol, restauradas; cierre con las funciones extraídas de `test-orden.mjs` y probadas aparte):

| Caso | Resultado |
|---|---|
| Sin la línea `throw` / con una sentencia antes / comentarios entre imports y `throw` | C18 falla / falla / pasa |
| `import fs from "node:fs"` sin `;` + `fetch` con DELETE + `throw` (hueco del auditor) | antes del cierre pasaba; **ahora falla** |
| Import sin `;` seguido del `throw` · import de efecto lateral · shebang con CRLF | pasa · pasa · pasa |
| `diag-materias-alumno` con `rpc("eliminar_ciclo")` / con `const n = "eliminar_ciclo"; rpc(n)` | C6 falla / antes del cierre pasaba, **ahora falla** |
| Método con backtick · `"method": "DELETE"` · `method: "patch"` | antes no se veían; **ahora C6 los marca** |
| Método en comentarios · `GET` · `POSTER` | no marca nada |

### 4. Qué normas respetó

Del checklist del auditor; la columna «Cumple» es la suya, con lo que hizo el cierre donde cambió algo.

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| B1 · líneas citadas: `[oculta]`, grupos opacos con recuento, nunca una función del valor | sí | `etiqueta()` es un índice por orden; diff revisado línea a línea |
| B1 · cabecera de `diagnostico-login-tutor`, `--clave=` en el técnico, README:155 con recuentos, regla en Clasificación | sí | `--clave=` antes de `.env.local`; el literal ya no está en el árbol; «19, en dos grupos: 16 y 3» |
| B2 · `throw` en los 23, regla DURA sobre el fuente crudo, `.clineignore` | sí | `git grep -L` vacío; C18 = 0. El hueco del import sin `;` se cerró en el cierre |
| B3 · `--confirmar-carga` antes de `.env.local` y de todo `fetch`; ambas formas; perfil alineado | sí | `:30` < `:65` < `:122`; consulta idéntica a `tutores-credenciales.ts` |
| B4 · método HTTP sobre fuente con cadenas, exclusión solo en esa detección, excepción con motivo, control positivo | sí | Control repetido por auditor y cierre: solo `diag-materias-alumno:37`. El hueco de `rpc(variable)` se cerró en el cierre |
| B5 · etiquetas, filas, sin cifras, ESTADO §5, «sin fila = ESCRIBE», C10 ≤ 21 y RUMBO | sí | C10 = 19; RUMBO publica 19 y va en el commit |
| OBJETIVO 1 y VALIDACIÓN · «ninguno imprime valor ni CURP» | no → **estrechado y marcado en el cierre** | Los de credenciales cumplen. 13 operativos siguen imprimiendo CURPs; su fila lo marca y la decisión queda para el usuario (§6) |
| §2 Alcance: solo lo pedido, extras justificados | sí | Extras dentro del OBJETIVO (§6) |
| §2 Alcance: legacy en pie (R8) | sí | Sin borrados ni `git mv` |
| §2 Alcance: sin fuente paralela (R6) | sí | Sin módulo común de enmascarado; `SELECT_TUTOR` copiada con cita (inevitable: `server-only`) |
| §2 Capas · Datos · Identidad | n/a | Solo `scripts/` y documentación; sin esquema ni lógica de identidad |
| §2 Verificación: tsc, suites, build, medición antes/después | sí | Tabla de la sección 3 |
| §2 y §3 · nada de `_peligrosos/` ni `_archivo/` ejecutado; sin migración; sin cifras a mano | sí | Validación estática; la cifra de C10 la publica `gen-rumbo` |
| Reglas duras · ajenos intactos, índice vacío, finales de línea | sí | Diff de los 7 ajenos vacío con `--ignore-cr-at-eol --ignore-blank-lines`; `git add` con rutas concretas; `test-orden` sigue en CRLF (694/694) y el README en LF |
| `TECHO_TOKENS` y umbrales | sí | 10 500 intacto; C10 34 → 19; C6 y C18 duras en 0 |
| §2 Documentación (ESTADO, MAPA §2, informe) | sí | B no cambia nada que recojan; la línea de ORDEN es de C8; este informe |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15 · fuente única | respeta | El README pierde cifras en vez de actualizarlas; C10 lo publica `gen-rumbo`; la copia de `SELECT_TUTOR` está citada |
| §16 · medir antes y después con el mismo instrumento | respeta | Misma batería antes y después; el cierre comparó `test-orden --detalle` y `--json` antes y después de sus arreglos: idénticos |
| R8 · el legacy no se retira | respeta | Los 23 de `_peligrosos/` se conservan, desarmados |
| Reutilizar antes de crear | respeta | `codigoDesnudo` gana una opción; la excepción sigue el patrón de `ONCONFLICT_NO_LITERAL_PERMITIDO` |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | C10 baja a 19; C18 nace dura |
| Economía del arranque | respeta | +2 tokens, solo por RUMBO |
| ORDEN · dónde va cada cosa | respeta | Regla en `test-orden`, inventario en el README, exclusión en `.clineignore`; la línea normativa, en C8 |
| Guardianes que fallan en voz alta | respeta | Los dos matices del auditor (import sin `;`, `rpc(variable)`) están cerrados; una forma de import que C18 no reconoce hace fallar la regla, no la deja pasar |
| Ninguna salida de diagnóstico expone credenciales | respeta en parte | Los de credenciales, sí. Los operativos siguen imprimiendo CURPs, ahora con la marca y la decisión pendiente |

**Veredicto global:** la Parte B sigue la filosofía y la arquitectura del repo: convierte dos reglas en prosa (la cuarentena y «los diagnósticos no escriben») en guardianes mecánicos que muerden; el único objetivo que queda a medias, el de las CURPs, está a la vista y espera una decisión.

### 6. Desviaciones y decisiones propias

**Desviaciones**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| B1 más allá de las líneas citadas | CURPs de `diag-credenciales:98`, `6j:60/:90`, `verificar-credenciales-iniciales:37`; `diag-profesor-alcance:63`; los volcados de dos probes; el eco de `--clave=` en administración; el literal de 6i → `--pw=` | El OBJETIVO pide que ningún diagnóstico imprima una credencial; el grep no ve volcados ni literales |
| B5 · etiqueta propia también en `gen-panel`, `gen-matriz-permisos`, `gen-invariantes` y `gen-seccion4` | Cada uno dice lo que escribe | También escriben y figuraban como `LEE(fs)` o sin etiqueta |
| B3 · también la consulta de tutores de `fase10-perfil-datos` | `SELECT_TUTOR` + `order(created_at desc)` | El panel directivo lanza las dos consultas |
| README · «Con guarda (de escritura o de carga)» y la fila de `test-orden` sin «Diecisiete reglas» | Título y texto | `fase10-carga` tiene guarda pero no escribe; la cifra quedaba falsa con C18 |
| C18 falla con `_peligrosos/` vacío · el técnico exige `--clave=` sin generar una al azar | — | Un guardián que mide 0 no protege; generar la clave obligaría a imprimirla |
| **OBJETIVO 1 estrechado (cierre)** | Los 13 scripts que imprimen CURPs sin ser de credenciales se **marcan**, no se enmascaran: `7-diagnostico-materias-alumnos`, `diag-alcance-tutor`, `diag-inscripciones-duplicadas`, `-reactivacion`, `-vs-roster`, `diag-materias-alumno`, `diagnostico-ciclo-activo-bug`, `p0-verificar-restauracion`, `probe-curp`, `probe-materias-alumnos` y `probe-schema-tabla` (en la fila de los probes), `migrar-deduplicar-inscripciones` y `migrar-marcar-decision-manual` | La CURP es credencial (la CLAVE del alumno son sus 6 últimos caracteres, `claveDesdeCurp`; la contraseña inicial del tutor, los 8 últimos). Pero enmascararla cambia herramientas operativas (cruce con el roster, deduplicar) y no se pueden ejecutar para comprobarlas. El riesgo concreto es que la salida entre en el contexto de Cline, y la marca lo cubre |

**Decisión pendiente para el usuario:** en los diagnósticos `LEE`, (a) sustituir la CURP por nombre + grupo o por el id de la fila, o (b) conservarla con la marca, como ahora. En los dos `migrar-*` y en `probe-curp` la CURP es la clave de trabajo: lo razonable es (b).

**Decisiones propias**
- Implementador: C18 salta shebang, comentarios e `import` (no `import(` ni `import.meta`) y compara la primera línea con `trimEnd`. La excepción de C6 solo exime un POST a `/rest/v1/rpc/` si todas las RPC del archivo están declaradas. Etiquetas opacas de una línea por script (sin módulo común) y sin imprimir la longitud. C10 apretado a lo medido (19), no a 21.
- Cierre: en C18, el `import` termina en su especificador con `;` opcional, y una forma que no reconoce devuelve −1 (C18 falla). En C6, cualquier `rpc(` con nombre no literal quita la exención, y la regex de método admite backtick, clave entre comillas y cualquier caja. Las comillas de esas regex se escriben `\x22`, `\x27`, `\x60` para no desalinear el escáner de `test-orden.mjs`, que C6 también recorre (es un `test-`). RUMBO, regenerado justo antes del commit.

**Para D1** (issue bajo 4, no se edita aquí): `docs/sistema/MAPA-DEL-SISTEMA.md:90` manda a `diagnostico-login-tutor.mjs` y `verificar-login-credenciales-iniciales.mjs`, que ahora son «salida sensible: no ejecutar desde Cline». Añadir «(salida sensible: los ejecuta Claude o una persona)». En `:93`, `6i-diagnostico-login-tutor.mjs` pide ahora `--pw=`.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| Las salidas enmascaradas, la guarda de `fase10-carga` y la consulta de `fase10-perfil-datos` en vivo | no verificado | Ejecutarlos está prohibido; validación estática (`node --check`, diff, parser aislado, mutaciones) |
| Que la `obtener_perfil_alumno` desplegada sea solo SELECT | no verificado | Sin acceso a la base; la excepción de C6 se apoya en el `.sql` del repo |
| Cambio de clave del técnico y del tutor de 6i | pendiente, de persona | Sus literales salieron del árbol pero siguen en el historial (`b184b01`); purgarlo es destructivo. Confirmar o forzar el cambio |
| CURPs reales en el repo: 5 CSV de `scripts/_archivo/` (~1 250 líneas), fixtures de `test-rediseno-oceano.mjs:652-653` (una da la contraseña inicial del tutor de 6i), 7 probes de `_peligrosos/`, `docs/historial/` | pendiente, decisión | Ocultarlas en la salida protege poco mientras el repo las tenga: la medida real es rotar las claves derivadas de la CURP |
| La clave compartida de profesores publicada en ESTADO-ACTUAL, GLOSARIO, CONTRATO, MAPA y REGLAS | pendiente | El «grupo A (16)» de `diag-credenciales` se invierte leyendo el arranque; la mitigación es el pendiente `claves-compartidas-profesores` (forzar el cambio) |
| Enmascarar las CURPs de los 13 operativos | decisión del usuario | Ver §6 |
| «`probe-*` (los 16 que quedan aquí)»: hoy son 17 | pendiente | Parte C (ninguna cifra derivable a mano) |
| «hoy faltan 35» (C10) y «las once reglas» en `test-orden.mjs` | pendiente | Parte D5 |
| Filas de `6i-listar-tutores`, `6k-verificar-clave-tutor` y 17 `probe-*` | deuda de C10 (19) | No lo pedía la parte |
| Línea normativa de la cuarentena en ORDEN · `MAPA:90` y `:93` | pendiente | C8 · D1 |
| `6j-verificar-password-tutor.mjs:30` usa por defecto el usuario (nombre real) de una tutora | sin tocar | No es credencial |
| El escáner de `test-orden` no entiende literales de regex | a vigilar | Hoy 0 falsos positivos en 93 scripts vivos; las regex nuevas no llevan comillas literales |
| Un `import … with { type: "json" }` en `_peligrosos/` haría fallar C18 | a vigilar | Falla en voz alta, no deja pasar; ninguno de los 23 lo usa |

---

## Parte C — Una sola verdad en el arranque y en las normas

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte C: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (4 issues bajos: los tres primeros, aplicados en el cierre; el cuarto, en su forma mínima, y la unificación de `criterios.prompts` §26 queda para D)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `docs/historial/BITACORA-2026-09.md` | Sección nueva «Incidente P0 — movido de REGLAS_NO_HACER (2026-10-04)» con la copia literal de `b184b01:REGLAS_NO_HACER.md:13-36` y `:186-214` (comparada con diff: idéntica) | Pre-paso PARA CLAUDE |
| `docs/sistema/pendientes.json` · `RUMBO.md` | Objeto `inscripciones-2do-a-rh` literal, tras `filas-sin-periodo`; RUMBO regenerado en el mismo paso | C1 |
| `scripts/verificar-docs.mjs` | Línea fechada con la DECISIÓN 1 bajo la de A1. `TECHO_TOKENS` sigue en 10500 | C0 |
| `docs/normativo/REGLAS_NO_HACER.md` | Cabecera del P0 → remisión a la BITACORA y a `INFORME-PROMPT-1` §T4; R3 (verificación y diagnóstico); R5 (`periodo_id`, `obtenerCalendarioDePeriodo`, pendiente `fk-calendario-periodo`); punto 4 del checklist; fuera «Deuda…» y «Consolidación…» | C1 |
| `docs/normativo/GLOSARIO.md` | Sin `"AGO2026-ENE2027"`; «Trampa activa» nueva; «tablas físicas legado»; fila «Calificaciones (modelo B)» y fuera el blockquote; la CLAVE remite al pendiente | C2 |
| `docs/normativo/CONTRATO-DE-CAMBIO.md` | §1.5 = `test:ci` + suite (sigue en 12 líneas); §2: una casilla `test:ci`, identidad de calificaciones, archivo del informe, `gen:matriz`/`gen-rumbo`, INVARIANTES; §3: la CLAVE remite al pendiente | C3 |
| `AGENTS.md` | Sin «~37 KB», «~500 KB» ni «~800 KB»; migraciones (CONTRATO §1.3); «Al terminar: `npm run test:ci`»; nivel 3 = DECISIÓN 10; `diag-peso-cambio` y ORDEN §6; fila de Cline; párrafo de «aflojar» | C4 |
| `docs/00-INDICE.md` | Sin «~500 KB» ni «~37 KB»; 6 filas del presupuesto; sin «138» ni «(6 roles)»; `docs/historial/` en una frase; fila `supabase/*.sql`; filas `pendientes.json` y `TOKENS-OCEANO.css` | C5 |
| `README.md` | Roles → `ROLES_PORTAL`; `test:suites` sin cifra; fila `test:ci` | C6 |
| `ESTADO-ACTUAL.md` · `scripts/verificar-estado-actual.mjs` | Fuera la cabecera «HEAD:»; SQL pendiente de la portada; identidad de materia = modelo B; deuda 3 «en retirada»; §8 remite a AGENTS. El verificador cuenta los commits desde la última edición (`git log -1` + `rev-list --count`), con la misma tolerancia y las mismas claves `--json` | C7 |
| `scripts/README.md` | Fila de `verificar-estado-actual.mjs` alineada con C7 | C7 (implementador) |
| `docs/normativo/ORDEN.md` | «otro rol» y «se añadió `tecnico`»; fuera la fila `_borrador/`; `lib/escolar/` y `*-puro` en la tabla de imports; familias `administracion/` y `portada/`; prefijos de §4 con contrato o «se trata como `ESCRIBE`»; líneas normativas C8, C9, C16, C17 y la cuarentena; excepción de C14; §6 con los 11 puntos; «Un prompt, un dominio…»; «(lo archiva Claude)» | C8 |
| `filosofia.estructural` · `docs/normativo/INVARIANTES.md` | Rutas con raíz y backticks en las líneas citadas; «Patrón actual» en un párrafo; §4 con `periodo_id`, `PROFESORES.ID` y `calificaciones`; §15; la línea `INVARIANTE:` termina en «…no la filosofía.»; línea de cabecera sobre `gen:invariantes`. INVARIANTES, regenerado | C9 |
| `criterios.prompts` | §4 «QUÉ RECIBE CLINE»; frase en §7; §12, §13, §19 y §24 → remisiones; §26 + «Medición antes/después»; «cuatro»; ruta de informes | C10 |
| `scripts/gen-rumbo.mjs` · `RUMBO.md` | Línea fija dentro del bloque (`LINEA_FIJA`, y `--check` la exige); sufijo `· persona`/`· agente`; reglas con su texto de `test-orden --json`. RUMBO regenerado | C11 |
| `scripts/gen-contexto.mjs` | Fuera «Además, siempre: …»; texto de «aflojar» en las ramas cline y claude; cabecera sin «~500 KB» | C12 |
| `.github/workflows/verificacion.yml` | El comentario de `fetch-depth: 0` describe el mecanismo nuevo; el paso pasa a «ESTADO-ACTUAL.md al día (commits desde su última edición + nº de suites)». Solo texto: C17 compara los `run:` | Issue 1 (cierre) |
| `scripts/gen-estado.mjs` | Señal `docs.frescura`: título «commits desde su última edición» y detalle «última edición `<sha7>`, HEAD `<sha>`». Las claves del JSON no cambian | Issue 2 (cierre) |
| `docs/historial/README.md` | Filas `contexto.feliz.md` y `BITACORA-2026-09.md` en «Contenido», al que ahora remite el 00-INDICE | Issue 3 (cierre) |
| `criterios.prompts` | §26 «Validación»: «Tests, TypeScript y ESLint» → «`npm run test:ci` y la suite del módulo» | Issue 4, forma mínima (cierre) |
| `scripts/README.md` | «`probe-*` (los 16 que quedan aquí)» → «(los que no tienen fila propia)»: hoy son 17 | Pendiente que la Parte B dejó a C (cierre) |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Esta sección | Cierre |

Diff de la parte sin contar los CR ni este informe: 22 archivos, +324/−364.

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer el pre-paso y C0-C12 en lugar de Cline, sin commit | Leer `docs/historial/` y el código para escribir R5 y el checklist (`calendario.ts:449`, `ciclo-estado.ts:289`); copiar el P0 y compararlo con diff; medir antes y después; regenerar RUMBO e INVARIANTES; `test:ci` dos veces | Confirmar en la base las 4 inscripciones de 2DO A RH, o que el SQL de `portada_carreras` sigue sin aplicar. Ejecutar `diag-calendario-periodo.mjs` (conecta a Supabase) y `gen-estado.mjs` (escribe `.panel/`). Dejar RUMBO y ESTADO exactos antes del commit |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de C y la filosofía | Recalcular la base desde HEAD (blobs sin CR / 4 = 10 347); comparar la copia del P0 con diff; repetir la VALIDACIÓN barata, `test-orden`, los tres `--check` y eslint de los 4 scripts; probar `gen-contexto`; comprobar los 7 ajenos | Corregir: solo propone (4 issues bajos). `test:ci` completo: se apoyó en el log del implementador |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Issues 1-3 completos y el 4 en su forma mínima; la cifra falsa de `probe-*`; VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Ejecutar `gen-estado.mjs` tras editarlo (escribe `.panel/`): validado con `node --check`, eslint y la plantilla evaluada aparte. Unificar §26 con ORDEN §6: C10 fijó su forma. Push: prohibido |

Ninguno de los tres tocó la base de datos, la red, `scripts/_peligrosos/`, `scripts/_archivo/`, `fase10-*`, ningún `.sql`, `lib/`, `app/` ni los 7 cambios ajenos del árbol.

### 3. Cómo se ejecutó y se midió

Orden del implementador: MEDICIÓN sobre `03eb384` → copia del P0 a la BITACORA (diff contra `b184b01`) → `pendientes.json` + `gen-rumbo` → poda de C1 → C0 y C2-C12 → `gen:invariantes` y `gen-rumbo` → VALIDACIÓN → `test:ci`. El cierre: issues → VALIDACIÓN → `test:ci` → informe → `test:ci` justo antes del commit.

| Medición | Antes (`03eb384` + ajenos) | Después (cierre) |
|---|---|---|
| `npm run verificar:docs` | exit 0 · **10 347** tokens · 0 rutas muertas | exit 0 · **9 720** tokens (−627) · 0 rutas muertas · techo 10 500 sin tocar |
| `git grep` de cifras de la VALIDACIÓN | **11**: AGENTS `:3`, `:14`, `:91`; README `:3`, `:26`; 00-INDICE `:4`, `:29`, `:71`; CONTRATO `:78`; GLOSARIO `:60`; ORDEN `:143` | **0** (exit 1) |
| `npm run verificar:estado` | OK, contra la cabecera «HEAD:» escrita a mano | OK · 144 líneas · 51 suites · aviso tolerado: 3 commits desde la última edición (`b184b01`); con este commit, 0 |
| `gen-invariantes --check` · `gen-rumbo --check` | al día | al día. Antes de regenerar, `gen-rumbo --check` daba DESFASADO, como se esperaba por el formato nuevo |
| `node scripts/test-orden.mjs` | 18 reglas · C10 19/19 · C11 21/21 | igual, también tras los cambios del cierre |
| `gen-contexto` | — | `--tareas` exit 0 (13 filas); `--tarea=inexistente` exit 1; el paquete lleva el punto 5 nuevo y el texto de «aflojar», sin «Además, siempre» |
| `npm run test:ci` | verde (cierre de B) | **verde, exit 0**: tsc; lint 0 errores y 1 aviso previo (`gen-panel.mjs:41` `MARCA`); 51/51 suites; test-permisos 738/0; auditoría de permisos 309/0; `--check` de matriz, invariantes y rumbo al día; `verificar:estado` OK; `verificar:docs` OK; build OK |

**Tokens del arranque**, por archivo (sin CR, la medida del CI):

| Archivo | Antes | Después | Delta |
|---|---|---|---|
| REGLAS_NO_HACER | 2 062 | 1 425 | −637 |
| ESTADO-ACTUAL | 2 000 | 1 947 | −53 |
| GLOSARIO | 1 996 | 1 938 | −58 |
| 00-INDICE | 1 829 | 1 830 | +1 |
| AGENTS | 1 302 | 1 358 | +56 |
| RUMBO | 537 | 601 | +64 |
| INVARIANTES | 476 | 476 | 0 |
| CLAUDE | 145 | 145 | 0 |
| **Total** | **10 347** | **9 720** | **−627** |

El OBJETIVO pedía coste neto ≤ 0, «en torno a 9 800». La base de esta parte es 10 347, no los 10 345 de A1, porque la Parte B regeneró RUMBO (+2). Los cambios del cierre no tocan ningún archivo del arranque.

### 4. Qué normas respetó

Del checklist del auditor; la columna «Cumple» es la suya, con lo que hizo el cierre donde cambió algo.

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| RESULTADO ESPERADO C0-C12 | sí | Diff de los 19 archivos revisado: los literales están donde el prompt pide; las 8 desviaciones, justificadas (§6) |
| Pre-paso: copia literal del P0 antes de podar | sí | diff de `b184b01:13-36 + 186-214` (sin CR) contra la BITACORA: idéntica. El encabezado contiene la cadena que cita REGLAS |
| §2 Alcance: solo lo pedido, extras justificados | sí | Extras: fila de `scripts/README.md`, BITACORA (pre-paso), INVARIANTES y RUMBO (regenerados), línea de la rama claude de `gen-contexto`. Los del cierre son los issues de la auditoría y la cifra de `probe-*` que B dejó a C |
| §2 Alcance: legacy en pie (R8) | sí | Sin código tocado; R5 nombra como excepción el fallback de `obtenerCalendarioDePeriodo` y la UNIQUE de texto; las excepciones `_borrador` de `verificar-docs` siguen porque otros docs las citan |
| §2 Alcance: sin fuente paralela (R6) | sí | La deuda 3 va a `pendientes.json`; ni documentos ni secciones nuevas salvo las pedidas (§26 y la BITACORA) |
| §2 Capas · Datos | n/a | Sin `app/`, `lib/`, `.sql` ni escritura en la base |
| §2 Identidad (periodos.id, PROFESORES.ID, `grupo_materia_id`, `periodo_id`) | sí | R5, checklist, GLOSARIO, CONTRATO §2, ESTADO §2 y filosofía §4 lo dicen así |
| §2 Verificación: `test:ci` en verde | sí | Implementador (dos veces) y cierre (tras los issues y antes del commit) |
| §2 Verificación: medición antes/después con el mismo script | sí | Sección 3; la base, recalculada por el auditor desde HEAD |
| §2 Verificación: nada de `_peligrosos/` ni `_archivo/` | sí | Solo los scripts permitidos; los que conectan a Supabase o escriben `.panel/` se declaran no ejecutados |
| §2 Documentación: ESTADO-ACTUAL si cambió una regla estructural | sí | Modelo B, deuda 3 en retirada, SQL de la portada; 144 líneas (≤ 150) |
| §2 Documentación: MAPA §2 si se movió una deuda | n/a | El prompt deja `MAPA:118` para D1: divergencia transitoria y prevista |
| §2 Documentación: `gen:matriz` / `gen-rumbo` en el mismo paso; INVARIANTES | sí | `pendientes.json` → RUMBO regenerado; ninguna Server Action cambiada; INVARIANTES solo regenerado; los tres `--check` al día |
| §3 Motivos de rechazo | sí | Ninguno: REGLAS cita la BITACORA como relato; 00-INDICE marca OPTIMIZACION como «línea base histórica» |
| `TECHO_TOKENS` y umbrales de `test-orden` | sí | `TECHO_TOKENS = 10500` igual; `test-orden.mjs` sin diff |
| Cifras derivables (DECISIÓN «Cifras») | sí | grep en 0; también «(6 roles)», «1 928 líneas» y, en el cierre, «16» de `probe-*`. Quedan cifras hoy ciertas que la parte no nombra (§7) |
| `verificar-estado-actual`: tolerancia y claves `--json` | sí | `headDeclarado` = sha de la última edición; `commitsAtras` = 3; aviso por encima de 1, fallo por encima de 10; sin sha, fallo explícito |
| Ajenos intactos, `git add` con rutas concretas | sí | Diff vacío de los 7 con `-w --ignore-cr-at-eol --ignore-blank-lines` |
| Finales de línea | sí | Cada archivo conserva los suyos (CRLF o LF); RUMBO e INVARIANTES, en LF por su generador; `git diff --check` limpio en los del cierre |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15 · fuente única | respeta | La deuda viva va a `pendientes.json` y el relato a la BITACORA; las cifras remiten a su fuente (`ROLES_PORTAL`, `scripts/test-*.mjs`, MATRIZ §5, el pendiente de claves, `verificar:docs`); criterios §12, §13, §19 y §24 pasan a remisiones. Queda §26 de criterios como segundo esquema de informe (para D) |
| §16 · medir antes y después | respeta | Mismos comandos antes y después: 10 347 → 9 720 tokens y 11 → 0 cifras |
| R8 · legacy no se retira | respeta | Sin código tocado; el fallback y la UNIQUE de texto quedan nombrados como excepción |
| Reutilizar antes de crear | respeta | `pendientes.json`, la BITACORA, el verificador reorientado y `LINEA_FIJA` dentro de `gen-rumbo`; ningún documento nuevo |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | `test-orden` sin diff; el texto de «aflojar» llega a AGENTS y a `gen-contexto` |
| Economía del arranque | respeta | −627 tokens: REGLAS (−637) paga AGENTS (+56) y RUMBO (+64) |
| ORDEN · dónde va cada cosa | respeta | Pendiente en `docs/sistema/`, relato en `docs/historial/`, reglas en su sección de ORDEN; las familias nuevas coinciden con el disco |
| Generados no se editan a mano | respeta | INVARIANTES y RUMBO salen de su generador; `gen-rumbo --check` detecta ahora que se borre la línea fija |
| Lo que el CI comprueba lo dicen sus textos | respeta | El cierre alineó con C7 el comentario y el paso del workflow y la señal del panel |

**Veredicto global:** la Parte C sigue la filosofía y la arquitectura del repo: el arranque es más corto, ya no copia cifras derivables y dice una sola verdad sobre calificaciones (modelo B), calendario (`periodo_id`), validación (`test:ci`) y autoridad (DECISIÓN 10).

### 6. Desviaciones y decisiones propias

**Desviaciones del implementador**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| C5 · fila de MATRIZ-PERMISOS | Además de «138», quitó «(6 roles)» | Cifra de roles a mano en la misma fila; la DECISIÓN «Cifras» manda `ROLES_PORTAL` |
| C7 · «Última revisión» de ESTADO | 2026-10-04 (PROMPT V, Parte C) | La regla del archivo: se actualiza en el cambio que lo vuelve falso |
| C7 · `scripts/README.md` | La fila del verificador describe el check nuevo | Si no, describiría uno que ya no existe |
| C10 · título de §4 | «CLINE YA CONOCE EL PROYECTO» → «QUÉ RECIBE CLINE» | El cuerpo nuevo dice que no conserva conocimiento |
| C11 · `gen-rumbo --check` | DESFASADO también si falta la línea fija (`faltaLineaFija`) | No depende de git; sin esto, borrarla a mano pasaba el CI |
| C12 · rama claude y cabecera de `gen-contexto` | Texto de «aflojar» y sin «~500 KB» | Citaba a AGENTS por un texto que C4 quitó, y decía «bajar», la dirección opuesta |
| C9 · cabecera de filosofía | La línea de `INVARIANTE:` en dos renglones | En uno rompe la caja de 80 columnas |
| C8 · fila de la raíz en ORDEN | Módulos sin `.ts` | Estilo del resto de la fila |

**Desviaciones y decisiones del cierre**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| Issue 3, `docs/historial/README.md` | Aplicado ya, no «después de D» | El hueco lo abre C5 en este mismo commit (el 00-INDICE remite a ese README) y cuesta 0 tokens de arranque. La tarea de `:28` (OPTIMIZACION) sigue siendo de después de D |
| Issue 4, `criterios.prompts` §26 | Solo la forma mínima: «Validación» = `test:ci` + suite | «Tests, TypeScript y ESLint» contradecía CONTRATO §1.5 y la DECISIÓN «Validación». Convertir §26 en remisión a ORDEN §6 desharía la lista que C10 fijó: queda para D |
| Issue 2, `gen-estado.mjs` | Aplicado (opcional, trivial) | El panel mostraba «declara `<sha de 40>`», que ya no es lo que mide |
| `scripts/README.md` · `probe-*` | «(los 16 que quedan aquí)» → «(los que no tienen fila propia)» | Era falsa (hoy 17) y el informe de la Parte B la dejó a C. Las otras cifras a mano que quedan son ciertas hoy: van a D (§7) |

**Decisiones propias del implementador**
- BITACORA: la sección va al final, con una línea de origen (`b184b01`, líneas, C1) y las dos copias separadas por una línea en blanco, en CRLF como el archivo.
- REGLAS: el texto nuevo de la cabecera va como párrafo, no como blockquote; R1 queda sin el `---` delante, porque `:8-38` lo incluía.
- GLOSARIO: la fila del modelo B va al final de la tabla Materia; la «Trampa activa» conserva su arranque.
- AGENTS, nivel 3: REGLAS, el resto de `docs/normativo/` y `criterios.prompts`; en la forma de trabajo mandan ORDEN y CONTRATO, en los principios `filosofia.estructural`.
- 00-INDICE: la fila de rendimiento pierde también «(1 928 líneas…)».
- `verificar-estado-actual`: `headDeclarado` guarda el `%H` completo; si git no da el sha, es fallo; lo no committeado no cuenta.
- ORDEN: C9 en §1, C8 en §2, C18 y C17 en §4, C16 en §5, la excepción de C14 en su blockquote. Contratos de los prefijos según el README de B, y fila nueva «cualquier otro prefijo» = `ESCRIBE`. §6 con los 11 puntos; el 10 enumera las 7 secciones del informe.
- filosofía: se conserva la etiqueta «Patrón actual del proyecto (debe mantenerse):» y se cambia solo su cuerpo.
- criterios: §19 conserva «si una validación falla, corregirla», que no está en el CONTRATO; §26 gana «### Medición antes/después».
- gen-rumbo: `LINEA_FIJA` es una constante; `/^persona/i` también casa «persona - …».

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| Las 4 inscripciones activas en 2DO A RH | no verificado | Sin base; el pendiente queda con `revisado` 2026-09-03 y `verificar: null` |
| Que el SQL de `portada_carreras` siga sin aplicar | no verificado | Sin base; ESTADO remite al pendiente `sql-portada-carreras` |
| `diag-calendario-periodo.mjs`, que cita la R3 nueva | no ejecutado | Conecta a Supabase. Que `validarIntegridadCiclo` cuente por `periodo_id` se comprobó leyendo el código |
| `gen-estado.mjs` con el verificador nuevo y el texto del cierre | no ejecutado | Escribe `.panel/`. Comprobado leyendo `:207-213`, con la salida `--json` del verificador, `node --check`, eslint y la plantilla evaluada aparte |
| RUMBO tras el commit | a vigilar | Dirá `main · 03eb384`, 1 commit por detrás (tolerado hasta 10); ESTADO quedará en 0 |
| `MAPA-DEL-SISTEMA` §2a sin «deuda 3 en retirada» | pendiente | D1, como prevé el prompt |
| `criterios.prompts` §26 como remisión a ORDEN §6 punto 10 | pendiente | D o una nota (issue 4) |
| Cifras a mano que la parte no nombra y hoy son ciertas: «16 principios» (AGENTS `:8`, 00-INDICE), «21 copias sobrantes» (ORDEN `:93`, fila de `test-orden` en `scripts/README.md`) | pendiente | La de C11 se deriva de `test-orden`: candidatas para D. Las «81 filas» del GLOSARIO son un hecho histórico fijo |
| Rutas sin raíz de `filosofia.estructural` fuera de las líneas citadas (§12, cabecera) | pendiente | D4(d) |
| `docs/historial/README.md:28`: «las mediciones son anteriores al refactor» | pendiente | Claude, después de D (PARA CLAUDE) |
| Aviso de lint en `gen-panel.mjs:41` (`MARCA`) | previo | Ajeno a la Parte C |

---

## Parte D — docs/sistema y el mapa describen el presente

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte D: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (los 2 issues medios y los 8 bajos, aplicados en el cierre)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `docs/sistema/MAPA-DEL-SISTEMA.md` | «las familias de ORDEN §1b»; 3 anclas rotas llevadas al archivo que define el símbolo (`asistencia-estados.ts`, `contexto-ciclo-reparar.ts`, `horario-importar-validacion-puro.ts`); `:92` → `resolverAccesoAlumno` (rama maestro) → `profesorTieneAccesoAlumno`, y `nivelAccesoProfesor` pasa a la fila de Documentos; `:53` → las actions que importan los `paso-*.tsx`; `:72` con `promedioActividades` (modelo B); `:76` RPC + fallback O1; `lib/oembed/`; deuda 3 «en retirada»; `asistencia-estados.ts` en la fila de asistencia; 6 filas de dominio nuevo (subsección «Portal Océano, administración escolar y avisos» y modelo B) | D1 |
| ídem | `carga-academica.ts` en el paso de alumnos; `asistencias.ts` deja de llamarse «barril»; «un `contenido-*.ts` por familia de roles»; nota de `fase10-perfil-datos`; `:90` con «salida sensible» y `:93` con `--pw=` | Cierre: issues 2, 3, 4 y 8 · pendiente de B para D1 |
| `docs/sistema/FLUJO-TECNICO.md` | Sin conteos ni «(N L)»; paso 1 sobre `/oceano`; cuarta ancla rota (`:62` → `asistencia-plantillas.ts::generarPlantillaAsistencia()`); modelo B en §4; oEmbed en §1; fuera `*-client.tsx` y «el módulo más grande del repo»; deuda 3 en retirada | D2 |
| ídem | `asistencias.ts`; los `fetch()` a mano sin cifra, con el seguimiento de enlaces cortos de TikTok | Cierre: issues 3 y 5 |
| `docs/sistema/MATRIZ-UX.md` | `:113-118`: las 6 rutas viejas son `redirect("/oceano")`, con su pieza del shell y su `contenido-*.ts` | D3 |
| ídem | La nota de `:103` y la fila `/oceano` ya no hablan de rutas vivas; `MAPA_POR_ROL`, que no existe, → `MAPA`/`pestanasDe` (`:128` y `:405`) | Cierre: issue 7 · decisión propia |
| `docs/sistema/MATRIZ-PERMISOS.md` | `:81` sin «138»; `:84` y `:647` dicen la misma frase sobre §4 | D3 |
| `docs/sistema/modulos/CICLO_EVALUACIONES_MODULO.md` | `:85`: identificado por `periodo_id` (F5); `ciclo_escolar` es legado | D3 |
| `scripts/verificar-docs.mjs` | Bloque 3: (a) anclas, (b) rutas de `pendientes.json`, (c) listas de arranque ⊆ `ARRANQUE`, (d) nombres sueltos con rangos `a..b` y `NOMBRES_AUSENTES_A_PROPOSITO`; claves `--json` aditivas | D4 |
| ídem | `git ls-files --cached --others --exclude-standard`, filtrado por lo que existe en disco; un solo normalizador de citas (`rutaDeCita`) para los bloques 2 y 3 | Cierre: issues 1 y 9 |
| `scripts/README.md` | Fila de `verificar-docs` con el punto (3); en el cierre, qué cuenta como «en el repo» | D4 · issue 1 |
| 7 × `git mv` | PROMPT_E y PROMPT_F → `docs/historial/prompts/`; EVALUACION-REPO, PENDIENTES-2026-09-16, SOSTENIBILIDAD, MIGRACION-MATERIAS-A-ID y CALIFICACIONES-Y-BOLETAS → `docs/historial/auditorias/`. Renombres al 100 % | D5 |
| `scripts/test-orden.mjs` | Fuera el quinto argumento de C8 y C9, «las once reglas» y «hoy faltan 35». Umbrales intactos | D5.1 |
| `pendientes.json` · `eslint.config.mjs` · `gen-rumbo.mjs` · `test-calificaciones-puro.mjs` | Rutas nuevas del historial; el `doc` de `prompt5-parte-b` → `PROMPT_CLINE_B4_PURO_VS_IO.md` | D5 |
| `docs/sistema/pendientes.json` | `remedir-rendimiento` sin la premisa falsa, con C-1, C-2, C-3 y P0-3/6B por `archivo:línea` y `verificar: null`; nuevo `rotar-pat-y-bypass`, literal | D6 |
| ídem | P0-3/6B con la caché O5 (10 min por instancia, `urls-server.ts:12-16`); «todos los roles» en vez de «los 5 roles» | Cierre: issue 6 |
| `RUMBO.md` | Regenerado con `gen-rumbo` (HEAD `5e4e8c9`); el cierre no lo cambia | D6 |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Esta sección | Cierre |

Diff de la parte sin contar los CR ni este informe: 13 archivos, +296/−73, más 7 renombres sin cambios.

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer D1-D6 en lugar de Cline, sin commit | Leer el código y `docs/historial/` para redactar los literales y comprobar cada ruta con `git ls-files --error-unmatch`; implementar D4 primero en modo informe y luego como fallo; control positivo en un clon; `git grep` antes de cada `git mv`; VALIDACIÓN y `test:ci` | Correr `diag-*`, `probe-*` o `fase10-perfil-datos`, porque conectan a Supabase: las filas nuevas citan tres diag sin ejecutarlos. Editar `supabase/crear-calificaciones-normalizadas.sql:6`, por la regla. Hacer las tareas «Después de D» de PARA CLAUDE: no son de la parte |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de D y la filosofía | Contrastar cada afirmación nueva con el código; repetir verificar-docs, test-orden, los tres `--check`, verificar-estado, test-permisos (738/0), test-calificaciones-puro y eslint; su propio control positivo en un clon, con el que encontró el fallo del módulo sin `git add` | Corregir: un auditor solo propone (2 issues medios y 8 bajos). Correr `test:ci` completo: se apoyó en el del implementador |
| Claude, cierre | Aplicar la auditoría, volver a validar, informe y commit | Los 10 issues; el pendiente que B dejó a D1 (`MAPA:90`/`:93`); `MAPA_POR_ROL`; control positivo de los dos cambios de `verificar-docs` en un clon; VALIDACIÓN y `test:ci`; commit con rutas concretas | Hacer push: lo prohíben las reglas duras. Tocar lo de §7: las tareas «Después de D» y las afirmaciones caducadas que la parte no nombra |

Ninguno de los tres conectó con Supabase, ejecutó `scripts/_peligrosos/`, `scripts/_archivo/` o `fase10-*`, editó un `.sql` o tocó los 7 cambios ajenos del árbol.

### 3. Cómo se ejecutó y se midió

Orden del implementador: MEDICIÓN (`verificar:docs` + D4 en modo informe) → D1-D3 → D4 como fallo → D5 (`git grep` antes de cada `git mv`) → D6 + `gen-rumbo` → VALIDACIÓN → `test:ci`. El cierre: issues → control positivo en un clon → VALIDACIÓN → `test:ci` → informe.

| Medición | Antes (`5e4e8c9` + ajenos) | Después del implementador | Después del cierre |
|---|---|---|---|
| `npm run verificar:docs` | exit 0 · 9 720 tokens · 27 documentos · 0 rutas muertas | exit 0 · 9 720 · 20 documentos (7 movidos) · 0 | exit 0 · 9 720 · 20 · 0 |
| D4 (a) anclas rotas | 4 (recuento en seco): `FLUJO:62`, `MAPA:60`, `:70` y `:82`, todas a barriles | 0 | 0 |
| D4 (b) rutas de `pendientes.json` · (c) listas de arranque | 0 · 0 | 0 · 0 | 0 · 0 |
| D4 (d) nombres sueltos | 13 (≤ 15: no hubo que detenerse) | 0: D3 corrigió 6, 1 salió del corpus con el movimiento y 6 pasaron a excepciones con motivo | 0 |
| `git grep` de los 5 nombres movidos (sin historial ni `supabase/`) | rutas viejas en `pendientes.json` (×5), `eslint.config.mjs:19`, `gen-rumbo.mjs` y `test-calificaciones-puro.mjs:11` | 7 resultados, todos con la ruta nueva | igual |
| `gen-rumbo --check` · `test-orden` | al día · 18 reglas | al día · 18 reglas | al día · 18 reglas (C10 19). El cierre no cambia RUMBO: el `detalle` de un pendiente no se publica |
| `npm run test:ci` | verde (cierre de C) | verde | **verde, exit 0**: tsc; lint 0 errores y 1 aviso previo (`gen-panel.mjs:41`); 51/51 suites; test-permisos 738/0; auditoría de permisos 201 actions, 309/0; `--check` de matriz, invariantes y rumbo al día; `verificar:estado` OK; `verificar:docs` OK; build OK |

**Tokens del arranque:** 9 720 → 9 720. Delta 0 contra la base LF de esta parte, que es el cierre de C. D no edita ningún archivo del arranque; RUMBO se regeneró y sigue en 601.

**Controles positivos** (siempre en un clon del scratchpad, borrado al terminar):

| Caso | Quién | Resultado |
|---|---|---|
| Ancla a un barril, símbolo inexistente, ancla con raíz y `()` a un archivo borrado, nombre suelto inexistente, rango `f0..f9`, `doc` y `verificar` inexistentes en `pendientes.json`, archivo de más en las listas de AGENTS y 00-INDICE | implementador | exit 1 en todos; `f0..f8` pasa |
| 2 anclas, 2 pendientes, 1 lista y 2 sueltos inyectados (incluido `f0..f9`) | auditor | exit 1 |
| Módulo nuevo sin `git add`, citado como `nuevo-modulo-puro.ts::nuevaDecision` | auditor → cierre | antes del cierre: exit 1 (el issue 1). Ahora: exit 0 |
| Lo mismo más `inexistente-puro.ts` | cierre | exit 1, 1 suelto |
| `lib/escolar/fechas.ts` borrado del árbol pero aún en el índice, citado como `fechas.ts` | cierre | exit 1: cuenta como ausente |
| `lib/escolar/alumno/alumnos.ts:76-78` y `lib/escolar/no-existe.ts:76-78` en el corpus (bloque 2, normalizador único) | cierre | el primero pasa; el segundo es ruta muerta, exit 1 |

### 4. Qué normas respetó

Del checklist del auditor; la columna «Cumple» es la suya, con lo que hizo el cierre donde cambió algo.

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| RESULTADO ESPERADO D1-D6 | sí | Cada afirmación nueva, contrastada con el código por el auditor; sus correcciones, aplicadas en el cierre (§1) |
| §2 Alcance: solo lo pedido, extras justificados | sí | 13 archivos y 7 `git mv`. Extras: «única API externa» y «único fetch» en FLUJO, suites que ya existían en el MAPA, la fila del README. En el cierre: `MAPA:90`/`:93` (pendiente de B para D1) y `MAPA_POR_ROL` |
| §2 Alcance: legacy en pie (R8) | sí | No se borra nada. Las rutas viejas constan como redirect, las tablas físicas como legado, `ciclo_escolar` como legado y `ciclo-orquestador.ts` como «no lo importa nadie». Los movimientos no editan el contenido; el `.sql` no se toca |
| §2 Alcance: sin fuente paralela (R6) | sí | Sin documentos nuevos. `NOMBRES_AUSENTES_A_PROPOSITO` sigue el patrón de `AUSENTES_A_PROPOSITO`. La trampa `materia_id` = TEXTO sigue en GLOSARIO:44 y la decisión del techo, en C0 |
| §2 Capas · Datos | n/a | Solo documentos y scripts de verificación; sin esquema ni base |
| §2 Identidad (`periodo_id`, `PROFESORES.ID`, `grupo_materia_id`) | sí | `CICLO_EVALUACIONES:85`; la fila de mensajes del MAPA, «nunca por CLAVE»; el modelo B, por `grupo_materia_id` + CURP |
| §2 Verificación: `test:ci` en verde | sí | Implementador y cierre (exit 0, sobre el árbol final) |
| §2 Verificación: medición antes y después con el mismo script | sí | Sección 3: D4 en modo informe → fallo, y controles positivos de los tres agentes |
| §2 Verificación: nada de `_peligrosos/` ni `_archivo/` | sí | Solo los scripts de solo lectura permitidos |
| §2 Documentación: MAPA §2 al mover una deuda | sí | Deuda 3 «en retirada» en MAPA §2 y en FLUJO §6 |
| §2 Documentación: ESTADO-ACTUAL si cambió una regla estructural | n/a | Ninguna regla del código cambia; `ESTADO-ACTUAL:135` sigue siendo cierto |
| §2 Documentación: `pendientes.json` → `gen-rumbo` en el mismo paso | sí | `--check` al día, también tras el issue 6 |
| §2 Documentación: informe | sí | Esta sección (DECISIÓN 4) |
| Respeta INVARIANTES | sí | §15 (lo fechado sale del presente), §16 (medición), §14 (lo legado se marca) |
| §3 Motivos de rechazo inmediato | sí | Ninguno. Que `pendientes.json` apunte a `docs/historial/` lo manda el prompt (D5.3, D6): es el origen del pendiente, no estado actual |
| Reglas duras: ajenos, `git add`, finales de línea | sí | Diff de los 7 ajenos vacío con `--ignore-cr-at-eol --ignore-blank-lines`. `git add` con rutas concretas. Los CRLF siguen 100 % CRLF (`verificar-docs`, `test-orden`, MATRIZ-UX, CICLO) y los LF siguen LF |
| `TECHO_TOKENS` y umbrales | sí | 10 500 intacto; C10 en 19; en C8 y C9 solo cae el argumento de deuda, que no influye con umbral 0 |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15 · fuente única, sin documentos duplicados | respeta | Ningún documento nuevo. Lo que tenía hechos vivos ya estaba en su fuente antes de moverse (GLOSARIO:44, C0) |
| §16 · medir antes y después | respeta | D4 en modo informe para el recuento en seco y después como fallo; tres controles positivos independientes |
| R8 · el legacy no se retira | respeta | Rutas viejas, tablas físicas, `ciclo_escolar` y `ciclo-orquestador.ts` siguen en pie y documentados como legado |
| Reutilizar antes de crear | respeta (tras el cierre) | Reutiliza CORPUS, RAICES, `resuelve()` y el patrón de excepciones. El matiz del auditor (dos normalizadores de citas) se cerró: `rutaDeCita` sirve a los bloques 2 y 3 |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | Ningún umbral tocado |
| Economía del arranque | respeta | Delta 0 |
| ORDEN · dónde va cada cosa | respeta | Prompts ejecutados a `docs/historial/prompts/` y auditorías fechadas a `docs/historial/auditorias/` (ORDEN §6) |
| D2 y Parte C · sin conteos ni cifras derivables | no respetaba → respeta tras el cierre | Fuera «son dos» (FLUJO) y «los 5 roles» (`pendientes.json`). Quedan «9 FK nuevas», un hecho del intervalo FASE 10 → hoy que ningún script deriva, y «3 buckets» y «9 tablas» en FLUJO, que no son conteos de archivos del repo |

**Veredicto global:** la Parte D sigue la filosofía y la arquitectura del repo. El MAPA lleva del síntoma al archivo donde vive el símbolo, lo fechado salió del presente sin perder hechos vivos, y `verificar-docs` convierte «las anclas resuelven» en un guardián que falla en voz alta.

### 6. Desviaciones y decisiones propias

**Desviaciones**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| **Literales D1, D2 y D3, y la cuarta ancla** | Los redactó el implementador y los registró como decisión propia, no como desviación | El bloque `[LITERALES]` de PARA CLAUDE nunca se escribió en el prompt (la casilla sigue sin marcar), y la REGLA de D dice «No inventes los literales: si falta alguno, detente». El implementador es Claude, el mismo agente que debía escribirlos, y comprobó cada ruta con `git ls-files --error-unmatch`. El auditor los contrastó con el código: salieron los issues 2, 3, 4 y 5, corregidos en el cierre. La casilla del prompt archivado no se marca aquí: la marcará el cierre final con las demás |
| D5.3 · `gen-rumbo.mjs:90` | La cita estaba en `:99` y era un nombre suelto; ahora lleva la ruta completa | La línea se había movido desde `b184b01` |
| D3 · `MATRIZ-PERMISOS:84` | Conserva «Código ⇄ §4 (los 6 roles)» | Es el título literal de la sección en `test-permisos.mjs:251` |
| D1 · «Medir con» de las filas nuevas | Además de la suite, el diag de solo lectura cuando existe | Las filas existentes mezclan diag y suite, y `scripts/README.md` los clasifica `LEE` |
| Cierre · `MAPA:90` y `:93` | «salida sensible: los ejecuta Claude o una persona» y `--pw=` | El informe de B lo dejó «para D1» y el implementador no lo recogió |
| Cierre · `MATRIZ-UX:128` y `:405` | `MAPA_POR_ROL` → `MAPA` (se lee con `pestanasDe`) y `mapa-navegacion.ts::pestanasDe` | La constante no existe. El implementador la situó en `:34`; el auditor corrigió la ubicación (`:128` y `:405`). La segunda cita es ahora un ancla que D4 comprueba |
| Cierre · issue 1 | Además de `--others --exclude-standard`, la cabecera, el mensaje y la línea de salida dicen «del repo» en vez de «versionado» | Lo que cuenta ya no es solo lo versionado |
| Cierre · issue 9 | Un solo normalizador, que sube antes del bloque 2; los recorridos siguen siendo dos | El bloque 2 conserva su criterio de saltarse las citas con espacios o `()`. Fundir los recorridos cambiaba qué marca cada bloque sin ganar nada |

**Decisiones propias del implementador**
- D1: una fila por dominio. Cinco van en la subsección nueva y la del modelo B, en «Alumno, materias y calificaciones».
- D2: el paso 1 recorre `app/oceano/page.tsx` → `datosDocente` (capacidades ya resueltas por `puede()`) → `ShellOceano` → `piezaDe` → `AsistenciasPanel`. La línea del modelo B va en §4.
- D3: cada fila nombra la pieza del shell y su `lib/navegacion/contenido-*.ts`; las 15 rutas, comprobadas.
- MAPA: sale `validarAccesoProfesor`, que nadie llama. `ciclo-orquestador.ts` se anota como no importado, sin borrarlo (R8).
- FLUJO: además de quitar los conteos, corrige «única API externa», «único fetch», `*-client.tsx` y «el módulo más grande del repo».
- D4: (d) busca por sufijo de ruta, así que resuelve también rutas parciales. Un rango `a..b` exige cada elemento. (a) marca también un ancla con raíz y `()` a un archivo borrado. Si no puede leer git o `pendientes.json`, falla explícitamente.
- `pendientes.json`: `remedir-rendimiento` pasa a revisado el 2026-10-04 y `rotar-pat-y-bypass` va tras `rotar-password-supabase`.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| `diag-agenda-citas`, `diag-seguimiento-medico` y `diag-portada`, citados en las filas nuevas | no ejecutados | Conectan a Supabase. `scripts/README.md` los clasifica `LEE` |
| Que los síntomas de las filas nuevas se comporten como se describen | no verificado en ejecución | Se describen leyendo el código; el auditor los contrastó |
| `supabase/crear-calificaciones-normalizadas.sql:6` cita `docs/sistema/MIGRACION-MATERIAS-A-ID.md` | a propósito | Los `.sql` no se editan (son historia del esquema); el `git grep` de la VALIDACIÓN los excluye |
| RUMBO tras el commit | a vigilar | Dirá `main · 5e4e8c9`, 1 commit por detrás (tolerado hasta 10) |
| Tareas «Después de D» de PARA CLAUDE: índice de `docs/historial/auditorias/README.md` con lo movido, bloque «Vigencia» de `OPTIMIZACION_RENDIMIENTO_400_500.md` y `docs/historial/README.md:28` | pendiente | Claude, después de D |
| Afirmaciones caducadas que la parte no nombra: MATRIZ-UX `:97` («7 de 8 rutas») y `:77`/`:416` (mandan al `*-client.tsx` de la ruta); MAPA §3 paso 5 (tsc + build, no `test:ci`); FLUJO §4 (símbolos que hoy viven en archivos partidos: `catalogo-academico-resolucion.ts`, `horario-importar-lectura.ts`, `tutores-*.ts`) | pendiente | Fuera de las líneas de D. D4 no las ve: no son anclas `ruta::símbolo` |
| `criterios.prompts` §26 como remisión a ORDEN §6 punto 10 · «16 principios» y «21 copias sobrantes» | pendiente | La Parte C los dejó como candidatos para D, pero el prompt de D no los nombra |
| Aviso de lint en `gen-panel.mjs:41` (`MARCA`) | previo | Ajeno a la Parte D |

---

## Parte E — La recuperación se comprueba sola

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte E: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (el issue medio y los tres bajos, aplicados en el cierre 1; el cierre 2, tras el corte por el límite de uso, los comprobó, volvió a validar y firmó el commit)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `scripts/test-gen-contexto.mjs` (nuevo) | Suite del índice y del generador: T1-T14 de la tabla E2 escritos en la propia suite; aserciones de inclusión y exclusión sobre las filas «- **X** →» y sus rutas; en todo paquete de Cline, CONTRATO y ≤ 8 KB; negativos N1-N4; R1 (no es red de seguridad de las rutas de sus casos); D1-D2 (`--diag`); S1 (aviso de C9, relacional); C1 (smoke de la rama claude). Nunca `--salida` (lanza si se le pasa). `ROJAS_CONOCIDAS = []` | E2 |
| ídem | D3: `--diag` de `fase10-carga`, `p0-restaurar-ciclo-operativo` y `p0-verificar-restauracion` para Cline → exit ≠ 0; `p0-verificar-profesor` y `p0-diag-contexto` → exit 0; `fase10-carga` para Claude → exit 0 | Cierre 1: issue 1 |
| `scripts/gen-contexto.mjs` | (a) aviso de historial en el paquete de Cline; (b) `--diag=a.mjs[,b.mjs]` cita el script y pega su fila del README con su sección, exit 1 si no está en la raíz de `scripts/` o no tiene fila; (c) sección «REQUIERE REVISIÓN DE CLAUDE»; (d) aviso a menos del 5 % del límite de C9, leído de `test-orden --json` una vez por invocación; (e) TÉRMINOS en una línea, solo nombres, con «definición en `docs/normativo/GLOSARIO.md`»; (f) «ciclo» solo con `lib/escolar/ciclo/` o `supabase/` con ciclo/periodo en el nombre; (g) fila de auditar o prompt para Cline → exit 1; (h) apariencia solo sin `--tarea` o con `--tarea=apariencia`. `suitesDe()` ya no cuenta esta suite como red de cada ruta que nombra. Cabecera al día | E1 |
| ídem | `vetoCline()`: para Cline, `--diag` sale con 1 si el prefijo es `migrar-`/`fase10-` (ORDEN §4) o si la fila del README lo marca `ESCRIBE`, `CARGA`, `DESTRUCTIVO` o «no ejecutar desde Cline»; en una fila de varios scripts, la marca vale para los que nombra la misma frase y, si no nombra a ninguno, para todos. El texto de la sección se invierte: primero «si dice ESCRIBE… no lo corras», después «córrelo». Cabecera SALE CON 1 al día | Cierre 1: issue 1 |
| ídem | El mensaje «Uso: …» incluye `[--diag=script.mjs[,…]]` | Cierre 1: issue 2 |
| `scripts/test-orden.mjs` | `comprobar()` gana un 6.º parámetro opcional `extra`, que se esparce en el `--json`; C9 publica `limite: 1000`. Ninguna regla ni umbral cambia | E1 (d) |
| `scripts/README.md` | Fila de `test-gen-contexto.mjs` junto a `test-orden` («no prueba un módulo: prueba el índice y el generador»); fila de `gen-contexto.mjs` con `--diag`, las marcas, el aviso de C9, las salidas con 1 y su suite | E2 · E1 |
| ídem | La fila de `gen-contexto.mjs` describe el veto; la de la suite, los `--diag` vetados; la fila `verificar-credenciales-iniciales.mjs` · … nombra los dos scripts sensibles en vez de «Los dos primeros» | Cierre 1: issue 1 |
| `ESTADO-ACTUAL.md` | «**52 suites**»; «Dos de ellas no prueban un módulo: `test-orden` (el repo) y `test-gen-contexto` (el índice y el generador)», sin líneas nuevas | Mismo commit (E) · cierre 1: issue 4 |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Esta sección | Cierre |

Diff de la parte sin contar los CR ni este informe: 5 archivos, +493/−18 (la suite nueva, 295 líneas; `gen-contexto` +184/−12).

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer E1 y E2 en lugar de Cline, sin commit | Escribir la suite primero y medirla contra el generador sin tocar; implementar E1; respetar los finales de línea de cada archivo; VALIDACIÓN y `test:ci` | Ejecutar `diag-calendario-periodo.mjs` (conecta a Supabase): `--diag` se probó leyendo el README. Corregir la cifra «800 KB» de la cabecera y el `git stash` del brief de Claude: fuera de E. Commit: lo hace el cierre. CI de GitHub: sin push |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, el RESULTADO de E y la filosofía | Re-ejecutar la suite (132/132) y reproducir el «antes» con una copia de HEAD por `git archive` (46 rojas); test-orden, verificar-docs, los tres `--check`, `verificar:estado`, eslint y `diag-peso-cambio`; comprobar ajenos y finales de línea; probar a mano `--diag=fase10-carga.mjs,migrar-eliminar-ciclos.mjs` (exit 0: issue 1) | Corregir: un auditor solo propone (1 issue medio, 3 bajos). `test:ci` completo: se apoyó en el del implementador |
| Claude, cierre 1 (cortado por el límite de uso) | Aplicar la auditoría, volver a validar, informe y commit | Los 4 issues, con D3 en la suite; medir el coste real de la suite (19 ejecuciones de `test-orden --json`, contadas con un `--import` en el scratchpad); repetir la medición «antes» con la suite final contra una copia de HEAD; VALIDACIÓN; escribir esta sección | Terminar: el límite de uso lo cortó después de escribir esta sección y antes del commit, así que su validación no se da por buena sin repetirla. Ejecutar ningún `--diag` de verdad: conectan a Supabase. Tocar la cifra «800 KB» y el `git stash` del brief: el auditor los dejó fuera de alcance (§7) |
| Claude, cierre 2 | Retomar el cierre: comprobar qué issues estaban aplicados, volver a validar sobre el árbol final, corregir esta sección y commit | Comprobar sobre el diff que los 4 issues ya estaban aplicados (no faltaba ninguno); repetir la suite (138/138), test-orden, `verificar:estado`, verificar-docs, eslint de los 3 scripts y el veto a mano (exit 1: `fase10-carga`, `verificar-credenciales-iniciales`, `diagnostico-ciclo-activo-bug`; exit 0: `verificar-tablas-tutores`, `diag-duplicados-ciclos`); `test:ci` completo; los ajenos y los finales de línea; commit con rutas concretas | Push: lo prohíben las reglas duras. Ejecutar ningún `--diag` de verdad, por la misma razón. Lo de §7 queda igual: no es de la parte |

Ninguno de los cuatro conectó con Supabase, ejecutó `scripts/_peligrosos/`, `scripts/_archivo/` o `fase10-*`, editó un `.sql` o tocó los 7 cambios ajenos del árbol.

### 3. Cómo se ejecutó y se midió

Orden del implementador: suite E2 con `ROJAS_CONOCIDAS = []` → MEDICIÓN contra el generador sin tocar → E1 → suite en verde → README y ESTADO → VALIDACIÓN → `test:ci`. El cierre 1: issues → D3 → la suite final contra una copia de HEAD → VALIDACIÓN → informe (se cortó antes del commit). El cierre 2: diff contra los issues → VALIDACIÓN → `test:ci` → esta sección → commit.

| Medición | Antes (`67863b7` + ajenos) | Después del implementador | Después del cierre (1 y 2) |
|---|---|---|---|
| `node scripts/test-gen-contexto.mjs` | Suite del implementador: 74/117 en verde, **43 rojas**, exit 1. Suite final (cierre 1, repetido por el cierre 2 con una copia nueva de HEAD): 81/130, **49 rojas**, exit 1 (las 3 de D3 incluidas) | 132/132, exit 0 | **138/138**, 0 rojas conocidas, exit 0 |
| Rojas del «antes», por tipo | T1 cita MATRIZ-UX; T6 cita CICLO_EVALUACIONES_MODULO; T2, T3, T5 y T9 ×2 sin marca de revisión; T4 y T7 sin aviso de historial; T10 y T13 salen con 0; TÉRMINOS pega filas del GLOSARIO en 12 paquetes (24); `--diag` ignorado (D1 ×2, D2); C9 sin `limite` (S1) | — | — |
| `--diag=fase10-carga.mjs,migrar-eliminar-ciclos.mjs` (Cline) | exit 0: el flag se ignoraba | exit 0, con «Córrelo antes de tocar nada» | **exit 1**: «es rendimiento contra producción…», «usa --agente=claude» |
| Bytes del paquete de Cline (T1 · T2 · T3 · T4 · T5 · T6 · T9 · T11 · T12) | 7 069 · 5 832 · 4 447 · 4 235 · 4 280 · 4 251 · 4 943 · 5 731 · 3 721 | 5 450 · 4 137 · 4 089 · 3 713 · 3 471 · 3 357 · 4 134 · 3 991 · 3 202 | iguales (el cierre solo cambia la sección DIAGNÓSTICO) |
| `node scripts/test-orden.mjs` | 18 reglas · C10 19/19 | igual (la suite nueva tiene fila) · C9 publica `limite` | igual |
| `npm run verificar:estado` | 51 suites | 52, al día | 52, al día · 144 líneas |
| Coste de la suite | — | declarado «2-3 s, una ejecución de test-orden»; el auditor midió 8,8 s | **≈ 9,5 s** en local (cierre 1); **≈ 19-20 s** en dos corridas del cierre 2, en la misma máquina con más carga. 19 ejecuciones de `test-orden --json`: 16 del generador para Cline con un archivo que mide C9, 2 de la rama claude (C1 y D3) y 1 de la propia suite (S1); el cierre 2 las recontó caso por caso y salen las mismas |
| `npm run test:ci` | verde (cierre de D) | verde | Cierre 2, primera corrida: todo en verde hasta el build, que falló al descargar Nunito de `next/font/google` (25 errores «Can't resolve …/font/google/font»; no toca nada de la parte). `npm run build` solo: exit 0. **Segunda corrida completa: verde, exit 0**: tsc; lint 0 errores y 1 aviso previo (`gen-panel.mjs:41` `MARCA`); **52/52** suites (`test-gen-contexto` 138/138); test-permisos 738/0; auditoría de permisos 201 actions, 309/0; `--check` de matriz, invariantes y rumbo al día; `verificar:estado` OK; `verificar:docs` OK; build OK |

**Tokens del arranque:** 9 720 → **9 735** (+15, todo de ESTADO-ACTUAL; el cierre no lo mueve: «de las 52» → «de ellas» no cambia el redondeo). Contra la base LF de la cabecera (~10 344): −609. `TECHO_TOKENS = 10500` sin tocar.

### 4. Qué normas respetó

Del checklist del auditor; la columna «Cumple» es la suya, con lo que hizo el cierre donde cambió algo.

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| E1 (a) aviso de historial en el paquete de Cline | sí | T4 y T7 lo llevan; la suite comprueba en todos los paquetes «aviso ⇔ alguna fila cita `docs/historial/`» |
| E1 (b) `--diag` cita el script y su fila; sin el flag, nada | sí → **cerrado en el cierre** | D1, D2 y N4. El riesgo residual del auditor (`fase10-*`/`migrar-*` con exit 0 y «Córrelo») es ahora exit 1 para Cline (D3) |
| E1 (c) marca de revisión (`lib/auth/**`, `supabase/**`, `test-orden`, `verificar-docs`, `@deprecated`/fallback) | sí | T9 marca `lib/auth/permisos.ts` y `scripts/test-orden.mjs`; el criterio literal de fallback marca 26 de 255 `.ts` de app/lib |
| E1 (d) aviso a menos del 5 % de C9; `limite` aditivo y leído del `--json` | sí | `extra` solo en C9; el generador cuenta líneas como C9 (`split("\n")`); S1 relacional (pasa con `escolar.ts` en 999 por el cambio ajeno) |
| E1 (e) TÉRMINOS solo por nombre | sí | Una línea con « · »; sin tope de 14, en las dos ramas (§6) |
| E1 (f) «ciclo» limitado a `lib/escolar/ciclo/` y `supabase/` | sí | T6 ya no cita el módulo; T3 sí; T2 no lo arrastra |
| E1 (g) auditar/prompt con Cline → «es tarea de Claude» | sí | T10 y T13 exit 1; C1 (claude) exit 0. `--tarea=cambio` también se rechaza (§7) |
| E1 (h) apariencia solo sin `--tarea` o con `apariencia` | sí | T1 sin MATRIZ-UX; T14 con ella |
| E2: casos en el test, estructura, nunca `--salida` ni snapshot, negativos, CONTRATO y ≤ 8 KB, smoke claude, `ROJAS_CONOCIDAS` | sí | 138/138; contra HEAD, 49 rojas; `gen()` lanza con `--salida` |
| Mismo commit: «52 suites» y la frase de las dos suites, sin líneas nuevas | sí | 143 líneas (144 por `split`); `verificar:estado` al día. La cifra repetida se quitó en el cierre (issue 4) |
| §2 Alcance: solo lo pedido, legacy en pie, sin módulo paralelo | sí | Las 5 rutas que pide E (más este informe). Nada borrado; ninguna fuente nueva |
| §2 Capas · Datos · Identidad | n/a | Solo `scripts/` y documentación; sin SQL ni base |
| §2 Verificación: `test:ci`, medición antes/después, nada de `_peligrosos/`/`_archivo/` | sí | `test:ci` en verde en el cierre; medición con la misma suite antes y después; `--diag` solo lee el README |
| §2 Documentación: ESTADO-ACTUAL, README, informe, `gen:matriz`/`gen-rumbo` | sí | Sin Server Actions ni `pendientes.json`: no hace falta regenerar; los `--check` al día |
| §3: `_peligrosos/`, migración, cifra copiada a mano, fuente paralela | sí | El límite de C9 se lee del `--json`. La única cifra a mano («de las 52») se quitó en el cierre |
| Ajenos intactos | sí | `git diff --ignore-cr-at-eol --ignore-blank-lines` vacío en los 7 |
| Finales de línea | sí | `gen-contexto` y `test-orden` 100 % CRLF; README, ESTADO y la suite, LF; `git diff --check` limpio |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15 · fuente única | respeta | El límite de C9 sale de `test-orden --json`; los términos remiten al GLOSARIO; `--diag` pega la fila del README y el veto la lee, no la copia. Duplicaciones menores y comentadas: `MIDE_C9` repite el filtro de alcance de C9, y los prefijos vetados (`migrar-`, `fase10-`) son los de ORDEN §4 |
| §16 · medir antes y después | respeta | Suite escrita primero y corrida contra el generador sin tocar (43 rojas); el auditor (46) y el cierre (49, con D3) lo repitieron contra HEAD |
| R8 · el legacy no se retira | respeta | Nada borrado; la marca de `@deprecated`/fallback lo hace visible en el paquete |
| Reutilizar antes de crear | respeta | `casa()`, `palabras()`, `leer()` y `reglasOrden()` con caché; el veto reutiliza la fila ya leída para `--diag` y las etiquetas de la Clasificación del README |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | Ninguna regla ni umbral cambia; `ROJAS_CONOCIDAS` vacía y solo puede menguar |
| Economía del arranque | respeta | +15 tokens; los casos viven en la suite, no en el 00-INDICE; los paquetes adelgazan (T1 −23 %, T11 −30 %) |
| ORDEN · dónde va cada cosa | respeta | La suite en `scripts/` con prefijo `test-`, cabecera y fila (C10 en verde); el CI la recoge sola |
| Fallar en voz alta | respeta (tras el cierre) | La excepción que señaló el auditor (`--diag` de escritura o carga con exit 0) sale ahora con 1; una fila de varios scripts que marca sin nombrar falla cerrada |

**Veredicto global:** la Parte E sigue la filosofía y la arquitectura del repo: el paquete de cada tarea es más pequeño y más preciso, lo que no es de Cline se rechaza en voz alta, y una suite impide que el índice o el generador retrocedan.

### 6. Desviaciones y decisiones propias

**Desviaciones del implementador**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| E2 N2 (`--tarea=ui`) | Comprueba que ninguna fila «- **X** →» contenga «arquitectura», no todo el stdout | Es la aserción estructural que pide E2 y no da un falso rojo por un texto fijo |
| E1 (e) TÉRMINOS | Una línea de nombres con « · »; sin el tope de 14, en las ramas cline y claude | Con solo nombres el tope no ahorraba nada; el GLOSARIO está en el arranque de los dos |
| E1 (b) `--diag` | Lista separada por comas, `scripts/x.mjs` o `scripts\x.mjs`; exit 1 fuera de la raíz o sin fila; pega la fila y su sección; también en el brief de Claude | Fallar en voz alta (Parte A); sin fila = `ESCRIBE`; la fila evita cargar el README entero |

**Desviaciones y decisiones del cierre 1** (el cierre 2 no añadió ninguna: solo validó y corrigió este informe)

| Ítem | Qué cambió | Por qué |
|---|---|---|
| Issue 1 · `p0-` | No se veta por prefijo: decide su fila | `p0-diag-contexto` es «el primero a correr ante cualquier duda» (`LEE`) y `p0-verificar-profesor` también lee; la herramienta que escribe (`p0-restaurar-ciclo-operativo`) lleva `ESCRIBE --apply` en su fila y se veta por ella. `fase10-perfil-datos` (`LEE(red)`) sí se veta por prefijo: la cabecera del prompt prohíbe `fase10-*` |
| Issue 1 · filas de varios scripts | Se vetan los que nombra la frase de la marca, en vez de dejarlas pasar con la salvedad | Dejarlas pasar mandaba correr a Cline `p0-verificar-restauracion`, `diagnostico-ciclo-activo-bug` y `7-diagnostico-materias-alumnos`, que imprimen CURPs. Si la frase no nombra a ninguno, se vetan todos (falla cerrada) |
| Issue 1 · etiquetas | `ESCRIBE`, `CARGA` y `DESTRUCTIVO` en mayúsculas (como en la Clasificación); «no ejecutar desde Cline» sin distinguir caja | Sin distinguir caja, «escribe» y «carga» casan con «No escribe en la base» o «carga académica». Comprobado sobre el README: las mayúsculas solo casan con las filas `migrar-*`, `p0-restaurar-ciclo-operativo` y `fase10-carga`; el resto de los vetos son filas con «no ejecutar desde Cline» |
| README · fila `verificar-credenciales-iniciales.mjs` · … | «Los dos primeros» → los dos nombres | Con la regla anterior, la fila vetaba también `verificar-tablas-tutores`, que no imprime credenciales |
| Issue 4 · ESTADO-ACTUAL | «Dos de las 52» → «Dos de ellas» | El prompt dictaba el literal, pero `verificar-estado-actual` solo vigila la primera «N suites»: la copia caducaría con la suite 53 sin que nada fallara (DECISIÓN «Cifras» de la Parte C) |
| Issue 3 | Ningún cambio de código | El coste (≈ 9,5 s) es aceptable; se corrige la cifra aquí y en el commit |

**Decisiones propias del implementador**
- (f) «ciclo»: cualquier ruta bajo `lib/escolar/ciclo/`; en `supabase/`, solo si el nombre contiene ciclo o periodo (T3 sí, T2 no).
- (g) La tarea de Claude se reconoce por la fila elegida, no por el texto de `--tarea`: `--tarea=escribir` y `--tarea=cambio` también se rechazan para Cline.
- (h) Apariencia: sin `--tarea`, o con alguna `--tarea` que contenga «apariencia».
- (c) Sección «## REQUIERE REVISIÓN DE CLAUDE», una línea por archivo con sus motivos; una carpeta en alcance se marca por su ruta; «fallback» literal y sin caja en todo el fuente, comentarios incluidos.
- (d) «A menos del 5 %» = `limite − líneas < 0,05 × limite`; solo los archivos que mide C9; si `test-orden --json` no se puede leer, lo dice; una sola ejecución por invocación, y solo si hay algo que medir.
- (a) Marca fija «**Aviso de historial:**» con las rutas de `docs/historial/` que citan las filas, solo en el paquete de Cline.
- `suitesDe()` cuenta `test-gen-contexto` solo para `scripts/gen-contexto.mjs` y `docs/00-INDICE.md` (R1 lo vigila).
- Comprobaciones añadidas a la tabla E2 para cubrir todo E1: aviso de historial ⇔ cita, TÉRMINOS sin tabla, D1/D2, S1 y R1.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| Ejecutar de verdad un `--diag` (`diag-calendario-periodo.mjs` y los demás) | no ejecutado | Conectan a Supabase; `--diag` y el veto solo leen el README |
| La suite y el generador en el CI de GitHub (Linux) | no verificado | Sin push. La suite normaliza CRLF y `\`, y su smoke de claude no depende de `.panel/` |
| «con 800 KB de docs» en la cabecera de `gen-contexto.mjs` (rama cline) | pendiente | Cifra a mano que la Parte C quitó de AGENTS; fuera de E según el auditor. Otro prompt |
| El brief de Claude sugiere `git stash` para saber si una regla que falla venía de antes | pendiente | Choca con la regla de no hacer stash con cambios ajenos en el árbol; fuera de E. Otro prompt |
| Veto en filas de varios scripts | a vigilar | Depende de que la marca nombre el script en la misma frase; si no lo nombra, veta a todos (falla cerrada, no abierta) |
| `--tarea=cambio` con Cline sale con 1 | asumido | Casa con «Auditar un cambio…»; la Parte A ya lo había anticipado |
| Ruido de la marca «fallback» (26 de 255 `.ts` de app/lib) | aceptado | Criterio literal del prompt; `app/actions/asistencias.ts` se marca aunque diga «Sin fallback» |
| Coste de `test-gen-contexto` (≈ 9,5-20 s según la carga, 19 ejecuciones de `test-orden --json`) | aceptado | Crece con cada caso que mide C9; si molesta, `test-orden` podría leerse una vez en la suite y pasarse al generador |
| El build de `test:ci` depende de descargar las fuentes de Google (`next/font/google`) | a vigilar | En el cierre 2 falló una vez por eso y pasó al repetirlo. No es de la parte: lo anoto porque un rojo así no es un fallo del código |
| El cierre 1 se cortó por el límite de uso antes del commit | resuelto | El cierre 2 comprobó sobre el diff que sus cambios estaban completos, repitió la validación y firmó el commit |
| Tareas de PARA CLAUDE («Después de D», archivar los informes de Q, R, S y T, marcar las casillas del prompt) y el Resumen de este informe | pendiente | Cierre final del Prompt V |
| Aviso de lint en `gen-panel.mjs:41` (`MARCA`) | previo | Ajeno a la Parte E |
