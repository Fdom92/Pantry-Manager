# 5.4 — Observabilidad del escaneo de ticket

**Fecha:** 2026-09-03
**Estado:** diseño aprobado, pendiente de plan de implementación

## Resumen

El escaneo de ticket, feature estrella de la 5.1, tiene **0% de finalización en
producción**. La 5.4 deja de añadir features al bucle de consumo y se dedica a
que el fallo sea visible y a arreglar lo que aparezca.

## La evidencia

Export de PostHog, 30 días hasta 2026-09-03, filtro interno activo, entorno
`prod`: 24 usuarios, 48 sesiones, 917 eventos.

| Señal | Valor |
|---|---|
| `receipt_scan_started` | 11 (6 usuarios distintos) |
| `receipt_scan_completed` | **0** |
| `receipt_scan_failed` | **0** |
| `receipt_line_edited` | 1 |
| `pantry_item_added` con `source: 'receipt_scan'` | **0** de 35 altas |

Dos señales independientes a cero: no es un fallo de analítica, la feature no
completa.

El patrón temporal es la firma de un error mudo — el usuario toca el botón, no
pasa nada, y vuelve a tocar:

```
e3ad30   14:16:34  started
e3ad30   14:16:42  started        ← 8 s después
e3ad30   14:17:12  line_edited    ← una vez sí llegó al review sheet
e3ad30   14:17:45  started
e3ad30   14:18:55  started
c61a87   07:18:00 / 07:18:44 / 07:20:16  started ×3 en 2 minutos
```

### Dónde está el fallo

`RECEIPT_SCAN_FAILED` se emite en dos sitios, ambos **después** del OCR
(`reason: 'no_products'` y `reason: 'ocr_error'`). Nunca se emitió. Por tanto la
ejecución **no llega al bloque de OCR**.

Solo hay dos salidas antes de ese punto, en
`pantry-receipt-scan-modal-state.service.ts:74`:

```ts
} catch {
  // Picker cancelled — nothing to do.
  return;              // ← sin analytics, sin log, sin toast
}
if (!base64) return;   // ← ídem
```

Ambas son mudas: no dejan rastro ni en PostHog, ni en Sentry, ni en consola.

**Corrección (misma sesión).** La primera lectura de esto fue "el fallo está en
la captura de foto o antes". Es más de lo que los datos sostienen. Cero
`receipt_scan_failed` solo descarta dos cosas: que el OCR reviente y que el
parser saque cero productos. **No descarta que el review sheet se abriera y el
usuario lo cerrara sin guardar** — ese camino tampoco emitía ningún evento.

Las dos historias dejan exactamente la misma huella, un `receipt_scan_started`
suelto:

```
A) started → el picker falla en silencio                    → nada más
B) started → OCR bien → parser bien → review → se va        → nada más
```

Y la segunda gana peso: en el dispositivo de desarrollo funcionan **cámara y
galería**, así que el fallo universal es poco probable. El sospechoso pasa a ser
la calidad del parseo, con límites ya documentados (OCR que parte palabras;
Aldi, Dia, Eroski, Alcampo y Consum nunca probados).

Esto **no cambia el trabajo**, lo justifica: distinguir A de B es exactamente lo
que la 5.4 construye. Sí retira una propuesta — sustituir `CameraSource.Prompt`
por un action sheet propio para saber cámara vs galería — porque con ambas rutas
funcionando ese bit deja de ser el más informativo.

### Lo que se descartó por inspección

- **Permisos:** el manifest fusionado del build de release no declara `CAMERA`,
  y **eso es correcto**. `@capacitor/camera` v7 usa `ACTION_IMAGE_CAPTURE` y el
  Photo Picker; su README dice explícitamente que no requiere permisos.
  Declarar `CAMERA` sin usarlo lo empeoraría: Android exigiría concederlo.
- **FileProvider:** declarado, con `file_paths.xml` correcto.
- **Package visibility:** la query de `android.media.action.IMAGE_CAPTURE` está
  presente en el manifest fusionado.

**Conclusión: la causa no es determinable desde el código.** Requiere evidencia
de runtime. Ese es el argumento central de esta versión.

### Hueco menor encontrado

Falta el bloque `<service>` con `MODULE_DEPENDENCIES` /
`photopicker_activity:0:required` que pide el README del plugin. Sin él, en
dispositivos sin Photo Picker del sistema la galería cae a
`ACTION_OPEN_DOCUMENT`. Es una degradación, no la causa raíz.

