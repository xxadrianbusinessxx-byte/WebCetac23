# INFORME — PROMPT Z · Capacidad gradual hasta 500–600 usuarios, sin cambiar de plan

> Ejecutado el 2026-10-25 (10:35–11:30) por Claude, sin Cline, a pedido del usuario: «ejecuta el prompt Z
> y revisa que la optimización no solo sea un benchmark común (…) debe aguantar gradualmente de 0 a 500
> usuarios simultáneos 250, 300, 400, etc. el límite debería oscilar entre 500 a 600». Prompt:
> `docs/historial/prompts/PROMPT_Z_CAPACIDAD_GRADUAL_500_600.md`. Base: `b9038cf`. Plan gratuito de Supabase.

## Resumen

**La escalera completa, de 100 a 800 usuarios simultáneos, pasa con 0 fallos.** Ninguno de los 10
escalones tuvo un paso fallido, un 504 ni un error de pool (`PGRST003` = 0). El p95 se mantiene por debajo
de ~2 s hasta 800 usuarios (salvo un minuto lento ajeno a la carga en el primer 300; repetido, salió
limpio). El límite útil del perfil realista queda **por encima de 800**, más allá de los 500–600 pedidos.
El **caso extremo** (500 en 10 s haciendo clic cada segundo, ~3× la capacidad medida) **sigue
colapsando** en el login (§3d). De paso apareció un hallazgo de seguridad anterior a este trabajo (§3e).

## 1 · Qué se hizo

| # | Cambio | Archivo(s) | Efecto |
|---|---|---|---|
| Z1 | Identidad del alumno (inscripción → grupo → carrera) en **una** petición con relaciones incrustadas, mismas reglas | `asistencia/asistencias.ts` | boleta y asistencia −2 cada una |
| Z2 | **Ciclo operativo y parciales** en caché de 20 s, solo en lecturas que lo piden (`{ cache: true }`: boleta, asistencia del alumno, reportes, `/oceano`); se invalida en cada escritura de `ciclo-estado`, `evaluaciones` y `eliminar-ciclo` | `cache-referencia.ts` (nuevo), `ciclo/*.ts`, 4 llamadores | `periodos` y `periodos_evaluacion` ≈ 0 por sesión |
| Z2b | **Calendario del periodo** en la misma caché (boleta y asistencia del alumno); se invalida en las 6 escrituras de `calendario.ts` | `ciclo/calendario.ts`, `asistencia/asistencia-estados.ts` | −16 KB y −1 a −2 por sesión |
| Z3 | **Portada pública** en caché de 60 s; se invalida en las 10 escrituras de `portada.ts`. El panel de Configuración sigue sin caché | `portada/portada.ts` | `/`: 4 → ~0 peticiones |
| Z4 | **Justificantes** del alumno sin sondeo de esquema | `asistencia/justificaciones.ts`, `app/actions/justificaciones.ts` | 3 → 1 |
| Z5 | **RPC del perfil v2** (`CREATE OR REPLACE`, misma firma; **aplicada por la persona** el 2026-10-25): alias solo de las tablas del grupo, y `numero_control`, `etiquetas_dinamicas` y `tutor_principal` (sin `password_hash`). La app los usa si vienen (`perfil_v ≥ 2`); si no, consulta como antes | `supabase/crear-rpc-obtener-perfil-alumno.sql`, `alumno/perfil-extras(-puro).ts`, `app/actions/escolar.ts` | perfil: 6 → **2** peticiones, 43 → **13 KB** |
| — | Instrumento: `fase11-carga.mjs --descanso` (reposo entre escalones) y escenarios con la caché como `/oceano` | `scripts/` | escalera medible |
| — | Suites nuevas: `test-cache-referencia.mjs` (14) y `test-perfil-extras.mjs` (13) | `scripts/` | 57 suites |

## 2 · Quién lo ejecutó y qué pudo y no pudo hacer

| Agente | Qué hizo | Qué no pudo |
|---|---|---|
| Claude | midió (`pg_stat_statements`, logs, `fase11-*`), redactó y archivó el prompt, implementó Z1–Z5, escribió las suites, comparó v2 contra las lecturas de siempre y corrió la escalera | aplicar el SQL (lo bloquea el clasificador; lo aplicó la persona) y probar con una sesión real |
| Persona | aplicó `crear-rpc-obtener-perfil-alumno.sql` en el SQL Editor | — |
| Cline / auditor independiente | no intervinieron | — |

## 3 · Cómo se midió (antes → después)

### 3a · Dónde gastaba de verdad (antes de tocar nada)

`pg_stat_statements`: la base **no** era el cuello. En el minuto pico del PROMPT Y, 9 600 peticiones × ~3 ms
dieron unos 29 s de base por cada 60 s. La RPC del perfil era el 35 % del tiempo de base, y el 80 % de su
respuesta eran los 101 alias de todas las materias. Lo que se saturaba era la capa HTTP del plan Nano
(Kong + PostgREST con CPU compartida), y eso depende del **número y el tamaño** de las peticiones.

### 3b · Por paso (`fase11-perfil.mjs --sujetos=3 --runs=3`)

