# Retroalimentación sobre la auditoría externa «Documentación para IA — WebCetac23»

> 2026-10-04 · HEAD `b184b01` (= origin/main) · Claude. La auditoría se contrastó contra el
> repo en **solo lectura**: 9 áreas verificaron sus afirmaciones, 10 buscaron lo que no vio,
> y 8 revisiones escépticas (hechos + filosofía) re-comprobaron cada hallazgo de severidad
> media o alta. Después, dos críticos independientes (exactitud y ejecutabilidad)
> revisaron esta retro y el Prompt V; sus 69 observaciones están aplicadas. Las cifras de
> aquí tienen comando o `ruta:línea`; lo no comprobable dice NO VERIFICABLE. Prompt derivado: `docs/historial/prompts/PROMPT_V_DOCUMENTACION_PARA_IA.md`.

---

## 1. Veredicto

- **Su tesis central se sostiene.** El problema ya no es la falta de documentación, sino la
  coherencia, la recuperación y la verificación. Acierta al pedir que no se cree un documento
  maestro, que no se fusionen los normativos y que no se borre el historial.
- **Propone como nuevo lo que ya existe** y no mide. La «opción B» para la filosofía es
  `INVARIANTES.md` desde el PROMPT G (2026-09-19). Su «Nivel 1» de verificación está casi
  entero en el CI. `gen-contexto.mjs` ya es central en la norma (`AGENTS.md:93`). Su
  «Problema A» (~500 KB) repite una cifra del repo que no es cierta, y reabre una confusión
  que los prompts P y Q ya habían deshecho.
- **No vio lo que más daño hace hoy**: (1) el arranque está a **15 tokens de su techo** y
  casi todas sus P0/P1 lo hacen crecer; (2) el arranque **contradice al código** en
  calificaciones (modelo B); (3) hay diagnósticos marcados `LEE` que **imprimen
  credenciales**; (4) `gen-contexto` **falla en silencio**; (5) `criterios.prompts` es
  **anterior al reparto** y hay tres estructuras de prompt; (6) Claude no carga `CLAUDE.md`
  al arrancar y sí carga **una memoria con datos caducados** (la memoria se corrigió el
  2026-10-04; queda llevar al CONTRATO la regla que solo vivía en ella: Prompt V, C3).
- Las calificaciones numéricas (7.8/10…) no tienen base verificable: no orientan a un agente.

## 2. Sus afirmaciones, contrastadas

