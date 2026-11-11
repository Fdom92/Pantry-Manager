# Inferencia de alimentos: tabla maestra de clases (5.8)

**Fecha:** 2026-11-11. **Versión:** 5.8 (rama `release/5.8`), bloque A. Va antes que el
onboarding (`2026-11-11-primera-sesion-5.8-design.md`), que toma de aquí sus sugerencias y
fechas.

## Por qué

Revisión del 2026-11-11: se pasaron 90 nombres reales en español y los 25 básicos en los 6
idiomas por `inferFoodType` y por la tabla de días por tipo. La fecha sugerida cuelga del
`FoodType`, y ese tipo es demasiado grueso para dar días:

| Producto | Tipo inferido | Días sugeridos | Duración real aproximada |
|---|---|---|---|
| pan, pan de molde | carb | 270 | 3–15 |
| pasta fresca | carb | 270 | 15–30 |
| huevos | protein | 5 | ~28 |
| queso curado | dairy | 14 | meses |
| jamón serrano, chorizo | protein | 5 | semanas o meses cerrados |
| patatas fritas (bolsa) | vegetable | 7 | meses |
| guisantes congelados | vegetable | 7 | meses |

Otros fallos encontrados:

- "Sal" o "azúcar" escritos a mano reciben 540 días; como básico, se guardan sin caducidad.
- "Œufs" (fr) y "Grão-de-bico" (pt) no se reconocen: `normalizeSearchQuery` no pliega `œ` y
  no separa por guiones. "Pimienta" no está en ningún idioma.
- Los días abierto son un valor por tipo, con un `shortcut` sin revisar
  (`batch-state.domain.ts`).
- Todo producto nuevo del ticket se guarda como `productType: 'pantry'`: la fruta y los
  yogures nunca llegan a Frescos.
- Un fresco repuesto desde el ticket conserva la fecha anterior (`restockFreshItem`
  copia `previous.expirationDate`), así que lo recién comprado puede salir ya caducado.
- Lo aprendido puede aprender de sus propias sugerencias: los eventos no registran si la
  fecha la puso el usuario (`shortcut` en `learned-shelf-life.domain.ts`).

Hasta la 5.7 la decisión fue no meter excepciones por producto y confiar en lo aprendido.
Lo aprendido no ayuda en la primera sesión, y la 5.8 la convierte en el centro.

## Objetivo

Un único punto que sabe qué es cada alimento, cuánto dura cerrado y abierto, cuánto tras
descongelar y si va a Despensa o a Frescos. Encima, lo que aprende el hogar. Debe crecer
añadiendo datos, no código, y protegerse con tests.

## 1. Clases de conservación