| Paso | FASE 11 | PROMPT Y | **PROMPT Z** | Resultado |
|---|---:|---:|---:|---|
| portada `/` | 4 | 4 | **~0** (1,3 en frío) | igual |
| login | 4 · 58 KB | 4 · 5 KB | 4 · 5 KB | igual |
| alumno · perfil | 8,4 + Admin API · 155 KB | 6 + CDN · 43 KB | **2 + CDN · 13 KB** | igual |
| alumno · boleta | 16,3 | 13,7 | **9,3** | igual |
| alumno · asistencia | 11,3 | 9,7 | **5** | igual |
| alumno · reportes / justificantes | 2 / 3 | 2 / 3 | **1 / 1** | igual |
| tutor · perfil del hijo | 8,7 | 7 | **3** | igual |
| tutor · boleta | 14 | 8,7 | 8,3 | igual |
| ciclo operativo (`/oceano`) | 1 | 1 | **0** | igual |
| **sesión de alumno** | **55** | **~48** | **~29** | |
| **sesión de tutor** | **35** | **~28** | **~21** | |

**Equivalencia de la v2**, con los 357 alumnos con inscripción activa (script de un solo uso, solo cifras):
número de control, etiquetas dinámicas, tutor principal y nombres visibles de materias son **idénticos**
a los de las lecturas de siempre en **357/357**, con 0 diferencias. Verificado en la función viva:
`perfil_v = 2`, sin `password_hash`, `anon` no puede ejecutarla y `service_role` sí.

### 3c · La escalera (lo que pidió el usuario)

`fase11-carga.mjs --confirmar-carga --rampa=30 --pausa=5000 --timeout=30000 --descanso=30`, 8 procesos.
Cada escalón arranca desde reposo: los N usuarios llegan en 30 s y navegan con 0–5 s entre pantallas.

| Usuarios | Sesiones completas | Pasos fallidos | Req/s a Supabase | perfil p50/p95 | boleta p50/p95 | asistencia p50/p95 | login p95 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 100/100 | 0 | 42 | 0,4 / 0,5 s | 0,5 / 0,7 s | 0,2 / 0,4 s | 0,7 s |
| 200 | 200/200 | 0 | 82 | 0,4 / 0,4 s | 0,4 / 0,7 s | 0,2 / 0,3 s | 0,5 s |
| 250 | 250/250 | 0 | 90 | 0,4 / 0,5 s | 0,4 / 0,6 s | 0,2 / 0,4 s | 0,5 s |
| 300 † | 300/300 | 0 | 95 | 0,4 / 2,6 s | 0,6 / 16,1 s | 0,2 / 10,4 s | 4,4 s |
| 300 (repetido) | 300/300 | 0 | 116 | 0,4 / 0,5 s | 0,4 / 0,7 s | 0,2 / 0,4 s | 0,6 s |
| 400 | 400/400 | 0 | 152 | 0,4 / 0,5 s | 0,4 / 0,6 s | 0,2 / 0,4 s | 0,6 s |
| **500** | **500/500** | **0** | 196 | 0,4 / 1,1 s | 0,4 / 2,0 s | 0,2 / 1,2 s | 1,7 s |
| **600** | **600/600** | **0** | 217 | 0,4 / 0,5 s | 0,4 / 0,8 s | 0,2 / 0,5 s | 0,7 s |
| 700 | 700/700 | 0 | 252 | 0,4 / 0,5 s | 0,4 / 0,7 s | 0,2 / 0,4 s | 0,7 s |
| 800 | 800/800 | 0 | 287 | 0,4 / 0,7 s | 0,5 / 0,8 s | 0,2 / 0,4 s | 1,9 s |

† El primer escalón de 300 tuvo un salto de latencia en 17:02–17:03 UTC, con **menos** peticiones por minuto
que el de 600, que salió limpio. Los logs no muestran ni `PGRST003` ni 504 ni 5xx en el borde. Repetido
justo después, 300 salió como 250 y 400. Es un evento pasajero del plan compartido, no de la carga, pero
dice algo real: **en el plan gratuito puede haber minutos lentos que no dependen de nosotros**.

Comparado con antes, en el mismo perfil realista:

| 500 usuarios realistas | FASE 11 | PROMPT Y | **PROMPT Z** |
|---|---:|---:|---:|
| sesiones completas | 70/500 | 471/500 | **500/500** |
| pasos fallidos | 22 % | 0,8 % | **0 %** |
| p95 de la boleta | 193 s | 48 s | **2,0 s** |

### 3d · El caso extremo: 500 en ráfaga (10 s de llegada, ≤ 1 s entre pantallas)

> **Resuelto el mismo día en el PROMPT Z-bis** (`INFORME-PROMPT-Z-BIS-RAFAGA-LOGIN.md`): con la RPC de
> login y un tope de peticiones simultáneas, la misma ráfaga da 500/500 sesiones, 0 fallos, en 37 s.

**Sigue colapsando**: 0/500 sesiones, con el freno activado. Todo cae en el **login**, el primer paso que
los 500 hacen a la vez. Los logs muestran solo 949 peticiones registradas en el borde en el primer minuto,
con 5 s de mediana en origen; el resto se agotó antes de llegar. Hay además un `statement timeout` de
`anon` (3 s) sobre `tutores` y, ya en plena caída, 401/555 del borde.