| § | Afirmación | Veredicto | Evidencia | Lo exacto |
|---|---|---|---|---|
| 2.1 | 6 lecturas de arranque y orden de autoridad | CORRECTO | `AGENTS.md:5-10`, `:22-29` | — |
| 2.1 | `filosofia.estructural` (autoridad nº 2) queda fuera del arranque y nada asegura que se consulte | PARCIAL | `PROMPT_CLINE_G:9-11`; `verificar-docs.mjs:71-74`; `gen-invariantes --check` en `verificacion.yml:62-63` | Está mitigado: `INVARIANTES.md` (arranque, generado y vigilado en CI) es su proyección. Falta citar el § por fila de tarea, y `gen-contexto` solo la trae con `--tarea=arquitectura` |
| 2.1 | Opción A: cargarla entera | — | `verificar-docs`: 10 485/10 500 | Hoy es **imposible**: suma ~5 200 tokens con 15 de margen |
| 2.2 | `CLAUDE.md` es solo un puntero | CORRECTO | `CLAUDE.md:3-12` | Pero **no se carga al arrancar**: las sesiones de Claude empiezan en `Desktop/web/`, y se inyecta solo al leer el primer archivo de `mi-web-escolar/`. Hasta entonces, `AGENTS.md` no se lee |
| 2.3 | README: 4 roles y 40 suites | CORRECTO | `README.md:3`, `:26` | Lo mismo en `scripts/README.md:12`. Los valores reales son 6 (`lib/auth/types.ts:11`) y 51 |
| 3.1 | `verificar-estado-actual` comprueba HEAD, suites y líneas | CORRECTO con matiz | `verificar-estado-actual.mjs:79`, `:115`, `:128` | El HEAD tolera 10 commits y solo avisa con más de 1. Las suites, solo en su 1.ª mención. «árbol limpio» no lo comprueba nadie, y hoy es falso |
| 3.1 | Faltan las categorías confirmado / histórico / pendiente / hipótesis / deuda | PARCIAL | ESTADO §3, §5 (fechado), §6 → `pendientes.json` | 3 de 5 ya existen. Faltan «hipótesis» y marcar lo construido pero con SQL pendiente (`ESTADO:21-22`, `portada_carreras`) |
| 3.2 | El bloque generado de RUMBO se puede leer como autorización | CORRECTO, y peor | `gen-rumbo.mjs:83` | El generador descarta `quien`. «C10 = 34» y «C11 = 21» no se explican. La cabecera manual no se toca desde `eba1eb0` (54 commits) y lista un pendiente ya cerrado |
| 3.3 | Para rendimiento, el índice manda a un documento de 1 929 líneas | CORRECTO | `00-INDICE.md:38` | Son 1 928 líneas (`wc -l`) y 133 584 B. En el paquete de Cline va sin el aviso de historial (`gen-contexto.mjs:482-484`, solo la rama claude); lo mitiga `AGENTS.md:28` |
| 3.4 | El checklist de REGLAS verifica el calendario «bajo el mismo nombre del periodo» | CORRECTO, y más grave | `REGLAS_NO_HACER.md:175-176`, `:126-134` | R5 presenta como futura una migración ya hecha, y su alternativa lleva al bucket equivocado. El punto 4 da un falso negativo para el operativo medido el 2026-09-06 |
| 3.5 | INVARIANTES se genera desde la filosofía | CORRECTO | `gen-invariantes --check` → «Al día» | Ninguno remite a un procedimiento. `filosofia.estructural:484` cita una ruta muerta |
| 3.6 | Cada entrada del GLOSARIO debería tener 5 campos | DESCARTAR | 34 filas de 2 columnas; REGLAS + GLOSARIO = 39 % del arranque | Hace crecer el arranque. Lo útil es corregir las filas **falsas** (modelo B, trampa del calendario, «16 de 20») |
| 3.7 | Sincronizar ORDEN con test-orden | CORRECTO | ORDEN cita 6 de las 17 Cx | Pero una columna «Vigila» escrita a mano duplicaría test-orden (R6). Ese mapa ya existe para los invariantes (`docs/informes/2026-09.md` §1, generado) |
| 4 | filosofía: ~488 líneas / 20 KB | CORRECTO | 20 825 B LF | §11 trae reglas de rendimiento, pero no nombra un instrumento |
| 5 | criterios: ~773 líneas / 23,5 KB | CORRECTO | 23 965 B LF | — |
| 5 | «Cline ya conoce el proyecto» y el paquete cerrado son compatibles si se leen bien | INCORRECTO | `criterios.prompts:176-202`, `:229-239`; `AGENTS.md:91` | No es un problema de lectura. El cuerpo de criterios (`be75ddb`, 09-01) es anterior al reparto, al CONTRATO (`c2a035e`) y a `test:ci` (`3dfb005`): §4, §6-7, §19, §24 y §26 los contradicen, y criterios nunca exige medir |
| 5 | `gen-contexto` debería ser el mecanismo central | PARCIAL | `AGENTS.md:93`; `criterios.prompts:25` | Ya lo es en la norma. En la práctica, T y U no lo usan, y S pasó `--tarea=modificar`, que se ignora sin avisar |
| 6 | El historial de rendimiento se puede confundir con el presente | CORRECTO | doc `:5` «única fuente de verdad», `:7` HEAD `af4d518` | Además, su capacidad de FASE 10 está mal medida: nunca hubo más de 300 peticiones en vuelo, no 1 000 (`fase10-carga.mjs:117-131`) |
| 7 | scripts/README: 35,9 KB y 201 líneas | CORRECTO (aprox.) | `wc`: 36 415 B (w/lf), 200 líneas | — |
| 7 | «Las etiquetas no sustituyen salvaguardas» | PARCIAL | 10 de 10 escritores en base tienen guarda `--apply` | Los fallos reales están en otro sitio: lectores que imprimen secretos, una prueba de carga etiquetada `LEE`, `_peligrosos/` sin guarda en código, y `ESCRIBE`/`DESTRUCTIVO` definidos pero sin usar |
| 8 | Hay dos verificadores documentales | PARCIAL | `test-orden.mjs:254` (C10), `:527` (C17) | Omite C10 (inventario de scripts), C17 (`test:ci` = workflow) y los 3 `--check` de generados del CI |
| 8 | El Nivel 1 está por construir | PARCIAL | `verificar-docs.mjs:104-188` | Ya existe casi entero. Faltan los enlaces markdown, los nombres sueltos (6 `*-client.tsx` muertos en `MATRIZ-UX:113-118`) y las anclas `ruta::símbolo` (4 de 26 rotas) |
| 9 | Hay ~500 KB de documentación | PARCIAL (la contradicción 500/800 es real; la cifra, no) | `git ls-tree -l` | 1,36 MB en total, ~383 KB sin historial, ~330 KB visibles para Cline. El propio AGENTS dice 500 (`:14`) y 800 (`:91`). El peso del historial no es coste de arranque (commit `1151321`, prompts P y Q) |
| 11 | Validar con 10 tareas ejecutadas por modelos | PARCIAL | — | La pregunta «¿llega la regla correcta?» se resuelve sin modelo (§4) |

