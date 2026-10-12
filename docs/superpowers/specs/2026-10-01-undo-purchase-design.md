# Deshacer compra en la lista de la compra

**Fecha:** 2026-10-01. **Rama destino:** por decidir al escribir el plan (nueva, sobre
`release/5.6`). Origen: aplazado desde la 5.5, confirmado en la auditoría del 23/09 como "sin
código muerto que limpiar — solo construir el deshacer real si se decide meterlo en 5.6".

## Por qué

Hoy las filas de "Comprado" en la lista son solo informativas (`list-row-actions.domain.ts`
lo documenta explícitamente: *"Bought rows are read-only: undoing a purchase ... is not
implemented"*). Comprar algo mueve datos reales — añade un lote nuevo o resetea un producto
fresco a "suficiente" — y no hay forma de deshacerlo si fue un toque equivocado.

## Qué construimos

**Ventana de deshacer: mientras la fila siga en "Comprado" de esta visita.** No es una
decisión nueva que construir — `boughtItemIds`/`boughtManuals` ya son señales efímeras que se
vacían en `ionViewWillLeave` (`list-state.service.ts:99-108`, comentario propio: *"Ephemeral
per-visit state"*). Salir de la pestaña de la lista ya borra la sección "Comprado" entera hoy;
el deshacer vive en esa misma señal, con el mismo ciclo de vida — salir de la pestaña
"confirma" las compras sin que haga falta código nuevo para eso.

**Snapshot, no resta.** Comprar no es aditivo de forma limpia: un lote nuevo pasa por
`mergeBatchesByExpiryStock` y puede fusionarse con lotes existentes, perdiendo su identidad
propia; un fresco se resetea del todo. Intentar "restar lo que se compró" sería frágil. En su
lugar: justo antes de mutar el producto, se guarda una copia completa de cómo estaba
(`structuredClone` del `PantryItem`), en una señal nueva y efímera, hermana de
`boughtItemIds`, con el mismo ciclo de vida (se vacía en `ionViewWillLeave`). Deshacer
restaura esa copia entera, no intenta calcular una resta.

**Protección: si el producto cambió por otro lado, no se deja deshacer.** Si compras "Leche"
y luego lo editas desde Despensa (cantidad, fecha...) antes de deshacer, deshacer debe avisar
en vez de machacar ese cambio en silencio. Se guarda el `updatedAt` resultante justo después de
comprar (no el de antes); al pulsar deshacer, se compara con el `updatedAt` actual del
producto — si coincide, nadie lo ha tocado desde la compra y se restaura el snapshot; si no
coincide, se avisa ("ya no se puede deshacer, el producto cambió") y no se toca nada.
(En la práctica esto rara vez se dispara, porque cambiar el producto desde Despensa implicaría
salir de la pestaña de la lista, lo que ya borra la fila de "Comprado" — pero es una
comprobación casi gratis y cierra el hueco por completo, no solo en el caso común.)

**Los 4 casos, según cómo se compró:**

| Caso | Snapshot | Deshacer |
|---|---|---|
| Sugerencia automática, fresco | `PantryItem` completo antes de `restockFreshItem` | `pantryStore.updateItem(snapshot)` |
| Sugerencia automática, normal | `PantryItem` completo antes de `addNewLot` | `pantryStore.updateItem(snapshot)` |
| Manual, empareja con producto existente | Igual que arriba según el tipo del producto emparejado | Igual que arriba |
| Manual, crea producto nuevo | Ninguno (no existía antes) | Borra el producto creado (`pantryStore.deleteItem`) + devuelve la nota manual a la lista pendiente sin marcar |

Para el último caso, `ListManualItemsStore.markManualAsBought()` ya guarda el manual bajo el
mismo `id` dentro de `boughtManuals` al comprarlo (`list-manual-items.store.ts:45-52`) — solo
hace falta un método nuevo `restoreManual(item: ManualItem)` que lo reinserte en
`manualItems` preservando `id`/`createdAt`/nombre tal cual, simétrico a `removeManual`.

## UI

Botón pequeño (icono `arrow-undo-outline`, ya registrado) al final de cada fila de "Comprado",
mismo patrón visual que el botón de comprar en las sugerencias — no toda la fila tocable, para
evitar un deshacer accidental al tocar donde no toca.

```html
@for (bought of state.allBoughtItems; track bought.id) {
  <ion-item class="bought-item" detail="false">
    <ion-icon slot="start" name="checkmark-circle" color="success"></ion-icon>
    <span class="item-name bought-name">{{ bought.name }}</span>
    <button class="undo-btn" (click)="facade.undoPurchase(bought.id)">
      <ion-icon name="arrow-undo-outline"></ion-icon>
    </button>
  </ion-item>
}
```

Al deshacer: toast de confirmación ("Deshecho: Leche"), la fila desaparece de "Comprado" y el
producto vuelve a aparecer en sugerencias si sigue por debajo de su umbral (recalculado solo,
no hace falta lógica nueva — `shoppingAnalysis` ya es un `computed()` sobre el estado actual
del inventario).

## Analítica

Nuevo evento `SHOPPING_BUY_UNDONE`, mismo payload que `SHOPPING_BUY_COMPLETED`
(`{ kind: 'fresh' | 'despensa', reason }`) para poder cruzar cuántas compras se deshacen frente
a las que se confirman.

## Qué NO cambia

- `markAsBought`/`markManualAsBought` siguen haciendo exactamente lo mismo que hoy — el
  snapshot se toma antes de llamarlos, no se tocan por dentro.
- `boughtItemIds`/`boughtManuals` y su vaciado en `ionViewWillLeave` — sin cambios, el snapshot
  nuevo es una señal hermana con el mismo ciclo de vida.
- Nada de esto persiste en PouchDB ni en localStorage — es estado de sesión, igual que las
  propias filas de "Comprado" ya lo son hoy.
- Compras repetidas del mismo producto en la misma visita (p. ej. dos notas manuales con el
  mismo nombre, ambas compradas) no se contemplan de forma especial — caso raro, no merece
  diseño propio ahora.

## Verificación

- `npx ng lint`, `node scripts/check-icons.mjs`, tests, `npx ng build --configuration production`.
- Verificar en el navegador los 4 casos de la tabla, más el caso de protección (comprar algo,
  tocarlo desde Despensa sin salir de la pestaña de la lista — vía consola, simulando la
  edición — y confirmar que el botón de deshacer avisa en vez de machacar).
- QA en dispositivo: confirmar que cambiar de pestaña (Despensa ↔ Compra) de verdad vacía
  "Comprado" como se espera, no solo en el navegador.

## Limitaciones conocidas

- Los eventos de historial escritos al comprar no se revierten al deshacer.
- Si el producto nuevo de una nota manual acaba fusionándose en un producto existente
  (`findMergeCandidate`), esa fila no tiene deshacer (no se muestra el botón).
- Dos compras del mismo producto en una visita solo se deshacen limpiamente de la más nueva a
  la más antigua: deshacer la nueva cambia el `updatedAt` del producto y la antigua avisa de
  que "cambió".
- El botón de deshacer mide 36px, igual que el de comprar, por debajo de los 48dp de Material;
  es coherente con el patrón existente, revisar ambos a la vez.
