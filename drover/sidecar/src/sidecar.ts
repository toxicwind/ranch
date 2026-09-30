/*
 * Drover EAP — Gemini tool-retrieval sidecar
 *
 * Registers a second Language Model Chat Provider that uses the Gemini
 * EAP `interactions.create` API with `tool_search` and `defer_loading`.
 *
 * Reference: Gemini API — Tool retrieval (EAP), 2026-08-21
 *
 *   Server-side:
 *     - { type: "tool_search" } in tools array
 *     - defer_loading: true on each deferred tool
 *     - Optional short_description for compact retrieval summary
 *     - Server resolves schemas; response includes tool_search_call and
 *       tool_search_result steps followed by function_call steps
 *
 *   Client-side:
 *     - { type: "tool_search", execution: "client", name, description, parameters }
 *     - Model emits function_call for the search tool
 *     - App returns matched schemas inline within function_result.result
 *
 *   Rules enforced here:
 *     - defer_loading: true ONLY when tool_search is present (else 400)
 *     - Server-side and client-side are mutually exclusive per request
 *     - Only interactions.create supports tool retrieval
 *     - previous_interaction_id links multi-turn context
 *
 *   Model: gemini-flash-tool-retrieval
 *   SDK:   @google/genai@2.16.0 (EAP preview build, not on public npm)
 */

import * as vscode from 'vscode';
import { GoogleGenAI } from '@google/genai';

const VENDOR = 'drover-eap';
const EAP_MODEL = 'gemini-flash-tool-retrieval';
const TOOL_SEARCH_THRESHOLD = 30;

interface ModelInfo {
  id: string;
  name: string;
  family: string;
  version: string;
  maxInput: number;
  maxOutput: number;
}

const MODELS: ModelInfo[] = [
  { id: EAP_MODEL,                name: 'Gemini Flash (Tool Retrieval)', family: 'gemini', version: 'tool-retrieval', maxInput: 1048576, maxOutput: 65536 },
  { id: 'gemini-3.8-flash',       name: 'Gemini 3.8 Flash',              family: 'gemini', version: '3.8',             maxInput: 1048576, maxOutput: 65536 },
  { id: 'gemini-3.7-flash',       name: 'Gemini 3.7 Flash',              family: 'gemini', version: '3.7',             maxInput: 1048576, maxOutput: 65536 },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview',        family: 'gemini', version: '3.1',             maxInput: 1048576, maxOutput: 65536 },
  { id: 'gemini-3-pro-preview',   name: 'Gemini 3 Pro Preview',          family: 'gemini', version: '3.0',             maxInput: 1048576, maxOutput: 65536 },
  { id: 'gemini-2.5-pro',         name: 'Gemini 2.5 Pro',                family: 'gemini', version: '2.5',             maxInput: 1048576, maxOutput: 65536 },
  { id: 'gemini-2.5-flash',       name: 'Gemini 2.5 Flash',              family: 'gemini', version: '2.5',             maxInput: 1048576, maxOutput: 65536 },
];

class EapProvider implements vscode.LanguageModelChatProvider {
  private client: GoogleGenAI | null = null;
  private lastInteractionId: string | null = null;