## 3. Lo que no vio (confirmado por los escépticos)

| # | Sev. | Hallazgo | Evidencia | Por qué importa a un agente |
|---|---|---|---|---|
| 1 | alta | **Techo del arranque**: 10 485 de 10 500 tokens en local y 10 345 en el CI (`pesa()` cuenta los CR). La decisión «subir, podar o partir por rol» está abierta desde el 2026-09-28 y no figura en `pendientes.json` | `verificar-docs.mjs:34`, `:97`; `SOSTENIBILIDAD-DEL-REPARTO.md:178-187`; commit `632a996` | Cualquier P0/P1 que añada texto a AGENTS, REGLAS, GLOSARIO o el índice rompe `verificar:docs` al primer párrafo |
| 2 | alta | **Calificaciones**: el modelo B está vigente, pero el arranque lo prohíbe | `GLOSARIO.md:46-53` → `CALIFICACIONES-Y-BOLETAS.md:6-8` «No "optimizarlas" hacia una tabla única»; `ESTADO:45`, `:56`; `MAPA:72`, `:118` frente a `crear-calificaciones-normalizadas.sql`, `tables.ts:43`, `calificaciones-puro.ts:239` y `d7415a7` | Un agente «protege» las tablas físicas o trata el modelo B como un error. Un join por `materia_id`, que es TEXTO, devuelve vacío sin dar error |
| 3 | alta | **`gen-contexto` falla en silencio** | `:195-196` (con CRLF el CONTRATO desaparece y sale con exit 0); `:280-282` (una `--tarea` desconocida se ignora); `:91-104` (un encabezado renombrado deja 0 filas y «No cargues documentación fuera de esta lista»); no tiene suite | Cline recibe un paquete incompleto que parece completo |
| 4 | alta | **criterios.prompts va por detrás del reparto**: tres estructuras de prompt normativas (ORDEN §6, criterios §24 y CONTRATO §1) y una cuarta de hecho (PROMPT_U). Criterios no exige medir antes y después | `criterios.prompts:612-641`; `ORDEN.md:275-281`; `CONTRATO:81` (rechazo inmediato) | Un prompt «correcto según criterios» se rechaza según el CONTRATO |
| 5 | alta | **Fuentes paralelas fuera del repo**. La memoria automática de Claude se carga en cada sesión (`CLAUDE.md` no) y dice «16 de 20» (hoy 15 de 22), «operativo `AGO2026-ENE2027`» (renombrado), recomienda diagnósticos de la época del P0 que leen por texto y que el Prompt U está «sin push» (ya está en origin). Una regla operativa solo vive ahí: «una Server Action nueva desfasa `gen-matriz`; editar `pendientes.json` desfasa `gen-rumbo`» | memoria `identidad-profesor-rota`, `mi-web-escolar-deuda-ciclo`, `ci-completo-antes-de-commit`; grep en AGENTS, CONTRATO y ORDEN: 0 | Claude arrancaba con hechos caducados, y Cline nunca ve esa regla. **Memoria corregida el 2026-10-04**: ahora remite a `pendientes.json` y ESTADO. Lo que queda es llevar la regla al CONTRATO (Prompt V, C3) |
| 6 | media | **Diagnósticos que imprimen credenciales o la CURP de la que se derivan.** Son 4 diagnósticos y 1 `migrar-`. Además, `scripts/README.md:155` publica la clave compartida y `migrar-crear-tecnico.mjs:70` tiene una clave literal | `diag-credenciales-duplicadas.mjs:60` (PROFESORES.CLAVE) y `:83` (ALUMNOS.CLAVE); `verificar-login-credenciales-iniciales.mjs:56-60` (contraseña + CURP); `6j-…:76,81`; `diagnostico-login-tutor.mjs:101` (su cabecera dice «NO expone»); `migrar-marcar-claves-compartidas-profesores.mjs:76`. `6k` no cuenta: `clave_tutor` es un identificador público | Si Cline los ejecuta, las contraseñas iniciales de los tutores (los 8 últimos caracteres de la CURP del alumno) llegan a un proveedor externo |
| 7 | media | **`_peligrosos/`**: ninguno de los 23 tiene guarda en código. Hoy no arrancan por accidente (ENOENT de `.env.local`) y el arreglo obvio los vuelve a armar. No están en `.clineignore`. 3 `probe-` hacen PATCH sobre fichas reales con una CURP fija, y el README dice «POST de prueba» | `_peligrosos/*.mjs:5`; `probe-etiqueta-cols.mjs:27-33` | La protección depende de un error de ruta que nadie documentó |
| 8 | media | **`fase10-carga`** es una prueba de carga contra producción y está etiquetada `LEE`. Su cabecera documenta `--niveles 50` y el parser solo acepta `=`, así que lanza la rampa completa hasta 1 000 | `fase10-carga.mjs:10-12` frente a `:26-32` | No hay staging |
| 9 | media | **C6 no ve escrituras por `fetch`**. 19 scripts quedan fuera de los prefijos de ORDEN §4, y `verificar-*` no se vigila | `test-orden.mjs:207`; `probe-materia-crud.mjs:34` DELETE | La regla dura no detectaría el incidente que la motivó |
| 10 | media | **«Bajar un umbral» está al revés**: lo peligroso es aflojarlo (subirlo); bajarlo cuando baja la deuda lo pide el propio test | `AGENTS.md:107-108`, `gen-contexto.mjs:458` frente a `test-orden.mjs:587` | Cline se negaría a apretar un trinquete |
| 11 | baja-media (§8) | **5 listas de validación**. La que se pega a Cline (CONTRATO §1.5) no dice `test:ci` | `CONTRATO:23`, `:56-58`; `ESTADO:140-146`; `AGENTS:44` frente a `:52` | El CI ya salió rojo dos veces con todo en verde en local |
| 12 | media | `00-INDICE:98` dice que cada `supabase/*.sql` es una migración aplicada: hay 2 sin aplicar y 1 sin verificar | `pendientes.json` `sql-portada-carreras`, `fk-calendario-periodo` | Un agente da por existente una tabla o FK que no existe |
| 13 | media | **MAPA y FLUJO**: 122 de los 179 archivos de `lib/` y `app/actions/` no se mencionan. Faltan los dominios administración, portada, Océano, seguimiento médico y calificaciones B. 4 de 26 anclas están rotas. `MAPA:92` y `:53` apuntan a sitios equivocados. El recorrido de `FLUJO:58` empieza en una ruta que hoy redirige | N3-F2/F3/F4, N5-F2 | La búsqueda por síntoma no funciona para nada de lo construido después del 17-09 |
| 14 | media | **ORDEN desactualizado**: 5 frente a 6 roles, 7 frente a 9 familias, `_borrador/` ya retirado y dos filas fuera de la tabla. C8, C9 (1 000 líneas), C16 y C17 solo están en test-orden; de C14 falta la excepción (`export type X = …` se permite) | `ORDEN.md:139-144`, `:45`, `:53-62`, `:158-159` | `app/actions/escolar.ts` va por 998/1000 líneas y Cline no recibe ese límite |
| 15 | media | **Clasificación**: PROMPT_E/F están en `normativo/`, y hay 4 documentos fechados en `sistema/`. Hay que moverlos **por orden**: MIGRACION-MATERIAS-A-ID es la única fuente de la trampa `materia_id` = TEXTO, y SOSTENIBILIDAD lo es de la decisión del techo | N3-F7 | Si se mueven de golpe, esos dos hechos se pierden |
| 16 | media | No hay informes de Q, R, S ni T, aunque CONTRATO:65 los exige. `.clineignore` oculta `docs/historial/`, donde el CONTRATO manda escribirlos y adonde la fila de rendimiento manda leer | `.clineignore:50-52` | La regla no se puede cumplir tal como está escrita |
| 17 | media | `diag-peso-cambio.mjs` (el «¿Claude o Cline?») falla justo cuando el veredicto es Claude | `:305` ReferenceError; `:262` | El instrumento del reparto no sirve en el caso que importa |
| 18 | media | **Rendimiento**: las secciones no se pueden direccionar (`## 1.`–`## 4.` se repiten 7 veces). C-1, C-2, C-3 y P0-3/6B siguen abiertos en el código. `remedir-rendimiento` parte de una premisa falsa (asistencia «~1000→3863», cuando ya eran 3 863 en FASE 0). Las rotaciones de PAT y bypass solo constan en el historial | N2-F2…F11 | «Se midió» y «ocurre ahora» siguen mezclados |
| 19 | baja | Cifras repetidas que ya divergieron: Server Actions 138/201/202; claves compartidas 16 de 20 / 15 de 22 / varios; suites 40/51; roles 4/5/6; docs 500/800 KB | — | Cada copia a mano es una fuente paralela (R6) |
| 20 | hipótesis | **Fuera de la documentación.** La vista docente del calendario lee por texto (`contenido-docente-oceano.tsx:147` → `calendario.ts:152-158`) y las escrituras usan la UNIQUE de texto | V3-F3 | Posible calendario vacío para docente y técnico. Lo diagnostica Claude con `diag-calendario-periodo.mjs`; no forma parte del Prompt V |

