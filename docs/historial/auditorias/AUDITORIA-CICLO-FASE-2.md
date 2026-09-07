# FASE 2 — EXCEL ACADÉMICO EN EL WIZARD (informe de auditoría)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03

## Estado: BLOCKED (no se implementa F2 sin cerrar los bloqueadores)

> DECISIÓN DE PRODUCTO (sesión 2): la estructura académica del BORRADOR se obtiene
> mediante clonación (`actionClonarContextoAcademico`); el Excel se usa solo para
> roster/inscripciones de alumnos (ver docs/AUDITORIA-CICLO-FASE-3.md).

### 1. Arquitectura encontrada (VERIFICADO EN CÓDIGO)
- Pipeline de carga masiva existente: `actionPrevisualizarCargaAcademica`
  (SOLO LECTURA) + `actionAplicarCargaAcademica` (confirmación explícita por rol)
  → `lib/escolar/carga-academica.ts` (`previsualizar/aplicar`) → preview
  estructurado (alumnos + académico + `bloqueaEscritura`). Consumidores:
  `reconocimiento-academico.tsx` y `configuracion-client.tsx` (FUERA del wizard).
- Parser reutilizado: `archivoCsvAFilas` (lib/escolar/csv); mapeo de columnas
  `mapeoRosterValido/MapeoRoster`.
- `PasoAcademico` actual del wizard: **solo clonar estructura** vía
  `actionClonarContextoAcademico(periodoId, origenId)`; NO importa Excel.

### 2. Bloqueadores reales (GAP, no maquillados)
1. **La carga masiva existente es de ALUMNOS/roster (C3.1), resuelve el contexto
   por `periodoNombre`** (`extraerContexto`) y actúa sobre el periodo OPERATIVO
   (resolución global). NO es un importador genérico de estructura académica
   (grupos/carreras/materias/`grupo_materias`) parametrizable por `periodoId` de
   un BORRADOR.
2. No hay, hasta donde demuestra esta auditoría, un parser de “Excel académico
   de grupos/materias” desacoplado del roster de alumnos. Crear el flujo
   completo del wizard sin inventar parsers nuevos requiere primero confirmar
   qué parte de `carga-academica` puede reutilizarse para grupos/grupo_materias
   y qué parte es específica de alumnos.
3. Sin acceso a Supabase (SQL real) no es verificable la semántica de
   `tabla_legacy`/catálogo en producción.

### 3. Contrato de aislamiento esperado (para la implementación futura)
`grupos` y `grupo_materias` aislados por `periodo_id`/grupo; `materias`/`carreras`
como catálogo; `tabla_legacy` en `grupo_materias` (materia↔tabla 1:N); 1RO sin
carrera. `validarIntegridadCiclo(periodoId)` continúa como autoridad única.

### 4. Tests
```text
test-auditoria-ciclo-f2.mjs     15/15 PASS (estáticos; estado real del flujo)
```
No se ejecutaron tests de Excel funcionales: el flujo requerido no existe aún.

### 5. SQL real
NINGUNO (ni preparado ni ejecutado en esta fase).

### 6. Riesgos restantes
1. Parametrizar `previsualizar/aplicar` (y su dominio) con `periodoId` DESTINO
   (hoy `periodoNombre` → operativo).
2. Decidir qué parser/helpers reutiliza el “Excel académico” (grupos/materias)
   sin duplicar lógica de alumnos.
3. Diseñar UI de preview/confirmación en `PasoAcademico` reutilizando el formato
   de preview existente.
4. Verificación real (F9/F10) pendiente.

### 7. Siguiente fase recomendada
Desbloquear F2 con la parametrización `periodoId` del pipeline existente antes de
avanzar a F3; en paralelo mantener cerradas F4–F8.

## 8. DESBLOQUEO F2 — hallazgo definitivo (2026-09-03, sesión 2)
Auditoría profunda de `lib/escolar/carga-academica.ts` (leerFilasConContexto +
ResumenAcademico con `gruposInexistentes`, `ambiguos`, `nuevasInscripciones`):
el pipeline **NO crea `grupos` ni `grupo_materias`**. Es un importador de ROSTER
de ALUMNOS que resuelve los grupos ya existentes del periodo (operativo) por
identidad académica; si el grupo no existe lo cuenta como `gruposInexistentes`.
Por tanto:
- Parametrizar por `periodoId` NO es suficiente para “cargar estructura
  académica” (grados/grupos/carreras/materias/`grupo_materias`) en un BORRADOR:
  esa funcionalidad no existe en ningún pipeline del repo (el wizard solo
  **clona** estructura desde otro periodo).
- Implementarla exigiría crear un comportamiento de importación nuevo (crear
  grupos/gm) → violaría la regla de oro “no crear otro importador” sin una
  decisión de producto, o depender de un flujo productivo no verificable aquí.
- **CONCLUSIÓN: F2 permanece BLOCKED por ausencia de modelo/código**, no por
  parametrización. Para desbloquear se requiere decisión explícita de producto
  entre: (a) clonar estructura (ya disponible en `PasoAcademico`) + roster por
  `periodoId`, o (b) autorizar un importador nuevo de estructura académica.