Por qué no es lo mismo que la escalera: esta ráfaga pide **~850 peticiones/s** (500 sesiones × ~29
peticiones en unos 17 s), unas **tres veces** las ~290/s que el plan gratuito sostuvo limpias con 800
usuarios. Al pasarse no se degrada: se derrumba. Las peticiones se encolan y caducan durante minutos.
Las políticas RLS de esas tablas son triviales (`true`), así que no es la causa.

Lo que lo atacaría, si hace falta (siguiente prompt):

1. **RPC de login**: 4 → 1 petición, justo en el paso donde la ráfaga se cae.
2. **Un tope de peticiones simultáneas a Supabase por instancia** (un `fetch` con semáforo en
   `lib/supabase/`), para que el exceso espere en el servidor en lugar de amontonarse en PostgREST.
   Convierte el derrumbe en lentitud.

Para la escuela (472 alumnos), 500 personas entrando en los mismos 10 segundos y haciendo clic cada
segundo no es un escenario esperable. 800 entrando en 30 s y navegando normal sí se aguanta.

### 3e · Hallazgo de seguridad (anterior a este prompt)

El asesor de seguridad de Supabase (`get_advisors security`) marca **401 tablas públicas sin RLS**
(ERROR `rls_disabled_in_public`), entre ellas `ALUMNOS`, `PROFESORES` (con `CLAVE`, que es la contraseña
de login), `ETIQUETAS PERSONALES` (datos médicos), `COMENTARIOS` y `asistencia_alumnos`. El resto de las
tablas consultadas tiene políticas `ALL … USING (true)` para `public`. Es decir: quien tenga la clave
`anon` puede leer **y modificar** casi todo por la API REST. Mitigante medido: la clave `anon` **no** está
en el JavaScript del navegador (0 chunks la contienen); solo la usa el servidor. No se tocó (es un
cambio de seguridad con su propio diseño y su propio SQL): queda como pendiente `rls-tablas-publicas`.

## 4 · Normas respetadas (CONTRATO §2)

| Punto | Cómo |
|---|---|
| 1 · medir antes | `pg_stat_statements`, logs y la traza por paso antes de tocar código |
| 2 · lógica en `lib/` | la caché, la identidad y los extras viven en `lib/`; las actions solo pasan `{ cache: true }` o llaman a `lib`. `perfil-extras-puro.ts` es puro y tiene suite. `app/actions/escolar.ts` baja de 999 a 984 líneas |
| 3 · aditivo | ningún dato tocado; la RPC mantiene firma y permisos; las funciones de sondeo se conservan; sin la v2, el perfil funciona como antes |
| 4 · sin camino paralelo | la caché no es una fuente: guarda la respuesta de la fuente de siempre y solo para lecturas. Escrituras, sin caché |
| 5 · validar | `npm run test:ci` en verde (57/57) |
| 6 · volver a medir | §3 |
| 7 · qué no se tocó | §6 |

## 5 · ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| §11 «revisar la consulta existente, agrupar» | sí: tres consultas en serie → una incrustada; tres lecturas del perfil → dentro de la RPC existente |
| §16 por capas | el costo era de la capa HTTP de datos y ahí se actuó: menos peticiones y más pequeñas. Las cachés guardan solo **datos de referencia comunes** (ciclo, parciales, calendario, portada), nunca datos de un alumno, con caducidad corta e invalidación en cada escritura (como O3 y O5) |
| Seguridad | la RPC sigue solo para `service_role` y no devuelve `password_hash`; las cachés no guardan nada personal |

## 6 · Desviaciones y decisiones propias

- **Caducidad aceptada:** tras activar un ciclo, editar un parcial, el calendario o la portada, las
  **otras** instancias pueden mostrar lo anterior hasta 20 s (ciclo y calendario) o 60 s (portada). La
  instancia que escribe lo ve al instante. Las escrituras nunca leen de la caché.
- **Clonar ciclo y otras escrituras indirectas** (`contexto-ciclo-clonar.ts`, RPCs) no invalidan a mano:
  las cubre la caducidad de 20 s.
- **No tocado pudiendo hacerlo:** la RPC de login (4 peticiones, reglas delicadas de autenticación), el
  catálogo del docente (13), `ALUMNOS` + `numero_control` de la boleta en una consulta, el roster de
  materias por grupo (demasiadas escrituras distintas para invalidarlo con seguridad) y el panel de
  tutores (C-4).

## 7 · Lo no verificado

- **Sin sesión real.** Las actions se ejecutaron reales, pero con la sesión servida por el instrumento.
- **Vercel no se midió**: la carga corre desde un PC con 8 procesos. En Vercel cada instancia tiene su
  propia caché: con muchas instancias frías, las primeras peticiones de cada una no aciertan.
- La prueba se hizo un domingo por la mañana, con la base en reposo. El evento del primer escalón de 300
  muestra que el plan gratuito puede tener minutos lentos ajenos a la app.