  private getClient(): GoogleGenAI {
    if (this.client) return this.client;

    const cfg = vscode.workspace.getConfiguration('drover');
    const key =
      (cfg.get<string>('google.apikey') || '').trim() ||
      (process.env.GEMINI_API_KEY || '').trim() ||
      (process.env.GOOGLE_API_KEY || '').trim();

    if (!key) {
      throw new Error(
        'Gemini API key not configured. Run "Drover: Add API Key" or set GEMINI_API_KEY.'
      );
    }

    this.client = new GoogleGenAI({ apiKey: key });
    return this.client;
  }

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    return MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      family: m.family,
      version: m.version,
      maxInputTokens: m.maxInput,
      maxOutputTokens: m.maxOutput,
      capabilities: { toolCalling: true, imageInput: true },
    }));
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const client = this.getClient() as any;

    const input = this.convertMessages(messages);
    const tools = this.convertTools(options.tools || []);

    const req: any = { model: model.id, input };
    if (tools.length > 0) req.tools = tools;
    if (this.lastInteractionId && model.id === EAP_MODEL) {
      req.previous_interaction_id = this.lastInteractionId;
    }

    // Preferred path: interactions.create (EAP tool retrieval).
    if (client.interactions?.create) {
      const interaction: any = await client.interactions.create(req);
      this.lastInteractionId = interaction.id || null;

      for (const s of interaction.steps || []) {
        if (token.isCancellationRequested) return;

        if (s.type === 'function_call' && s.name) {
          progress.report(
            new vscode.LanguageModelToolCallPart(
              s.id || s.name,
              s.name,
              (s.arguments || {}) as object
            )
          );
        } else if (s.type === 'mcp_server_tool_call' && s.name) {
          progress.report(
            new vscode.LanguageModelToolCallPart(
              s.id || s.name,
              `${s.server_name || 'mcp'}:${s.name}`,
              (s.arguments || {}) as object
            )
          );
        } else if (s.type === 'text' && s.text) {
          progress.report(new vscode.LanguageModelTextPart(s.text));
        }
      }
      return;
    }

    // Fallback: generateContentStream (no tool retrieval).
    if (client.models?.generateContentStream) {
      const stream = await client.models.generateContentStream({
        model: model.id,
        contents: messages.map((m) => ({
          role: m.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'model',
          parts: m.content
            .filter((p): p is vscode.LanguageModelTextPart =>
              p instanceof vscode.LanguageModelTextPart
            )
            .map((p) => ({ text: p.value })),
        })),
      });

      for await (const chunk of stream) {
        if (token.isCancellationRequested) return;
        const text = (chunk as any).text;
        if (text) progress.report(new vscode.LanguageModelTextPart(text));
      }
      return;
    }

    throw new Error(
      'EAP SDK not present. Install google-genai-2.16.0.tgz (EAP preview build).'
    );
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    if (typeof text === 'string') return Math.ceil(text.length / 4);
    let total = 0;
    for (const part of text.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        total += Math.ceil(part.value.length / 4);
      }
    }
    return total;
  }

  private convertMessages(
    msgs: readonly vscode.LanguageModelChatRequestMessage[]
  ): any[] {
    const out: any[] = [];

    for (const m of msgs) {
      const role =
        m.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'model';
      const parts: any[] = [];

      for (const p of m.content) {
        if (p instanceof vscode.LanguageModelTextPart) {
          parts.push({ type: 'text', text: p.value });
        } else if (p instanceof vscode.LanguageModelToolCallPart) {
          parts.push({
            type: 'function_call',
            name: p.name,
            callId: p.callId,
            arguments: p.input,
          });
        } else if (p instanceof vscode.LanguageModelToolResultPart) {
          parts.push({
            type: 'function_result',
            name: p.callId,
            callId: p.callId,
            result: p.content,
          });
        }
      }

      out.push({ role, parts });
    }

    return out;
  }

  /*
   * Converts VS Code tool declarations to Gemini tool format.
   *
   * When tool count >= TOOL_SEARCH_THRESHOLD, switches to server-side
   * retrieval:
   *   - prepends { type: "tool_search" }
   *   - marks every tool with defer_loading: true
   *   - sets short_description for the retrieval index
   *
   * Rule (spec): defer_loading without tool_search = 400 INVALID_ARGUMENT.
   * This sidecar only sets defer_loading inside the branch that also
   * emits tool_search, so the rule is never violated.
   */
  private convertTools(tools: readonly vscode.LanguageModelChatTool[]): any[] {
    if (!tools || tools.length === 0) return [];

    const useSearch = tools.length >= TOOL_SEARCH_THRESHOLD;

    const decls = tools.map((t) => {
      const decl: any = {
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      };

      if (useSearch) {
        decl.defer_loading = true;
        const desc = (t.description || '').trim();
        decl.short_description = desc.length > 80 ? desc.slice(0, 77) + '...' : desc;
      }

      return decl;
    });

    return useSearch ? [{ type: 'tool_search' }, ...decls] : decls;
  }
}

let provider: EapProvider | null = null;

export function activate(ctx: vscode.ExtensionContext): void {
  provider = new EapProvider();
  ctx.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider(VENDOR, provider)
  );
}

export function deactivate(): void {
  provider = null;
}