## Alcance

### 1. Quitar los `catch` mudos

`startScan()` debe distinguir tres casos:

| Caso | Acción |
|---|---|
| Cancelación real del usuario | Salir en silencio (correcto hoy) |
| Excepción del plugin | `logger.error` (→ Sentry) + toast + `receipt_scan_failed` |
| Foto sin `base64String` | `logger.error` + toast + `receipt_scan_failed` |

Capacitor no expone un tipo de error estable para "cancelado", así que la
distinción se hace por mensaje conocido (`cancel`, `User cancelled photos app`)
con **el fallo como opción por defecto**: ante la duda, reportar. Un falso
positivo en Sentry es barato; un fallo invisible ya ha costado una feature.

Mismo patrón en `list-state.service.ts:254` (compartir lista en texto),
reportado como muerto en el QA de la 5.3.

### 2. Instrumentar el embudo

Entre `started` y `completed` no hay nada. Eventos nuevos:

- `receipt_photo_captured` — `{ source: 'camera' | 'gallery' | 'unknown', bytes }`
- `receipt_ocr_finished` — `{ blocks, lines, ms }`
- `receipt_parse_finished` — `{ rows, items, supermarket, mode }`
- `receipt_review_opened` — `{ lines, auto_matched, included }`
- `receipt_submit_pressed` — `{ included }`
- `receipt_review_abandoned` — `{ lines, included, mode, supermarket }`

El último es el que separa las historias A y B de arriba, y por eso es el más
importante de los seis.

### 2b. El mismo agujero en el camino de consumo

`pantry_consume_modal_opened` daba 5 aperturas por 5 usuarios distintos y
`pantry_item_consumed` cero, sin nada en medio. Misma ambigüedad, mismo remedio:

- `pantry_consume_entry_added` — separa "abrió y se fue sin elegir nada" de
  "eligió y luego no guardó"
- `pantry_consume_modal_abandoned` — `{ entries, units }`
- `pantry_quantity_sheet_opened` — el denominador que le faltaba a
  `pantry_quantity_adjusted`, en el camino por el que la gente consume de verdad
- `pantry_item_deleted` gana `had_stock` y `quantity` — para contrastar la
  hipótesis de que borran en vez de consumir (23 borrados contra 19 ajustes)

**Fuera a propósito:** añadir, onboarding y paywall ya tienen pares
apertura/finalización y no necesitan eventos nuevos.

### 2c. Hallazgo lateral: `close()` del modal de consumir es código muerto

El modal emite `willDismiss` antes que `didDismiss`. `dismiss()` pone
`consumeModalOpen` a `false`, y la guarda de `close()` (`if
(!this.consumeModalOpen()) return;`) sale antes de limpiar nada. La limpieza de
`close()` no se ejecuta nunca. No se ha tocado el comportamiento — solo se ha
puesto el evento de abandono en `dismiss()`, que sí corre. Queda anotado.

Con esto, el siguiente export dice si falla la cámara, el OCR, el parser o el
submit. Hoy es indistinguible.

`receipt_scan_failed` gana razones: `picker_error`, `no_image`, además de las
dos existentes.

### 2d. Perfiles de persona — el agujero mayor, y no eran eventos

`posthog.init()` no pasaba `person_profiles`, y posthog-js usa
`'identified_only'` por defecto. Como la app **nunca llama a `identify()`**,
jamás se creó un perfil: todos los eventos llegaban `propertyless` y PostHog no
podía construir **ni una sola cohorte**. 67 tipos de evento y ninguna forma de
preguntar *quién* los hacía.

`buildPersonProfile()` (`core/domain/analytics/`) decide qué se envía: cuentas,
buckets y booleanos, nunca nombres ni texto libre. El tamaño de despensa va
**bucketizado** por la misma razón por la que un valor raro es una huella
dactilar — "6-20 productos" hace la cohorte, "exactamente 137" empieza a
describir un hogar. Reutiliza el predicado `isIncomplete` que ya filtran el chip
de Despensa y los insights gratuitos, en vez de mantener una segunda definición
que derivaría.

Se envía tras cargar la primera página de despensa y en cada vuelta a primer
plano; enviarlo antes reportaría a todo usuario recurrente como vacío.