## 4. Retroalimentación de método

| Aspecto | Qué hizo | Qué hacer la próxima vez |
|---|---|---|
| Cifras | Repitió las del repo (500 KB) | Dar cada cifra con su comando y fecha, y aclarar si es LF o CRLF |
| Precedentes | No leyó los prompts G, P y Q ni el `git log` de AGENTS, INDICE y verificadores | Empezar por ahí. Evita proponer lo que ya existe y reabrir lo que ya se decidió |
| Herramientas | Pidió «auditar gen-contexto» sin ejecutarlo | Ejecutarlo cuesta 0,08 s; 14 ejecuciones bastaron para encontrar 5 fallos silenciosos |
| Restricción dominante | No vio el techo de 15 tokens | Toda propuesta sobre el arranque declara su coste en tokens y su compensación |
| Calificaciones /10 | Sin base | Hallazgos con severidad y `ruta:línea` |
| Formato | ~32 KB de prosa | Tablas y un tercio del tamaño: es la economía que exige ORDEN §6 |
| Alcance | Solo `.md` | Faltaron `.clineignore`, la memoria de Claude, la **salida** de los scripts (secretos), la precisión de `docs/sistema/` y dónde arranca la sesión |
| Su prompt §14 | Un encargo abierto («auditar todo», 12 entregables) | Con el formato del repo: hallazgos verificados con «no re-investigar», decisiones tomadas y decisiones pendientes, partes por resultado, validación por comando y CONTRATO. Cline no ve el historial ni decide arquitectura |
| Validación | 10 tareas con modelos y 11 métricas | Primero una suite determinista sin modelo (`test-gen-contexto.mjs`: aserciones de inclusión y exclusión sobre el paquete, como trinquete). Solo si hace falta, 2-3 tareas con modelo |

