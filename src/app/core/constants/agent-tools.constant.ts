import { AgentToolDefinition } from '@core/models';

export const AGENT_TOOLS_CATALOG: AgentToolDefinition[] = [
  {
    name: 'addProduct',
    description:
      'Añade un producto por nombre indicando cantidad, ubicación y datos opcionales como categoría o caducidad.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del producto.' },
        quantity: { type: 'number', description: 'Cantidad inicial (>0).' },
        location: { type: 'string', description: 'Ubicación donde se guarda.' },
        categoryId: { type: 'string', description: 'Categoría opcional.' },
        expirationDate: { type: 'string', description: 'Fecha de caducidad ISO (opcional).' },
      },
      required: ['name', 'quantity', 'location'],
    },
  },
  {
    name: 'updateProductInfo',
    description: 'Actualiza campos de un producto existente: nombre, categoría, supermercado, básico o umbral mínimo.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto a actualizar.' },
        updates: {
          type: 'object',
          description: 'Campos que se van a modificar.',
          properties: {
            newName: { type: 'string' },
            categoryId: { type: 'string' },
            supermarket: { type: 'string' },
            isBasic: { type: 'boolean' },
            minThreshold: { type: 'number' },
          },
        },
      },
      required: ['name', 'updates'],
    },
  },
  {
    name: 'adjustQuantity',
    description:
      'Modifica la cantidad de un producto (incremento o decremento) en una ubicación concreta, pudiendo indicar el lote.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto a ajustar.' },
        location: { type: 'string', description: 'Ubicación donde se aplica el cambio.' },
        quantityChange: {
          type: 'number',
          description: 'Delta a aplicar (p.ej. +2, -1).',
        },
        expirationDate: {
          type: 'string',
          description: 'Fecha del lote específico que se debe ajustar (opcional).',
        },
      },
      required: ['name', 'location', 'quantityChange'],
    },
  },
  {
    name: 'deleteProduct',
    description: 'Elimina completamente un producto de la despensa.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre exacto del producto.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'moveProduct',
    description: 'Cambia un producto de una ubicación a otra (ej: de Despensa a Nevera) y permite limitarlo a un lote.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto a mover.' },
        fromLocation: { type: 'string', description: 'Ubicación origen.' },
        toLocation: { type: 'string', description: 'Ubicación destino.' },
        quantity: {
          type: 'number',
          description: 'Cantidad a mover (opcional, por defecto todo el stock).',
        },
        expirationDate: {
          type: 'string',
          description: 'Fecha del lote concreto a mover (opcional).',
        },
      },
      required: ['name', 'fromLocation', 'toLocation'],
    },
  },
  {
    name: 'getProducts',
    description: 'Devuelve el listado completo de productos con su cantidad, ubicación y caducidad.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getRecipesWith',
    description: 'Genera recetas usando los ingredientes proporcionados o los que caducan pronto.',
    parameters: {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista opcional de ingredientes prioritarios.',
        },
      },
    },
  },
  {
    name: 'getExpiringSoon',
    description: 'Devuelve productos cuya caducidad es cercana.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Ventana en días a revisar (opcional).' },
      },
    },
  },
  {
    name: 'listByLocation',
    description: 'Lista productos filtrados por ubicación específica.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
      required: ['location'],
    },
  },
  {
    name: 'markOpened',
    description: 'Marca un producto como abierto e incluye la fecha de apertura.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto a marcar.' },
        location: { type: 'string', description: 'Ubicación (opcional).' },
        openedDate: {
          type: 'string',
          description: 'Fecha en ISO (opcional).',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'getCategories',
    description: 'Devuelve la lista de categorías disponibles para clasificar productos.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getLocations',
    description: 'Devuelve las ubicaciones disponibles (Despensa, Nevera, Congelador, etc).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getHistory',
    description: 'Obtiene el historial resumido del producto: creación, última actualización y ubicaciones.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto cuyo historial se solicita.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getSuggestions',
    description: 'Devuelve sugerencias de compra basadas en stock bajo, básicos o caducidades.',
    parameters: {
      type: 'object',
      properties: {
        includeBasics: { type: 'boolean', description: 'Forzar que los básicos aparezcan si están bajos.' },
      },
    },
  },
];
