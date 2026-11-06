# Congelados: un estado más

**Fecha:** 2026-10-13. **Rama:** `release/5.7`. Bloque 4 del orden de la 5.7 (ver
`2026-10-13-release-5.7-build-y-datos-design.md`).

## Por qué

Un producto que se mete en el congelador sigue con su fecha de fresco. A los pocos días la app
lo da por caducado, avisa con una notificación y lo apunta como desperdicio, y nada de eso es
verdad. Hoy ni la categoría "Congelados" ni la ubicación de tipo congelador cambian ninguna
regla: son etiquetas.

Una despensa real con once meses de uso lo confirma. Tiene 20 productos en la categoría
"Congelados", todos en Despensa y ninguno en Frescos. Los congelados de supermercado
(guisantes, varitas de merluza) llevan su fecha impresa, larga, y funcionan bien. Los que se
congelan en casa se reparten en dos apaños: a unos se les borró la fecha a mano, y los otros
siguen con la fecha de fresco y aparecen como caducados y como desperdicio. Ocho productos
llevan "congelado" en el nombre porque la app no ofrece otro sitio donde decirlo.

## Qué se decide

Congelado es un estado, como caducado o stock bajo. Se activa con un botón sobre el producto.
Por dentro la marca vive en cada lote, de modo que se puede congelar una parte y dejar el
resto en la nevera.

Solo para productos de Despensa. Frescos queda fuera de esta versión: su modelo no lleva
unidades y los datos no muestran a nadie congelando ahí.

## Modelo

`ItemBatch` gana dos campos opcionales:

- `frozenAt?: string` — fecha ISO en que se congeló el lote. Su presencia es lo que hace que
  el lote esté congelado.
- `frozenDaysLeft?: number` — los días que le quedaban cuando se congeló.

**Al congelar** un lote con fecha, se guarda en `frozenDaysLeft` cuántos días faltaban (cero
si ya había pasado) y el lote **pierde su `expirationDate`**. Un lote sin fecha solo recibe
`frozenAt`.

Quitar la fecha es la decisión central. Más de diez sitios leen `expirationDate` directamente:
el barrido que registra desperdicio, las notificaciones, la sugerencia de HOY, la cobertura de
Insights y el consumo FIFO, entre otros. Sin fecha, todos ignoran ya el lote. No hay que
enseñarle a cada uno qué es un congelado ni existe el riesgo de olvidarse de uno. Es además lo
que el usuario ya hacía a mano; la diferencia es que ahora la app recuerda cuánto le quedaba.

**Congelar una parte.** Si se congelan menos unidades de las que tiene el lote, el lote se
parte en dos: uno congelado con esas unidades y otro que sigue como estaba. Cuando hay varios
lotes, se congelan primero los que antes caducan.

**Al descongelar**, el lote recibe como fecha hoy más `frozenDaysLeft`, con un máximo de
`THAW_MAX_DAYS = 3`, y pierde `frozenAt` y `frozenDaysLeft`. Un lote que no tenía fecha al
congelarse vuelve a quedar sin fecha. La fecha resultante se edita como cualquier otra. Se
puede descongelar todo o una parte, con la misma regla de partir el lote.

**El stock nuevo nunca entra congelado.** Lo que se compra, se escanea o se da de alta llega
con su fecha normal, aunque el producto ya tenga lotes congelados.

Todo son funciones puras en `core/domain/pantry` (`freezeBatches`, `thawBatches`), escritas
con sus tests primero. Reciben `now` como parámetro.

## Comportamiento del estado

- `ProductStatusState` gana `'frozen'`. `getItemStatusState` lo devuelve cuando **todo** el
  stock que queda está congelado.
- Si hay mezcla, manda la parte no congelada: el producto caduca, avisa y se ordena por sus
  lotes con fecha, como hoy. La fila añade un copo con el número de unidades congeladas.
- Con cantidad cero manda `'low-stock'`, como hoy.
- Orden en la lista: `'frozen'` pesa igual que `'normal'`.
- Un lote congelado no cuenta como "falta la caducidad": `hasMissingExpiry` y
  `countMissingExpiryBatches` lo excluyen.
- Al fusionar lotes (`mergeBatchesByExpiry`), un lote congelado no se junta con uno que no lo
  está, y dos congelados solo se juntan si tienen los mismos `frozenDaysLeft`.