Con esto la pregunta que importa pasa a ser contestable: **de los 18 usuarios
que no volvieron tras una sesión, ¿cuántos tenían la despensa vacía?**

### 3. Añadir el bloque `<service>` del Photo Picker

Según el README del plugin.

### 4. Specs, dirigidas

Solo sobre lo que se toca. No hay barrido de `features/` ni `shared/`: en la 5.2
cuatro de cinco bugs graves estaban en ficheros con tests que pasaban, y los 8
de la 5.3 salieron de ejecutar la app. Escribir specs sobre código que no se
toca documenta los bugs en vez de encontrarlos.

- Spec de la clasificación de errores de `startScan()` — cancelación vs fallo.
- Spec del embudo: que cada fase emite su evento.

### 5. Verificación en dispositivo

Es la parte que ningún test cubre y la que encontró los 8 bugs de la 5.3.
Escaneo real por cámara y por galería, en un dispositivo que **no** sea el de
desarrollo.

## La feature: preguntar qué significa "borrar"

Borrar un producto que aún tiene stock casi nunca es corregir un error — es
alguien diciendo "me lo he acabado" con el único botón que la app le daba. 23
borrados contra 19 ajustes de cantidad en 30 días, y cada uno tiró el histórico
de consumo del que viven el waste tracker y los insights.

Ahora se pregunta. **"Se ha acabado"** vacía el stock por el camino FIFO normal,
así que queda como `CONSUME` en el histórico y **el producto sigue en la
despensa**, donde la lista de la compra puede verlo caer bajo su umbral.
**"Borrar producto"** se comporta igual que siempre. Con stock a cero se
mantiene el confirm de siempre: la pregunta extra solo aparece donde cambia el
resultado.

`pantry_delete_intent_resolved` registra qué verbo se eligió, para poder juzgar
la pantalla en el siguiente export en vez de por fe.

## Fuera de alcance

| Descartado | Motivo |
|---|---|
| L3 — el ticket reconcilia la despensa | Se apoya en un flujo con 0% de finalización. Vuelve cuando el ticket funcione |
| L6 — modal de consumir con candidatos | El ranking necesita histórico de consumo, y el histórico es pobre porque consumir está roto. Además: 5 aperturas del modal actual, 5 usuarios, 0 conversiones — hay que entender el abandono antes de rediseñar |
| Barrido de specs en `features/` y `shared/` | Ver §4 |
| "Cociné esto", foto a receta | Bloqueo estructural de unidades: `ItemBatch.quantity` no tiene unidad |

## Hallazgos anotados, no abordados aquí

- **Borran en vez de consumir.** `pantry_item_deleted`: 23 eventos / 3 usuarios,
  frente a 19 `pantry_quantity_adjusted`. Borrar destruye el histórico de
  consumo — probable causa de que el waste tracker y los insights vayan cortos
  de datos.
- **El modal de consumir se abandona.** 5 aperturas, 5 usuarios, 0 conversiones.
- **Retención.** 18 de 24 usuarios tienen una sola sesión. Mediana de sesión: 59
  segundos. 19/48 sesiones escriben algo en la despensa.
- **TTL silencioso.** Los items manuales de la lista se autoborran a los 7 días
  sin avisar (`list-manual-items.store.ts`).
- **Scheduler sin red.** `notification-scheduler.service.ts`: 269 líneas, cero
  spec. `capacitor-notification.plugin.ts` devuelve `'denied'` si el plugin
  falla, así que la app no distingue rechazo de avería.

## Criterio de éxito

En el export siguiente a publicar la 5.4:

1. `receipt_scan_started` y `receipt_scan_completed` dejan de ser 11 y 0. Si
   siguen fallando, **el export dice en qué fase** — eso ya es un éxito parcial.
2. `pantry_item_added` con `source: 'receipt_scan'` deja de ser cero.
3. Aparecen eventos en Sentry cuando la cámara falla, en vez de silencio.
4. PostHog tiene perfiles de persona y se pueden construir cohortes — en
   particular "una sola sesión" × `pantry_size: 'empty'`.
5. `pantry_delete_intent_resolved` dice qué fracción de los borrados eran en
   realidad consumo. Si domina `consumed`, la hipótesis era correcta y el
   histórico deja de sangrar.

## En paralelo, fuera de código

- Ficha de Play Store: conversión −7,7 pp en 28 días. Capturas y primeras dos
  líneas de la descripción.
