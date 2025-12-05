import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';
import {
  AgentMessage, AgentModelMessage, AgentModelRequest,
  AgentModelResponse,
  AgentRole,
  AgentToolCall,
  AgentToolDefinition, ItemBatch, ItemLocationStock, MeasurementUnit, MoveBatchesResult, PantryItem, RawToolCall,
  ToolExecution
} from '@core/models';
import { createDocumentId } from '@core/utils';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom, timeout as rxTimeout } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AppPreferencesService, DEFAULT_LOCATION_OPTIONS } from './app-preferences.service';
import { PantryService } from './pantry.service';
import { RevenuecatService } from './revenuecat.service';

@Injectable({
  providedIn: 'root',
})
export class AgentService {
  // Backend endpoint for the LLM agent (OpenAI proxy).
  private readonly apiUrl = environment.agentApiUrl ?? '';
  // Max time to wait for the agent HTTP call before timing out.
  private readonly requestTimeoutMs = 30000;
  private readonly messagesSignal = signal<AgentMessage[]>([]);
  readonly messages = computed(() => this.messagesSignal());
  readonly thinking = signal(false);

  private readonly locationSynonyms: Record<string, string> = {
    despensa: 'Despensa',
    pantry: 'Despensa',
    armario: 'Despensa',
    alacena: 'Despensa',
    cupboard: 'Despensa',
    cabinet: 'Despensa',
    larder: 'Despensa',
    storage: 'Despensa',
    nevera: 'Nevera',
    frigo: 'Nevera',
    refrigerador: 'Nevera',
    refrigerator: 'Nevera',
    fridge: 'Nevera',
    cocina: 'Cocina',
    encimera: 'Cocina',
    counter: 'Cocina',
    countertop: 'Cocina',
    kitchen: 'Cocina',
    mesa: 'Cocina',
    table: 'Cocina',
    congelador: 'Congelador',
    freezer: 'Congelador',
    'deep freezer': 'Congelador',
  };

