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

Ambas son mudas. El fallo está en la captura de foto o antes, y no deja rastro
en ningún sitio: ni PostHog, ni Sentry, ni consola.

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
- `receipt_review_opened` — `{ lines, auto_matched }`
- `receipt_submit_pressed` — `{ included }`

Con esto, el siguiente export dice si falla la cámara, el OCR, el parser o el
submit. Hoy es indistinguible.

`receipt_scan_failed` gana razones: `picker_error`, `no_image`, además de las
dos existentes.

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

## En paralelo, fuera de código

- Ficha de Play Store: conversión −7,7 pp en 28 días. Capturas y primeras dos
  líneas de la descripción.