## 5. Sus recomendaciones

| Recomendación | Veredicto | Por qué |
|---|---|---|
| No crear un documento maestro, no fusionar normativos, no borrar historial, no automatizarlo todo | MANTENER | §15, R6, R8; el repo ya lo practica |
| Opción B para la filosofía | AJUSTAR | Ya existe (INVARIANTES). Falta el § por fila y en gen-contexto, con coste neto cero en el arranque |
| Opción A | DESCARTAR | Imposible con el techo actual; además es una decisión humana |
| Corregir el README | AJUSTAR | **Quitar** las cifras y remitir a su fuente (R6), en vez de ampliar verificadores |
| Índice con 5 preguntas o columnas nuevas por entrada | DESCARTAR esa forma | Hace crecer el arranque, y el parser de gen-contexto mezcla columnas (V6-F11). Poner el § y el diagnóstico dentro de la celda que ya existe |
| GLOSARIO con 5 campos | DESCARTAR | Crece el arranque; corregir las filas falsas |
| Columna «Vigila» en ORDEN | AJUSTAR | El mapa regla → Cx sale de test-orden o gen-informe. ORDEN marca solo lo que no está mecanizado |
| 9 metadatos por script | AJUSTAR | ORDEN §4 ya define el contrato por prefijo. Los que fallan aquí son otros: salida sensible, efecto en producción (CARGA), exactitud (muestra ≤ 1000) y quién puede ejecutarlo |
| Verificación en 3 niveles | AJUSTAR | «Una regla que nada comprueba se degrada» (ESTADO §7). El Nivel 1 casi está: añadir anclas, nombres sueltos, rutas de `pendientes.json` y el cruce de las listas de arranque. El Nivel 2 se resuelve quitando cifras (R6) |
| gen-contexto como mecanismo central | MANTENER | Además, que falle en voz alta y que tenga suite |
| Separar lo histórico de lo confirmado en rendimiento | MANTENER | Bloque de vigencia en el documento (lo hace Claude, porque Cline no ve el historial) y `remedir-rendimiento` corregido |
| Revisar criterios y filosofía (P2) | SUBIR a P1 en parte | §4, §19 y §24 de criterios contradicen el CONTRATO. El resto, por remisión, no por reescritura |
| Medir el coste de la recuperación (P2) | SUBIR | Es la suite golden: barata y determinista. «Medir antes de modificar» (AGENTS; CONTRATO:81) |
| «Problema A: demasiada documentación» | DESCARTAR | P y Q ya lo separaron: el historial es un problema de navegabilidad, no de coste de arranque |

