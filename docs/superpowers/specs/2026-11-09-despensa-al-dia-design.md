# Despensa al día: acciones de un toque, ubicaciones, frescos y búsqueda

**Fecha:** 2026-11-09, aprobado el mismo día. **Rama:** `release/5.7`. Bloque 4b del plan; se implementa junto al
bloque 4 (`2026-10-13-congelados-design.md`, estados congelado y abierto) porque los dos
viven en la hoja de cantidad.

## Por qué

Un inventario real por fotos (2026-11-05: 184 productos, 35 lotes abiertos, cuatro sitios)
mostró que la despensa se descuadra por un mal hábito que la app fomenta: se descuenta al
sacar algo del sótano, aunque siga en casa. La regla que la app debe hacer cómoda es:

> Solo se descuenta lo que se acaba o se tira. Mover y abrir no son consumir.

Hoy mover un lote exige abrir la hoja de lotes y elegir ubicación; marcar "abierto" está
escondido en el mismo sitio y no cambia nada; tirar algo no queda registrado como
desperdicio. Además, un usuario pidió por correo categorías en Frescos, y buscar "agua"
saca "aguacate".

## 1. Hoja de cantidad: acciones de un toque

Debajo del contador actual (− / + / Agotar), una fila de acciones. Todas actúan sobre **el
lote que toca por FIFO** (el que antes caduca; abiertos primero) y sobre **una unidad**:

| Acción | Qué hace | Cuándo aparece |
|---|---|---|
| **Abrir 1** | Parte una unidad del lote que toca, la marca abierta, acorta su fecha según el tipo (bloque 4) y, si el tipo pide frío, la mueve a la ubicación de tipo nevera | Hay alguna unidad cerrada |
| **Mover** | Chips con las ubicaciones; mueve una unidad del lote que toca. "Todo" mueve el producto entero | Siempre que haya stock |
| **Congelar / Descongelar** | Bloque 4, con la misma regla de una unidad | Producto de Despensa |
| **Se tiró** | Resta una unidad y la registra como desperdicio | Hay stock |

- "−" sigue siendo "me lo he gastado", y "Agotar" sigue siendo "se acabó todo". No cambian.
- Cada acción muestra un toast con lo que hizo ("Abierto 1 · caduca el 12 nov · Nevera") y
  botón Deshacer, igual que la compra en la lista.
- Quien quiera actuar sobre otro lote usa la hoja de lotes, como hoy. No hay "elegir lote" en
  la hoja de cantidad.

**Se tiró** registra un evento `EXPIRE` con `source: 'discard'`. Así el desperdicio de
Insights, que ya cuenta los `EXPIRE`, lo incluye sin tocar su cálculo. La identidad del
evento lleva el momento del descarte, para que el barrido de caducados (bloque 0) no lo
confunda con un lote caducado.

**Unidad que se mueve o se abre de un lote de varias:** se parte el lote en dos, uno con
esa unidad y otro con el resto, con su misma fecha. Es la misma función que usa congelar
una parte.

## 2. Agrupar Despensa por ubicación

El botón de agrupar pasa de dos estados (lista / por categoría) a tres: **lista · categoría ·
ubicación**. Por ubicación, cada producto aparece bajo cada sitio donde tenga lotes (un
producto con leche en sótano y nevera sale en los dos grupos con su cantidad de ese sitio).
Los lotes sin ubicación van a un grupo "Sin ubicación" al final. El orden de los grupos es
el de la lista de ubicaciones de Ajustes, que el usuario ya puede reordenar.

## 3. Categorías en Frescos

La edición de un fresco gana el mismo selector de categoría que usa la edición de Despensa.
El alta no cambia: sigue pidiendo solo lo rápido (nombre, y si acaso tipo o fecha), igual que
el alta de Despensa, que tampoco pide categoría. El campo `categoryId` ya existe en los
frescos. Agrupar Frescos por categoría queda fuera.

## 4. Búsqueda

`matchesSearchQuery` deja de buscar el texto en cualquier parte del nombre y pasa a buscarlo
**al inicio de cada palabra**, en el nombre y en la categoría:

- "agua" encuentra "Agua mineral" y ya no "Paraguaya". "Aguacate" sigue saliendo: empieza
  por "agua", y mientras se escribe no hay forma de distinguirlo.
- "salsa" encuentra "Salsa ketchup"; "lácteos" encuentra todo lo de esa categoría.
- Varias palabras: todas deben empezar alguna palabra ("lentejas pard" → "Lentejas
  pardinas").

Función pura con tests en `core/domain/pantry`.

## Analítica

`pantry_quick_action` con `action` (`open`, `move`, `freeze`, `thaw`, `discard`),
`product_type` y, en `move`, `to_kind` (tipo de ubicación). `pantry_grouping_toggled` gana
el valor `location`. Propiedades planas.

## Fuera

Elegir lote desde la hoja de cantidad, mover varias unidades a la vez con un selector,
agrupar Frescos, búsqueda difusa (erratas), repaso por ubicación (5.8).

## Lo que solo prueba un dispositivo

El toast con Deshacer sobre el móvil donde los toasts no se ven (bloque 6): si ese
diagnóstico no se arregla, estas acciones quedan sin confirmación visible en ese móvil.