- Al consumir se gasta primero lo no congelado. El orden FIFO actual ya deja al final los
  lotes sin fecha; un test lo fija.
- Un lote congelado no caduca, no avisa, no genera desperdicio y no sale en HOY. No hace falta
  código nuevo, pero cada uno de esos cuatro lleva un test con un lote congelado.
- La lista de la compra no cambia: sigue mirando la cantidad.

## Interfaz

- **Botón "Congelar" en la hoja de cantidad** del producto, que es donde ya se actúa sobre él.
  Con una sola unidad sin congelar, congela al tocar. Con más, pregunta cuántas, con "Todas"
  como opción por defecto.
- **"Descongelar"** aparece en la misma hoja cuando el producto tiene algo congelado, con la
  misma pregunta de cantidad.
- **Fila del producto:** copo y "Congelado" con el tiempo transcurrido cuando todo está
  congelado; copo con el número de unidades cuando es una parte. El tiempo se formatea con
  `DateDisplayService`; la cadena de traducción lleva solo el marco.
- **Hoja de lotes:** el lote congelado muestra el copo y desde cuándo, en lugar de la fecha y
  su selector.
- **Chip de filtro "Congelados"** junto a los de estado: productos con algún lote congelado.
  Como los demás, solo aparece si hay alguno.
- Al descongelar, un toast dice la fecha nueva.
- Textos en los seis idiomas. Icono nuevo registrado en `app-icons.ts`.

## Analítica

`pantry_batch_frozen` y `pantry_batch_thawed`, con `units`, `partial` (si quedó parte del
producto en el otro estado) y, en el segundo, `days_frozen`. Propiedades planas, sin nombres
de producto.

## Copias de seguridad

Los campos nuevos viajan dentro de los documentos, sin migración. Una copia hecha con la 5.7
e importada en una versión anterior pierde el estado: los lotes congelados aparecen sin fecha.

## Abierto: el otro estado del lote

Añadido el 2026-11-05 tras revisar un inventario real por fotos: de 184 productos con stock,
35 lotes estaban abiertos (leche, lata de maíz, salsas, passata, yogur griego, vino, aceite).
Hoy `ItemBatch.opened` existe pero solo es una marca: está escondida en la hoja de lotes y no
cambia la caducidad, así que una lata de maíz abierta en la nevera sigue diciendo que caduca
en 2029. Las propias etiquetas lo dicen: "una vez abierto, refrigerar y consumir en 3–5 días".

Es el gemelo del congelado y se resuelve igual, en el dato:

- **Al abrir** un lote (todo o una parte, partiéndolo como al congelar), se guarda
  `openedAt` y la fecha pasa a ser la menor entre la impresa y hoy más los días tras abrir
  del tipo de alimento (`OPENED_SHELF_DAYS`, tabla nueva en `food-type-profile.domain.ts`:
  conservas y lácteos 3–5 días, salsas y botes semanas, secos y no perecederos sin cambio).
  Se guarda la fecha impresa en `printedExpirationDate` por si se deshace.
- **Ubicación:** si el tipo pide frío al abrirse, se propone mover el lote a la ubicación de
  tipo nevera (sugerencia, no obligatorio).
- **Consumo:** se gasta primero lo abierto. Hoy el FIFO ordena por fecha; con la fecha
  acortada ya sale primero, y un test lo fija.
- **Interfaz:** botón "Abrir" junto a "Congelar" en la hoja de cantidad; la fila muestra
  "Abierto · caduca {{when}}". Un lote abierto no se puede congelar sin descongelarlo antes, y
  viceversa no aplica.
- **Analítica:** `pantry_batch_opened` con `units` y `partial`.

Con esto se cierra la confusión que lo motivó: **se descuenta solo cuando algo se acaba o se
tira; mover o abrir no es consumir**. Mover entre sótano, cocina y nevera cambia la ubicación
del lote; abrir cambia su estado y su fecha.

## Fuera de esta versión

- Congelar productos de Frescos.
- Interruptor "congelado" al dar de alta. Un congelado de supermercado ya trae fecha larga.
- Relación automática con la categoría "Congelados" o con la ubicación de tipo congelador.
- Aviso de "lleva demasiado tiempo congelado".
- Una vista por lugares (despensa, nevera, congelador).

## Lo que solo prueba un dispositivo

Congelar un producto que tenía una notificación de caducidad programada y comprobar que no
llega; descongelarlo y comprobar que se programa la nueva.
