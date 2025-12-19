import { AgentToolDefinition } from '@core/models/agent';

export const AGENT_TOOLS_CATALOG: AgentToolDefinition[] = [
  {
    name: 'addProduct',
    description: 'Añade un producto indicando nombre, cantidad y ubicación.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del producto.' },
        quantity: { type: 'number', description: 'Cantidad a añadir.' },
        location: { type: 'string', description: 'Ubicación destino.' },
        categoryId: { type: 'string', description: 'Identificador de categoría opcional.' },
        expirationDate: { type: 'string', description: 'Fecha de caducidad en formato ISO 8601.' },
      },
      required: ['name', 'quantity', 'location'],
      additionalProperties: false,
    },
  },
  {
    name: 'updateProductInfo',
    description: 'Actualiza los metadatos de un producto existente.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto que se desea modificar.' },
        updates: {
          type: 'object',
          description: 'Campos que se actualizarán.',
          properties: {
            newName: { type: 'string', description: 'Nuevo nombre.' },
            categoryId: { type: 'string', description: 'Categoría objetivo.' },
            supermarket: { type: 'string', description: 'Supermercado asociado.' },
            isBasic: { type: 'boolean', description: 'Marca si es un producto básico.' },
            minThreshold: { type: 'number', description: 'Cantidad mínima deseada.' },
          },
          additionalProperties: false,
        },
      },
      required: ['name', 'updates'],
      additionalProperties: false,
    },
  },
  {
    name: 'adjustQuantity',
    description: 'Ajusta la cantidad de un producto en una ubicación.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto a ajustar.' },
        location: { type: 'string', description: 'Ubicación donde se aplica el cambio.' },
        quantityChange: { type: 'number', description: 'Cantidad a sumar o restar.' },
        expirationDate: { type: 'string', description: 'Fecha de caducidad asociada al ajuste.' },
      },
      required: ['name', 'quantityChange'],
      additionalProperties: false,
    },
  },
  {
    name: 'deleteProduct',
    description: 'Elimina completamente un producto de la despensa.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del producto a eliminar.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'moveProduct',
    description: 'Mueve un producto de una ubicación a otra.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto a mover.' },
        fromLocation: { type: 'string', description: 'Ubicación origen.' },
        toLocation: { type: 'string', description: 'Ubicación destino.' },
        quantity: { type: 'number', description: 'Cantidad a mover.' },
        expirationDate: { type: 'string', description: 'Fecha de caducidad asociada.' },
      },
      required: ['name', 'fromLocation', 'toLocation'],
      additionalProperties: false,
    },
  },
  {
    name: 'getProducts',
    description: 'Devuelve el listado completo de productos con su cantidad, ubicación y caducidad.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'getRecipesWith',
    description:
      'Genera recetas usando una lista explícita de ingredientes. Si la lista está vacía, se usarán productos próximos a caducar.',
    parameters: {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ingredientes a priorizar.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'getExpiringSoon',
    description: 'Devuelve productos próximos a caducar.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Ventana en días para considerar la caducidad.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'listByLocation',
    description: 'Lista productos filtrados por ubicación específica.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Ubicación a consultar.',
        },
      },
      required: ['location'],
      additionalProperties: false,
    },
  },
  {
    name: 'markOpened',
    description: 'Marca un producto como abierto e incluye la fecha de apertura.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Producto a marcar.' },
        location: { type: 'string', description: 'Ubicación del producto.' },
        openedDate: { type: 'string', description: 'Fecha en la que se abrió el producto.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'getCategories',
    description: 'Devuelve la lista de categorías disponibles para clasificar productos.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'getLocations',
    description: 'Devuelve las ubicaciones disponibles (Despensa, Nevera, Congelador, etc).',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
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
      additionalProperties: false,
    },
  },
  {
    name: 'getSuggestions',
    description: 'Devuelve sugerencias de compra basadas en stock bajo, básicos o caducidades.',
    parameters: {
      type: 'object',
      properties: {
        includeBasics: { type: 'boolean', description: 'Incluye productos básicos en las sugerencias.' },
      },
      additionalProperties: false,
    },
  },
];