## 6. Prioridades corregidas

| P | Trabajo (Prompt V) | Aceptación |
|---|---|---|
| P0 | **Decisiones 1, 2, 6 y 10 del usuario** (sobre todo la 1, el techo) | Escritas en el bloque DECISIONES del Prompt V; la 1, además, en `verificar-docs.mjs` (C0) |
| P0 | Memoria de Claude y punto de arranque de la sesión (§3 #5) | Hecho: la memoria ya no repite cifras de proyecto (remite a `pendientes.json` y ESTADO). Falta la decisión 7 |
| P0 | Parte A: las herramientas fallan en voz alta | `gen-contexto --tarea=inexistente …` sale con ≠ 0; el CONTRATO se lee con CRLF; `verificar:docs` da la misma cifra en local y en el CI |
| P0 | Parte B: scripts sin secretos y con la cuarentena armada | Ningún script imprime una clave, la CURP ni un derivado (Claude lo revisa con el `git grep` del prompt). La regla DURA de cuarentena de test-orden está en verde **sin ejecutar nada de `_peligrosos/`** |
| P1 | Parte C: una sola verdad en el arranque | `verificar:docs` ≤ la base LF (~10 344; se esperan ~9 800). El `git grep` de cifras divergentes **sobre los archivos que edita C** da 0 |
| P1 | Parte D: docs/sistema y el mapa dicen el presente | `verificar:docs` con anclas, rutas de pendientes y listas cruzadas en verde |
| P1 | Parte E: la recuperación se comprueba sola | `test-gen-contexto.mjs` en `test:ci`, con una lista nominal de rojos conocidos que solo puede menguar |
| P2 | Normalizar todo `scripts/README`, invertir C6 (lista blanca de escritores), paginar diagnósticos (`limit=10000` frente al corte de 1 000), prefijo `action*` (`login.ts:38`), retirar `gen:materias`/`gen:registros` (`package.json` tiene cambios ajenos), emparejar pendientes por campo `rutas` | Prompt aparte |

## 7. Decisiones que solo toma el usuario

| # | Decisión | Recomendación |
|---|---|---|
| 1 | Techo del arranque (SOSTENIBILIDAD Paso 4) | **Mantener 10 500 y podar REGLAS**: Claude copia tal cual el relato del P0 y la «deuda/consolidación» del 2026-09-03 a `BITACORA-2026-09.md`, y REGLAS remite allí (~−620 tokens). Además, medir sin CR, lo que iguala local y CI sin tocar el número |
| 2 | Estructura canónica de prompt | ORDEN §6, ampliada con la de PROMPT_U (ESTADO verificado, DECISIONES TOMADAS, MEDICIÓN, LÍMITES, VALIDACIÓN, INFORME + CONTRATO). Criterios §24 remite a ella |
| 3 | «Un prompt, un dominio» frente a la práctica de T y U | Escribir la regla: varias partes independientes, con commit y `test:ci` por parte |
| 4 | Quién archiva el informe de Cline | **Claude**, al revisar. No reincluir `docs/historial/informes/` en `.clineignore` (los demás cambios de B2 sí van); el CONTRATO §2 lo dice |
| 5 | Cabecera de RUMBO (campaña y «fuera de alcance») | Persona: la de MATRIZ-UX está cerrada desde el 2026-09-30 |
| 6 | `ORDEN:45` `_borrador/` | Retirar la fila (lo no cableado no se versiona) o mantener la cuarentena con README |
| 7 | Dónde arrancan las sesiones de Claude | Abrirlas en `mi-web-escolar/`, o poner un `CLAUDE.md` de una línea en `Desktop/web/` que apunte a `mi-web-escolar/AGENTS.md` |
| 8 | Guarda de escritores en base | Que impriman el host antes del plan, y `--apply=<ref-del-proyecto>` (P2). Aceptación: una regla de test-orden comprueba que todo `migrar-*` lo hace |
| 9 | Hipótesis del calendario docente (#20) | Autorizar que Claude la diagnostique (solo lectura) |
| 10 | Orden de autoridad de AGENTS (nivel 3) | Nivel 3: REGLAS y el resto de `docs/normativo/` + `criterios.prompts`; en la forma de trabajo mandan ORDEN y CONTRATO, en los principios, filosofia. En el mismo cambio, filosofia §15 deja de decir que la forma de trabajo «se define en criterios.prompts» (Prompt V, C9) |

Las decisiones 1, 2, 6 y 10 bloquean la Parte C del Prompt V. La 3 y la 4 ya se aplican en
A y B, como en T y U. La 5, la 7, la 8 y la 9 no bloquean nada.

## 8. Descartado o corregido tras el contraste

- «130 KB» del documento de rendimiento: correcto (130,5 KiB). «500/800 KB» es PARCIAL, no
  INCORRECTO: la contradicción dentro de AGENTS es real.
- Credenciales: de alta a **media**, porque la clave compartida ya está publicada y marcada
  `debe_cambiar_credenciales`. Se descarta una regex de secretos en test-orden por frágil.
- «La filosofía nunca llega a Cline»: los principios sí llegan, a través de INVARIANTES; lo
  que no llega son sus porqués.
- Aviso de historial en el paquete de Cline: de alta a **baja** (`AGENTS.md:28` ya avisa).
- CONTRATO sin `test:ci`: baja-media, porque el paquete de Cline ya lo pide
  (`gen-contexto.mjs:440`).
- `ORDEN:95` «cuatro documentos de arranque» es literalmente correcto.
- Checklist de calendario: el falso negativo afecta al operativo actual; para los ciclos
  creados con F5 el texto coincide. Cuántas filas hay hoy bajo el nombre del periodo:
  NO VERIFICABLE sin la base.
- `criterios §14` ya equivale a CONTRATO §1.3; solo `AGENTS.md:40` difiere.
- `.clineignore`: `!docs/historial/informes/` no reincluye nada mientras se ignore el padre;
  haría falta `docs/historial/*` + `!docs/historial/informes/`. Se prefiere la decisión 4.
- `gen-seccion4` frente a la §4 escrita a mano: baja, porque `test-permisos` ya vigila la
  coincidencia.