Una **clase** agrupa lo que dura lo mismo cerrado y abierto, sea el producto que sea ("pan
envasado" = pan de molde, tortillas de trigo, pan de hamburguesa). No es un producto.

**Regla de crecimiento**, escrita en la cabecera del archivo: un producto nuevo es un término
en una clase existente. Una clase nueva solo entra si su `sealedDays` u `openedDays` difiere
de forma clara de todas las de su tipo.

**Archivo:** `core/domain/pantry/food-classes.data.ts`. Sustituye a `food-concepts.data.ts`.

```ts
interface FoodClass {
  key: string;                    // estable, kebab-case, no se muestra
  foodType: FoodType;             // padre
  storage: 'pantry' | 'fresh';
  sealedDays: number | null;      // null = no caduca
  openedDays: number | null;      // null = abrir no acorta
  thawDays: number | null;        // null = no aplica → THAW_MAX_DAYS
  source: string;                 // de dónde sale el número
  terms: Record<SupportedLanguage, readonly string[]>;
}
```

- **Una clase genérica por `FoodType`** (`generic-protein`, …, `generic-other`) con valores
  prudentes. Se usa cuando se conoce el tipo pero no la clase.
- **Borrador de clases** (unas 45; los cortes finales salen al rellenar los valores):
  - carne y pescado: carne fresca, carne picada, aves, pescado fresco, marisco, ahumados,
    embutido curado, fiambre cocido, huevos, tofu;
  - lácteos: leche fresca, leche UHT, bebida vegetal, yogur y postres, queso fresco, queso
    curado, mantequilla, nata;
  - pan y cereales: pan fresco, pan envasado, bollería, pasta seca, pasta fresca, arroz y
    grano seco, galletas y cereales;
  - verdura y fruta: hoja verde, verdura de fruto, raíces y tubérculos, fruta blanda, fruta
    común, cítricos, plátano;
  - despensa: conservas, aceite, salsas, sal/azúcar/especias (sin caducidad), café y té,
    legumbres secas, frutos secos, dulces, aperitivos;
  - bebidas, hogar, otros.
- **Valores:** de USDA FoodKeeper (dominio público), el **extremo bajo** de cada rango. Donde
  la práctica en España difiere (huevos en la despensa), se ajusta según la AESAN y se anota
  en `source`. Ningún valor sale de memoria.
- `FOOD_TYPE_PROFILE` conserva solo lo que es del tipo (`coverageWeight`, `chartRank`,
  `suggestible`, `expiryMode`) y pierde `shelfLifeDays`. `EXPIRY_SUGGESTION_DAYS` y su spec se
  sustituyen por los tests de integridad de la sección 6.
- `openedShelfDays` desaparece: lo sustituye `openedDays` de la clase.

**Normalización para clasificar:** función nueva que aplica `normalizeSearchQuery` y además
pliega `œ→oe`, `æ→ae` y trata `-` como espacio. Se usa en los términos y en los nombres solo
para clasificar. **`normalizeProductKey` no cambia:** es la identidad del producto (búsqueda,
duplicados, claves de lo aprendido) y cambiarla podría unir o separar productos ya guardados.

## 2. Resolver la clase de un producto

Función pura `resolveFoodClass(name, foodType?, foodKind?) → FoodClass | null`:

1. Si hay `foodKind` guardado, la clase existe y su padre coincide con `foodType` (o no hay
   `foodType`), se usa esa.
2. Si no, se infiere del nombre: n-gramas de mayor a menor longitud, solo palabras enteras
   (el mismo algoritmo de `inferFoodType`).
3. Si hay `foodType` y la clase inferida tiene otro padre, se usa la genérica de ese
   `foodType`. El tipo elegido o corregido por el usuario manda.
4. Sin clase y sin tipo: `null`. Sin fecha, como hoy.

`inferFoodType(name)` pasa a ser `resolveFoodClass(name)?.foodType ?? null` y conserva su
firma para sus llamadores.

**Guardado:** `PantryItem` gana `foodKind?: string`. `buildAddItemPayload` lo escribe al dar
de alta. Al cambiar el tipo en una edición se recalcula con la regla 3. **Sin migración:** un
producto antiguo resuelve su clase al leerlo y la guarda la próxima vez que se guarda. Los
backups antiguos se importan sin cambios.

## 3. Fecha sugerida

`resolveSuggestedExpiry` mantiene su papel de punto único para todas las altas y reposiciones.
Orden:

1. Clase con `sealedDays: null` → `noExpiry`.
2. **Producto:** mediana de sus últimas 5 altas válidas (lo de hoy, por id y por nombre).
3. **Clase:** mediana de las últimas 5 altas válidas de esa clase, si hay al menos 3.
4. **Tabla:** `sealedDays` de la clase.
5. Sin clase: sin fecha.

**Alta válida para aprender:**

- `PantryEvent` de tipo ADD gana `foodKind?` y `dateFromUser?`.
- Desde la 5.8 solo cuentan las altas con `dateFromUser: true`.
- Las altas anteriores (sin el campo) resuelven su clase con su nombre y su tipo, y se
  descartan si su fecha coincide con el valor por defecto que tenía su tipo. Ese valor viejo
  se conserva como constante de compatibilidad, con su motivo en un comentario.
- Nunca cuentan los lotes congelados ni fechas de 0 días o menos.
- `dateFromUser` ya existe en las filas del alta (`ExpiryEditableRow`) y llega hasta
  `logAddNewItem` / `logAddExistingItem` (12 llamadas). La reposición desde la lista de la
  compra y las fechas del ticket que el usuario no tocó envían `false`.

`learnShelfLifeDays` devuelve las dos medianas (por producto y por clase) y
`ShelfLifeLearningService` las expone. El resultado indica de qué nivel salió, para la pista
de la sección 5.

## 4. Abrir y descongelar

- `openOne` usa el `openedDays` de la clase del producto. La regla de no alargar nunca lo que
  dice el envase no cambia. Lo de abrir no se aprende.
- `thawOne` usa `min(thawDays de la clase ?? THAW_MAX_DAYS, días que quedaban)`. Congelar no
  cambia.
- No se propone volver a congelar: la app no sabe cómo se descongeló.

## 5. Despensa o Frescos

| Flujo | Cambio |
|---|---|
| Ticket, producto nuevo | `storage` de su clase; desconocido → `'pantry'` |
| Ticket, fresco ya existente | fecha nueva sugerida por su clase, no la del lote anterior |
| Onboarding, nombre escrito | `storage` de su clase; desconocido → `'pantry'` |
| Modales de Despensa / Frescos | sin cambios: el usuario ya eligió al abrir uno u otro |
| Sugerencias de básicos | `storage` de su clase |

- Un fresco nuevo desde el ticket se crea como en el modal de Frescos: un lote con
  `FRESH_QTY.sufficient` y la fecha de su clase. La cantidad del ticket se ignora.
- **Revisión del ticket:** cada línea nueva muestra en su acordeón un chip Despensa / Frescos
  que se puede cambiar.
- **Pista bajo la fecha sugerida** (modales de añadir, onboarding, ticket): "Según tus
  compras anteriores" si sale de los niveles 2–3, "Estimada para este tipo de producto" si
  sale del 4. Dos claves i18n nuevas; las clases no se traducen.

## 6. Pruebas

Test-first en `core/domain`:

- **Integridad de la tabla:** cada clase tiene padre, `source` y términos en los 6 idiomas;
  ningún término está en dos clases; `openedDays ≤ sealedDays`; hay una genérica por
  `FoodType`; los días son positivos o `null`.
- **Fixture de nombres reales** → clase esperada, empezando por los 90 de la revisión, más
  "œufs", "grão-de-bico", "pimienta", "patatas fritas", "sal".
- `resolveFoodClass`: las cuatro reglas, con tipo que manda sobre nombre.
- `resolveSuggestedExpiry`: los cinco niveles y el umbral de 3 en la clase.
- `learnShelfLifeDays`: `dateFromUser`, compatibilidad con eventos viejos, congelados fuera,
  `foodKind` del evento por delante del recalculado.
- `openOne` / `thawOne` con los días de la clase.
- Ticket: fresco nuevo con un lote "suficiente"; fresco repuesto con fecha nueva; chip de
  `storage`.
- `normalizeProductKey` sin cambios (test de regresión con `œ` y guiones).

Antes de dar por hecha cada tarea: lint, `check-icons`, tests y build de producción.

## Medición

- `receipt_scan_completed` gana `fresh_lines` y `storage_changed`.
- Los eventos de alta existentes ganan `expiry_source` (`learned_product` |
  `learned_class` | `table` | `none` | `user`). Así se ve en PostHog qué parte de las fechas
  pone la tabla y cuánto corrige el usuario.

## Fuera de alcance

Emparejamiento del ticket y la línea de huevos (bloque C), reposición (bloque D), mostrar las
clases en el selector de tipo, aprender los días abierto, sugerir el nombre genérico de una
marca.

## Solo lo prueba un dispositivo

Ticket real con fruta, lácteos y frescos ya existentes (Despensa / Frescos, fechas nuevas);
escaneo inteligente PRO con un ticket real (sus líneas pasan por la misma inferencia).