  private readonly toolsCatalog: AgentToolDefinition[] = [
    {
      name: 'addProduct',
      // ensure the model receives a proper function tool definition
      // (backend normalizes to include type:function as well)
      description: 'Añade un producto con lote y ubicación',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del producto (ej. leche entera)' },
          categoryId: { type: 'string', description: 'Categoría interna si se conoce (opcional)' },
          quantity: { type: 'number', description: 'Cantidad a registrar (>0)' },
          location: { type: 'string', description: 'Ubicación destino' },
          expirationDate: { type: 'string', description: 'Fecha de caducidad en ISO o texto interpretable', enum: [] },
        },
        required: ['name', 'quantity', 'location'],
      },
    },
    {
      name: 'moveProduct',
      description: 'Mueve stock entre ubicaciones (si no se indica cantidad se mueven todos los lotes)',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Producto a mover' },
          fromLocation: { type: 'string', description: 'Ubicación actual' },
          toLocation: { type: 'string', description: 'Ubicación destino' },
          quantity: { type: 'number', description: 'Cantidad a mover (opcional)' },
        },
        required: ['name', 'fromLocation', 'toLocation'],
      },
    },
    {
      name: 'adjustQuantity',
      description: 'Ajusta la cantidad de un producto en una ubicación (positivo o negativo)',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Producto a ajustar' },
          location: { type: 'string', description: 'Ubicación' },
          quantityChange: { type: 'number', description: 'Delta de cantidad (+/-)' },
        },
        required: ['name', 'location', 'quantityChange'],
      },
    },
    {
      name: 'getExpiringSoon',
      description: 'Obtiene productos que caducan pronto',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Ventana de días' },
        },
        required: ['days'],
      },
    },
    {
      name: 'getRecipesWith',
      description: 'Genera recetas basadas en ingredientes disponibles',
      parameters: {
        type: 'object',
        properties: {
          ingredientList: { type: 'array', description: 'Ingredientes a usar', items: { type: 'string' } },
        },
        required: ['ingredientList'],
      },
    },
    {
      name: 'getProducts',
      description: 'Lista completa de la despensa',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'consumeProduct',
      description: 'Resta cantidad de un producto (uso/consumo rápido)',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del producto' },
          quantity: { type: 'number', description: 'Cantidad a descontar (>0)' },
          location: { type: 'string', description: 'Ubicación (opcional, se usa la primera si no se indica)' },
        },
        required: ['name', 'quantity'],
      },
    },
    {
      name: 'markOpened',
      description: 'Marca un lote como abierto en una ubicación',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Producto' },
          location: { type: 'string', description: 'Ubicación (opcional)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'listLowStock',
      description: 'Devuelve productos bajo mínimo para reponer',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'listByLocation',
      description: 'Lista los productos de una ubicación concreta',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'Ubicación a listar' },
        },
        required: ['location'],
      },
    },
    {
      name: 'depleteProduct',
      description: 'Marca un producto como agotado en todas las ubicaciones',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Producto a marcar como agotado' },
        },
        required: ['name'],
      },
    },
  ];

  constructor(
    private readonly http: HttpClient,
    private readonly pantryService: PantryService,
    private readonly appPreferences: AppPreferencesService,
    private readonly translate: TranslateService,
    private readonly revenuecat: RevenuecatService,
  ) {}

  private t(key: string, params?: Record<string, any>): string {
    return this.translate.instant(key, params);
  }

  async sendMessage(userText: string): Promise<AgentMessage | null> {
    const trimmed = (userText ?? '').trim();
    if (!trimmed) {
      return null;
    }

    const userMessage = this.createMessage('user', trimmed);
    this.messagesSignal.update(history => [...history, userMessage]);
    this.thinking.set(true);

    try {
      const response = await this.processWithModel();
      return response;
    } catch (err: any) {
      console.error('[AgentService] sendMessage error', err);
      const errorMessage = this.createMessage('assistant', 'Algo fue mal hablando con el agente. ¿Puedes intentar de nuevo?', 'error');
      this.messagesSignal.update(history => [...history, errorMessage]);
      return errorMessage;
    } finally {
      this.thinking.set(false);
    }
  }

  resetConversation(): void {
    this.messagesSignal.set([]);
    this.thinking.set(false);
  }

  private async processWithModel(): Promise<AgentMessage> {
    let latestAssistant: AgentMessage | null = null;
    let safetyCounter = 0;

    while (safetyCounter < 4) {
      safetyCounter += 1;
      // Build payload with history + tool definitions
      const response = await this.callModel(await this.buildModelRequest());
      // Append assistant placeholder/response
      latestAssistant = this.appendAssistantFromModel(response);
      const toolCalls = this.extractToolCalls(response);
      if (!toolCalls.length) {
        return latestAssistant;
      }

      // Execute each tool call sequentially and append tool messages
      for (const call of toolCalls) {
        const result = await this.executeToolCall(call);
        // Keep the tool result message with the call id to satisfy OpenAI API requirements
        result.message.toolCallId = call.id ?? result.message.toolCallId;
        this.messagesSignal.update(history => [...history, result.message]);
      }
      // Loop will call the model again with the new tool results
    }

    return latestAssistant ?? this.createMessage('assistant', this.t('agent.messages.noResponse'), 'error');
  }

  // Create a chat message with metadata (used for user/assistant/tool entries).
  private createMessage(role: AgentRole, content: string, status: AgentMessage['status'] = 'ok'): AgentMessage {
    return {
      id: createDocumentId('msg'),
      role,
      content,
      status,
      createdAt: new Date().toISOString(),
    };
  }

  private async buildModelRequest(): Promise<AgentModelRequest> {
    const locationOptions = await this.getLocationOptions();
    const system = [
      'Eres un asistente para gestionar una despensa doméstica.',
      'Siempre valida parámetros: nombre, cantidad positiva, ubicación válida.',
      'Usa solo las herramientas disponibles. No inventes parámetros.',
      'No crees productos si el usuario no lo pidió explícitamente.',
      'Si faltan datos, pide clarificación en español.',
      'Ubicaciones válidas y sinónimos:',
      JSON.stringify({ options: locationOptions, synonyms: this.locationSynonyms }),
      'Responde con tono amable y directo, incluye resúmenes estructurados cuando tengas datos.',
    ].join('\n');

    const modelMessages: AgentModelMessage[] = this.messages()
      .map(msg => this.toModelMessage(msg))
      .filter(Boolean) as AgentModelMessage[];

    return {
      system,
      messages: modelMessages,
      tools: this.toolsCatalog,
      context: { locations: locationOptions, synonyms: this.locationSynonyms },
    };
  }

  // Convert UI messages into the format expected by the model/tool API.
  private toModelMessage(message: AgentMessage): AgentModelMessage | null {
    const content = message.modelContent ?? message.content;
    if (!content.trim()) {
      return null;
    }
    if (message.role === 'tool') {
      return {
        role: 'tool',
        name: message.toolName,
        tool_call_id: message.toolCallId,
        content,
      };
    }
    if (message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
      return {
        role: 'assistant',
        content,
        tool_calls: message.toolCalls,
      } as any;
    }
    return {
      role: message.role,
      content,
    };
  }

  private async callModel(payload: AgentModelRequest): Promise<AgentModelResponse> {
    if (!this.apiUrl) {
      console.warn('[AgentService] agentApiUrl is empty, skipping remote call');
      return {
        content: this.t('agent.messages.noEndpoint'),
      };
    }
    try {
      return await firstValueFrom(
        this.http
          .post<AgentModelResponse>(this.apiUrl, payload, {
            headers: this.buildProHeaders(),
          })
          .pipe(rxTimeout(this.requestTimeoutMs))
      );
    } catch (err: any) {
      console.error('[AgentService] callModel failed', err);
      return {
        error: this.t('agent.messages.callFailed'),
        content: this.t('agent.messages.callFailed'),
      };
    }
  }

  private extractToolCalls(response: AgentModelResponse): AgentToolCall[] {
    if (response.tool && response.arguments) {
      return [
        {
          id: response.tool_call_id,
          name: response.tool,
          arguments: this.parseArguments(response.arguments),
        },
      ];
    }

    const toolCalls: AgentToolCall[] = [];
    const fromMessage = (response.message?.tool_calls ?? response.message?.toolCalls) as RawToolCall[] | undefined;
    if (Array.isArray(fromMessage)) {
      for (const call of fromMessage) {
        const name = (call as any).function?.name ?? (call as any).name;
        if (!name) continue;
        toolCalls.push({
          id: call.id,
          name,
          arguments: this.parseArguments((call as any).function?.arguments ?? (call as any).arguments),
        });
      }
    }
    return toolCalls;
  }

  // Safely parse tool arguments (stringified JSON or object).
  private parseArguments(raw: any): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return { value: raw };
      }
    }
    return raw;
  }

  // Attach PRO/user id headers so the backend can apply auth/context.
  private buildProHeaders(): Record<string, string> | undefined {
    const userId = this.revenuecat.getUserId();
    if (!userId) {
      return undefined;
    }
    return {
      'x-user-id': userId,
    };
  }

  private appendAssistantFromModel(response: AgentModelResponse): AgentMessage {
    const hasToolCalls = Array.isArray((response.message as any)?.tool_calls);
    let content = response.message?.content || response.content || '';
    const processingMessage =
      hasToolCalls && !content
        ? this.createMessage('assistant', this.t('agent.messages.processing'), response.error ? 'error' : 'ok')
        : null;

    if (processingMessage) {
      this.messagesSignal.update(history => [...history, processingMessage]);
    }

    // If we have actual content (final answer), append it and drop the processing placeholder.
    if (content) {
      const assistantMessage = this.createMessage('assistant', content, response.error ? 'error' : 'ok');
      if (hasToolCalls) {
        assistantMessage.toolCalls = (response.message as any).tool_calls;
      }
      this.messagesSignal.update(history =>
        [
          ...history.filter(msg =>
            msg !== processingMessage &&
            !(msg.role === 'assistant' && msg.content === this.t('agent.messages.processing'))
          ),
          assistantMessage,
        ]
      );
      return assistantMessage;
    }

    // No content and no tool calls: fallback message
    const fallback = this.createMessage(
      'assistant',
      response.error || this.t('agent.messages.noResponse'),
      response.error ? 'error' : 'ok'
    );
    this.messagesSignal.update(history => [...history, fallback]);
    return fallback;
  }

  private async executeToolCall(call: AgentToolCall): Promise<ToolExecution> {
    switch (call.name) {
      case 'addProduct':
        return this.wrapToolResult(call.name, await this.handleAddProduct(call.arguments));
      case 'moveProduct':
        return this.wrapToolResult(call.name, await this.handleMoveProduct(call.arguments));
      case 'adjustQuantity':
        return this.wrapToolResult(call.name, await this.handleAdjustQuantity(call.arguments));
      case 'getExpiringSoon':
        return this.wrapToolResult(call.name, await this.handleGetExpiringSoon(call.arguments));
      case 'getRecipesWith':
        return this.wrapToolResult(call.name, await this.handleGetRecipes(call.arguments));
      case 'getProducts':
        return this.wrapToolResult(call.name, await this.handleGetProducts());
      case 'consumeProduct':
        return this.wrapToolResult(call.name, await this.handleConsumeProduct(call.arguments));
      case 'markOpened':
        return this.wrapToolResult(call.name, await this.handleMarkOpened(call.arguments));
      case 'listLowStock':
        return this.wrapToolResult(call.name, await this.handleListLowStock());
      case 'listByLocation':
        return this.wrapToolResult(call.name, await this.handleListByLocation(call.arguments));
      case 'depleteProduct':
        return this.wrapToolResult(call.name, await this.handleDepleteProduct(call.arguments));
      default: {
        const message = this.createMessage(
          'assistant',
          this.t('agent.messages.toolUnavailable', { name: call.name }),
          'error',
        );
        return { tool: call.name, success: false, message };
      }
    }
  }

  // Normalize tool handler outputs into a ToolExecution with tool metadata.
  private wrapToolResult(tool: string, result: { message: AgentMessage; success: boolean } & { id?: string }): ToolExecution {
    return {
      tool,
      success: result.success,
      message: {
        ...result.message,
        role: 'tool',
        toolName: tool,
        toolCallId: result.message.toolCallId ?? result.id,
      },
    };
  }

  // Add stock to an item (create it if missing), respecting category/location/batches.
  private async handleAddProduct(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const name = this.normalizeText(args?.['name']);
    const categoryId = this.normalizeText(args?.['categoryId']);
    const quantity = this.toNumber(args?.['quantity']);
    const locationInput = args?.['location'] as string;
    const expirationDate = this.normalizeDate(args?.['expirationDate']);

    if (!name) {
      return this.errorResult(this.t('agent.errors.missingName'));
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return this.errorResult(this.t('agent.errors.quantityPositive'));
    }

    const resolvedLocation = await this.resolveLocation(locationInput);
    if (!resolvedLocation) {
      const details = [
        this.t('agent.details.options', { value: Object.values(this.locationSynonyms).join(', ') }),
      ];
      return this.errorResult(this.t('agent.errors.unknownLocation'), details);
    }

    const existing = await this.findItemByName(name);
    const unit = existing?.locations[0]?.unit ?? MeasurementUnit.UNIT;
    const effectiveCategoryId = categoryId || existing?.categoryId || '';
    const batch: ItemBatch = {
      batchId: createDocumentId('batch'),
      quantity,
      unit,
      expirationDate: expirationDate ?? undefined,
    };

    const updatedItem = existing
      ? this.addBatchToExistingItem(existing, resolvedLocation, batch, effectiveCategoryId)
      : this.buildNewItem(name, resolvedLocation, batch, effectiveCategoryId);

    const saved = await this.pantryService.saveItem(updatedItem);
    await this.pantryService.reloadFromStart();

    const summary = existing
      ? this.t('agent.results.addExisting', { name: saved.name, location: resolvedLocation })
      : this.t('agent.results.addNew', { name: saved.name, location: resolvedLocation });

    const message = this.createMessage('assistant', summary);
    message.data = {
      summary,
      details: [
        this.t('agent.results.quantity', { value: quantity }),
        this.t('agent.results.location', { value: resolvedLocation }),
        expirationDate
          ? this.t('agent.details.expiration', { value: expirationDate })
          : this.t('agent.details.noExpiry'),
      ],
      item: saved,
    };
    message.modelContent = JSON.stringify({
      action: 'addProduct',
      status: 'ok',
      name: saved.name,
      location: resolvedLocation,
      quantity,
      expirationDate: expirationDate ?? null,
    });

    return { success: true, message };
  }

  // Move stock between locations, merging batches by expiry at destination.
  private async handleMoveProduct(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const name = this.normalizeText(args?.['name']);
    const fromInput = args?.['fromLocation'] as string;
    const toInput = args?.['toLocation'] as string;
    const requestedQuantity = this.toOptionalNumber(args?.['quantity']);

    if (!name || !fromInput || !toInput) {
      return this.errorResult(this.t('agent.errors.missingMoveData'));
    }

    const [fromLocation, toLocation] = await Promise.all([
      this.resolveLocation(fromInput),
      this.resolveLocation(toInput),
    ]);
    if (!fromLocation || !toLocation) {
      const options = await this.getLocationOptions();
      const details = [this.t('agent.details.origins', { value: options.join(', ') })];
      return this.errorResult(this.t('agent.errors.invalidMoveLocation'), details);
    }

    const item = await this.findItemByName(name);
    if (!item) {
      const suggestions = await this.suggestProducts(name);
      const details = suggestions.length ? [this.t('agent.details.suggestions', { value: suggestions.join(', ') })] : undefined;
      return this.errorResult(this.t('agent.errors.notFound', { name }), details);
    }

    const source = item.locations.find(loc => this.sameLocation(loc.locationId, fromLocation));
    if (!source) {
      return this.errorResult(this.t('agent.errors.notInSource', { name, location: fromLocation }));
    }

    const amountAvailable = this.sumBatches(source.batches);
    if (amountAvailable <= 0) {
      return this.errorResult(this.t('agent.errors.noUnits', { location: fromLocation }));
    }

    const amountToMove = requestedQuantity && requestedQuantity > 0
      ? Math.min(requestedQuantity, amountAvailable)
      : amountAvailable;

    const { moved, remaining } = this.extractBatches(source.batches ?? [], amountToMove);
    const destination = item.locations.find(loc => this.sameLocation(loc.locationId, toLocation))
      ?? { locationId: toLocation, unit: source.unit, batches: [] };

    const mergedDestination = this.mergeBatchesByExpiry([...(destination.batches ?? []), ...moved]);
    const updatedLocations = item.locations
      .filter(loc => !this.sameLocation(loc.locationId, source.locationId) && !this.sameLocation(loc.locationId, toLocation));

    const refreshedSource: ItemLocationStock = { ...source, batches: remaining };
    const refreshedDestination: ItemLocationStock = { ...destination, batches: mergedDestination };

    if (this.sumBatches(refreshedSource.batches) > 0) {
      updatedLocations.push(refreshedSource);
    }
    if (this.sumBatches(refreshedDestination.batches) > 0) {
      updatedLocations.push(refreshedDestination);
    }

    const updated: PantryItem = {
      ...item,
      locations: updatedLocations,
    };

    const saved = await this.pantryService.saveItem(updated);
    await this.pantryService.reloadFromStart();

    const summary = this.t('agent.results.moveSummary', {
      amount: amountToMove,
      from: fromLocation,
      to: toLocation,
    });
    const message = this.createMessage('assistant', summary);
    message.data = {
      summary,
      details: [
        this.t('agent.results.moveProduct', { value: saved.name }),
        this.t('agent.results.moveFrom', { value: fromLocation }),
        this.t('agent.results.moveTo', { value: toLocation }),
        this.t('agent.results.moveQuantity', { value: amountToMove }),
      ],
      item: saved,
    };
    message.modelContent = JSON.stringify({
      action: 'moveProduct',
      status: 'ok',
      name: saved.name,
      fromLocation,
      toLocation,
      quantity: amountToMove,
    });

    return { success: true, message };
  }

  // Adjust quantity delta (+/-) for a given location.
  private async handleAdjustQuantity(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const name = this.normalizeText(args?.['name']);
    const locationInput = args?.['location'] as string;
    const delta = this.toNumber(args?.['quantityChange']);

    if (!name || !locationInput || !Number.isFinite(delta)) {
      return this.errorResult(this.t('agent.errors.missingAdjustData'));
    }

    const location = await this.resolveLocation(locationInput);
    if (!location) {
      const options = await this.getLocationOptions();
      const details = [this.t('agent.details.locations', { value: options.join(', ') })];
      return this.errorResult(this.t('agent.errors.invalidLocation'), details);
    }

    const item = await this.findItemByName(name);
    if (!item) {
      const suggestions = await this.suggestProducts(name);
      const details = suggestions.length ? [this.t('agent.details.suggestions', { value: suggestions.join(', ') })] : undefined;
      return this.errorResult(this.t('agent.errors.notFound', { name }), details);
    }

    const targetLocation = item.locations.find(loc => this.sameLocation(loc.locationId, location));
    if (!targetLocation) {
      return this.errorResult(this.t('agent.errors.noStock', { name, location }));
    }

    const currentQty = this.sumBatches(targetLocation.batches);
    const nextQty = Math.max(0, currentQty + delta);
    const updated = await this.pantryService.updateLocationQuantity(item._id, nextQty, targetLocation.locationId);
    if (!updated) {
      return this.errorResult(this.t('agent.errors.updateFailed'));
    }
    await this.pantryService.reloadFromStart();

    const summary = this.t('agent.results.adjustSummary', {
      name,
      location,
      quantity: nextQty,
    });
    const message = this.createMessage('assistant', summary);
    message.data = {
      summary,
      details: [
        this.t('agent.results.adjustChange', { value: `${delta >= 0 ? '+' : ''}${delta}` }),
        this.t('agent.results.adjustNewQuantity', { value: nextQty }),
        this.t('agent.results.adjustLocation', { value: location }),
      ],
      item: updated,
    };
    message.modelContent = JSON.stringify({
      action: 'adjustQuantity',
      status: 'ok',
      name,
      location,
      delta,
      newQuantity: nextQty,
    });

    return { success: true, message };
  }

  // List items expiring within a rolling window of days.
  private async handleGetExpiringSoon(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const days = this.toNumber(args?.['days']) > 0 ? this.toNumber(args?.['days']) : 5;
    const items = await this.pantryService.getNearExpiry(days);
    const summary = items.length
      ? this.t('agent.results.expiringFound', { count: items.length, days })
      : this.t('agent.results.expiringEmpty', { days });
    const message = this.createMessage('assistant', summary);
    message.data = {
      summary,
      items,
    };
    message.modelContent = JSON.stringify({ action: 'getExpiringSoon', status: 'ok', days, items });
    return { success: true, message };
  }

  // Return full pantry inventory.
  private async handleGetProducts(): Promise<{ success: boolean; message: AgentMessage }> {
    const items = await this.pantryService.getAll();
    const message = this.createMessage('assistant', this.t('agent.results.listSummary', { count: items.length }));
    message.data = { summary: this.t('agent.results.listDetail'), items };
    message.modelContent = JSON.stringify({ action: 'getProducts', status: 'ok', count: items.length, items });
    return { success: true, message };
  }

  // Generate recipes using provided or near-expiry ingredients.
  private async handleGetRecipes(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const inputList: string[] = Array.isArray(args?.['ingredientList'])
      ? args['ingredientList'].filter((i: any) => typeof i === 'string').map((i: string) => i.trim()).filter(Boolean)
      : [];

    const nearExpiry = await this.pantryService.getNearExpiry(7);
    const autoIngredients = nearExpiry.reduce<string[]>((acc: string[], item: PantryItem) => {
      const names = item.locations.reduce<string[]>((locAcc: string[], loc: ItemLocationStock) => {
        const batches = Array.isArray(loc.batches) ? loc.batches : [];
        const repeats = batches.map(() => item.name);
        return [...locAcc, ...repeats];
      }, []);
      return [...acc, ...names];
    }, []);
    const ingredients = inputList.length ? inputList : autoIngredients;

    const recipePrompt = ingredients.length
      ? this.t('agent.results.recipesPromptWith', { ingredients: ingredients.join(', ') })
      : this.t('agent.results.recipesPromptAuto');

    const payload: AgentModelRequest = {
      system: this.t('agent.results.recipesSystem'),
      messages: [
        { role: 'user', content: recipePrompt },
      ],
      tools: [],
    };

    const recipeResponse = await this.callModel(payload);
    const content = recipeResponse.content || recipeResponse.message?.content || this.t('agent.results.recipesFallback');

    const message = this.createMessage('assistant', content);
    message.data = {
      summary: this.t('agent.results.recipesSummary'),
      details: ingredients.length
        ? [this.t('agent.results.recipesIngredients', { list: ingredients.join(', ') })]
        : undefined,
    };
    message.modelContent = JSON.stringify({
      action: 'getRecipesWith',
      status: 'ok',
      ingredientList: ingredients,
      response: content,
    });
    return { success: true, message };
  }

  // Subtract quantity (consumption) from a location.
  private async handleConsumeProduct(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const name = this.normalizeText(args?.['name']);
    const requested = this.toNumber(args?.['quantity']);
    const locationInput = args?.['location'] as string | undefined;
    if (!name || !Number.isFinite(requested) || requested <= 0) {
      return this.errorResult(this.t('agent.errors.missingAdjustData'));
    }

    const item = await this.findItemByName(name);
    if (!item) {
      const suggestions = await this.suggestProducts(name);
      const details = suggestions.length ? [this.t('agent.details.suggestions', { value: suggestions.join(', ') })] : undefined;
      return this.errorResult(this.t('agent.errors.notFound', { name }), details);
    }

    let locationId = (locationInput ? await this.resolveLocation(locationInput) : item.locations[0]?.locationId) ?? '';
    if (!locationId) {
      return this.errorResult(this.t('agent.errors.invalidLocation'));
    }
    const locEntry = item.locations.find(loc => this.sameLocation(loc.locationId, locationId));
    if (!locEntry) {
      locationId = item.locations[0]?.locationId ?? locationId;
    }
    if (!locationId) {
      return this.errorResult(this.t('agent.errors.invalidLocation'));
    }
    const resolvedLocationId = locationId;
    const target = item.locations.find(loc => this.sameLocation(loc.locationId, resolvedLocationId));
    if (!target) {
      return this.errorResult(this.t('agent.errors.noStock', { name, location: resolvedLocationId }));
    }
    const current = this.sumBatches(target.batches);
    const next = Math.max(0, current - requested);
    const updated = await this.pantryService.updateLocationQuantity(item._id, next, target.locationId);
    if (!updated) {
      return this.errorResult(this.t('agent.errors.updateFailed'));
    }
    await this.pantryService.reloadFromStart();
    const summary = this.t('agent.results.adjustSummary', { name, location: target.locationId, quantity: next });
    const message = this.createMessage('assistant', summary);
    message.data = {
      summary,
      details: [
        this.t('agent.results.adjustChange', { value: `-${requested}` }),
        this.t('agent.results.adjustNewQuantity', { value: next }),
        this.t('agent.results.adjustLocation', { value: target.locationId }),
      ],
      item: updated,
    };
    message.modelContent = JSON.stringify({
      action: 'consumeProduct',
      status: 'ok',
      name,
      location: target.locationId,
      consumed: requested,
      newQuantity: next,
    });
    return { success: true, message };
  }

  // Mark the first available batch as opened in a location.
  private async handleMarkOpened(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const name = this.normalizeText(args?.['name']);
    const locationInput = args?.['location'] as string | undefined;
    if (!name) {
      return this.errorResult(this.t('agent.errors.missingName'));
    }
    const item = await this.findItemByName(name);
    if (!item) {
      const suggestions = await this.suggestProducts(name);
      const details = suggestions.length ? [this.t('agent.details.suggestions', { value: suggestions.join(', ') })] : undefined;
      return this.errorResult(this.t('agent.errors.notFound', { name }), details);
    }
    const locationId = locationInput ? await this.resolveLocation(locationInput) : item.locations[0]?.locationId;
    if (!locationId) {
      return this.errorResult(this.t('agent.errors.invalidLocation'));
    }
    const target = item.locations.find(loc => this.sameLocation(loc.locationId, locationId));
    if (!target || !target.batches?.length) {
      return this.errorResult(this.t('agent.errors.noStock', { name, location: locationId }));
    }
    const batches = [...target.batches];
    const idx = batches.findIndex(b => !b.opened);
    const targetIndex = idx >= 0 ? idx : 0;
    batches[targetIndex] = { ...batches[targetIndex], opened: true };

    const updated: PantryItem = {
      ...item,
      locations: item.locations.map(loc =>
        this.sameLocation(loc.locationId, locationId) ? { ...loc, batches } : loc
      ),
    };
    const saved = await this.pantryService.saveItem(updated);
    await this.pantryService.reloadFromStart();
    const summary = this.t('agent.results.markOpened', { name: saved.name, location: locationId });
    const message = this.createMessage('assistant', summary);
    message.data = { summary, item: saved };
    message.modelContent = JSON.stringify({ action: 'markOpened', status: 'ok', name, location: locationId });
    return { success: true, message };
  }

  // List items below their minimum threshold.
  private async handleListLowStock(): Promise<{ success: boolean; message: AgentMessage }> {
    const items = await this.pantryService.getLowStock();
    const summary = items.length
      ? this.t('agent.results.lowStockFound', { count: items.length })
      : this.t('agent.results.lowStockEmpty');
    const message = this.createMessage('assistant', summary);
    message.data = { summary, items };
    message.modelContent = JSON.stringify({ action: 'listLowStock', status: 'ok', count: items.length, items });
    return { success: true, message };
  }

  // List items stored in a specific location.
  private async handleListByLocation(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const locationInput = args?.['location'] as string;
    if (!locationInput) {
      return this.errorResult(this.t('agent.errors.invalidLocation'));
    }
    const locationId = await this.resolveLocation(locationInput);
    if (!locationId) {
      const options = await this.getLocationOptions();
      const details = [this.t('agent.details.locations', { value: options.join(', ') })];
      return this.errorResult(this.t('agent.errors.invalidLocation'), details);
    }
    const items = await this.pantryService.getByLocation(locationId);
    const summary = this.t('agent.results.listByLocation', { count: items.length, location: locationId });
    const message = this.createMessage('assistant', summary);
    message.data = { summary, items };
    message.modelContent = JSON.stringify({ action: 'listByLocation', status: 'ok', location: locationId, count: items.length, items });
    return { success: true, message };
  }

  // Zero out all batches for an item (mark as out of stock everywhere).
  private async handleDepleteProduct(args: Record<string, any>): Promise<{ success: boolean; message: AgentMessage }> {
    const name = this.normalizeText(args?.['name']);
    if (!name) {
      return this.errorResult(this.t('agent.errors.missingName'));
    }
    const item = await this.findItemByName(name);
    if (!item) {
      const suggestions = await this.suggestProducts(name);
      const details = suggestions.length ? [this.t('agent.details.suggestions', { value: suggestions.join(', ') })] : undefined;
      return this.errorResult(this.t('agent.errors.notFound', { name }), details);
    }
    const zeroed = {
      ...item,
      locations: (item.locations ?? []).map(loc => ({
        ...loc,
        batches: (loc.batches ?? []).map(batch => ({ ...batch, quantity: 0 })),
      })),
    };
    const saved = await this.pantryService.saveItem(zeroed);
    await this.pantryService.reloadFromStart();
    const summary = this.t('agent.results.depleted', { name: saved.name });
    const message = this.createMessage('assistant', summary);
    message.data = { summary, item: saved };
    message.modelContent = JSON.stringify({ action: 'depleteProduct', status: 'ok', name });
    return { success: true, message };
  }

  private addBatchToExistingItem(item: PantryItem, locationId: string, batch: ItemBatch, categoryId?: string): PantryItem {
    const locations = [...item.locations];
    const existingLocationIndex = locations.findIndex(loc => this.sameLocation(loc.locationId, locationId));
    if (existingLocationIndex >= 0) {
      const target = locations[existingLocationIndex];
      const merged = this.mergeBatchesByExpiry([...(target.batches ?? []), batch]);
      locations[existingLocationIndex] = { ...target, batches: merged };
    } else {
      locations.push({
        locationId,
        unit: batch.unit ?? MeasurementUnit.UNIT,
        batches: [batch],
      });
    }

    return { ...item, locations, categoryId: categoryId ?? item.categoryId ?? '' };
  }

  private buildNewItem(name: string, locationId: string, batch: ItemBatch, categoryId: string): PantryItem {
    const now = new Date().toISOString();
    return {
      _id: createDocumentId('item'),
      type: 'item',
      householdId: DEFAULT_HOUSEHOLD_ID,
      name,
      categoryId: categoryId || '',
      supermarket: '',
      isBasic: false,
      createdAt: now,
      updatedAt: now,
      locations: [
        {
          locationId,
          unit: batch.unit ?? MeasurementUnit.UNIT,
          batches: [batch],
        },
      ],
    };
  }

  private mergeBatchesByExpiry(batches: ItemBatch[]): ItemBatch[] {
    if (!batches.length) return [];
    const normalized = batches.map(batch => ({
      ...batch,
      quantity: this.toNumber(batch.quantity),
      unit: typeof batch.unit === 'string' && batch.unit.trim() ? batch.unit : MeasurementUnit.UNIT,
    }));
    const map = new Map<string, ItemBatch>();
    const agnostic: ItemBatch[] = [];

    for (const batch of normalized) {
      const key = (batch.expirationDate ?? '').trim();
      if (!key) {
        agnostic.push(batch);
        continue;
      }
      const existing = map.get(key);
      if (existing) {
        existing.quantity = this.toNumber(existing.quantity) + this.toNumber(batch.quantity);
      } else {
        map.set(key, { ...batch });
      }
    }

    return [...map.values(), ...agnostic];
  }

  private extractBatches(batches: ItemBatch[], amount: number): MoveBatchesResult {
    let remainingToMove = Math.max(0, amount);
    const sorted = [...(batches ?? [])].sort((a, b) => {
      const aDate = a.expirationDate ? new Date(a.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.expirationDate ? new Date(b.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
    const moved: ItemBatch[] = [];
    const remaining: ItemBatch[] = [];

    for (const batch of sorted) {
      if (remainingToMove <= 0) {
        remaining.push(batch);
        continue;
      }
      const qty = this.toNumber(batch.quantity);
      if (qty <= remainingToMove) {
        moved.push(batch);
        remainingToMove -= qty;
      } else {
        moved.push({ ...batch, quantity: remainingToMove });
        remaining.push({ ...batch, quantity: qty - remainingToMove });
        remainingToMove = 0;
      }
    }

    return { moved, remaining };
  }

  private async resolveLocation(input: string | undefined | null): Promise<string | null> {
    const raw = (input ?? '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const mapped = this.locationSynonyms[lower] ?? raw;
    const catalog = await this.getLocationOptions();
    const exact = catalog.find(loc => loc.toLowerCase() === mapped.toLowerCase());
    if (exact) return exact;
    const synonymMatch = catalog.find(loc => loc.toLowerCase() === lower);
    if (synonymMatch) return synonymMatch;
    return null;
  }

  private async getLocationOptions(): Promise<string[]> {
    try {
      const prefs = await this.appPreferences.getPreferences();
      if (Array.isArray(prefs.locationOptions) && prefs.locationOptions.length) {
        return prefs.locationOptions;
      }
    } catch (err) {
      console.warn('[AgentService] getLocationOptions fallback to default', err);
    }
    return [...DEFAULT_LOCATION_OPTIONS];
  }

  private sameLocation(a: string, b: string): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  }

  private async findItemByName(name: string): Promise<PantryItem | null> {
    const all = await this.pantryService.getAll();
    const lower = name.toLowerCase();
    return all.find(item => (item.name ?? '').toLowerCase() === lower) ?? null;
  }

  private async suggestProducts(query: string): Promise<string[]> {
    const all = await this.pantryService.getAll();
    const lower = query.toLowerCase();
    const matches = all
      .filter(item => (item.name ?? '').toLowerCase().includes(lower))
      .map(item => item.name);
    if (matches.length) {
      return matches.slice(0, 3);
    }
    return all.slice(0, 3).map(item => item.name);
  }

  private normalizeText(value: any): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeDate(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const isoCandidate = new Date(trimmed);
      if (!Number.isNaN(isoCandidate.getTime())) {
        return isoCandidate.toISOString().slice(0, 10);
      }
      return trimmed;
    }
    return null;
  }

  private toNumber(value: any): number {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
    return 0;
  }

  private toOptionalNumber(value: any): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private sumBatches(batches?: ItemBatch[]): number {
    if (!Array.isArray(batches)) {
      return 0;
    }
    return batches.reduce((sum, batch) => sum + this.toNumber(batch.quantity), 0);
  }

  // Helper to return a standardized error tool result.
  private errorResult(message: string, details?: string[]): { success: boolean; message: AgentMessage } {
    const msg = this.createMessage('assistant', message, 'error');
    msg.data = details?.length ? { summary: message, details } : { summary: message };
    msg.modelContent = JSON.stringify({ status: 'error', message, details: details ?? [] });
    return { success: false, message: msg };
  }
}
