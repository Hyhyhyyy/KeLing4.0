import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import type { StreamEvent } from '@lark-apaas/nestjs-capability';
import { registerNativeAiBridge } from '../../../vendor/keling-server.cjs';
import type { NativeAiRequest, NativeAiResult } from '../../../vendor/keling-server.cjs';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Hydrated ai-text-generate 1.0.21: data.content is an incremental string.
export async function collectNativeText(
  stream: AsyncIterable<StreamEvent<unknown>>, signal: AbortSignal,
): Promise<string> {
  let content: string = '';
  let completed: boolean = false;
  for await (const event of stream) {
    signal.throwIfAborted();
    if (completed) throw new Error('Unexpected event after completion');
    if (event.type === 'error') throw new Error('Native stream failed');
    if (event.type === 'done') { completed = true; continue; }
    if (!record(event.data) || typeof event.data.content !== 'string') {
      throw new Error('Invalid native text chunk');
    }
    content += event.data.content;
    if (content.length > 32000) throw new Error('Native response exceeded limit');
  }
  signal.throwIfAborted();
  if (!completed || !content.trim()) throw new Error('Incomplete native response');
  return content;
}

// The structural plugin supplies objects; never extract JSON from free-form text.
export function nativePlanContent(output: unknown): string {
  if (!record(output) || typeof output.summary !== 'string' || !output.summary.trim()
    || output.summary.length > 4000 || !Array.isArray(output.tasks)
    || output.tasks.length < 1 || output.tasks.length > 8) throw new Error('Invalid native plan');
  for (const task of output.tasks) {
    if (!record(task) || typeof task.title !== 'string' || !task.title.trim()
      || task.title.length > 180 || typeof task.description !== 'string'
      || task.description.length > 2000 || typeof task.date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/u.test(task.date)
      || typeof task.minutes !== 'number' || !Number.isInteger(task.minutes)
      || task.minutes < 5 || task.minutes > 480 || !Array.isArray(task.sourceIds)
      || task.sourceIds.length < 1 || task.sourceIds.length > 12
      || task.sourceIds.some((id: unknown) => typeof id !== 'string' || !id)) {
      throw new Error('Invalid native plan task');
    }
  }
  return JSON.stringify({ summary: output.summary, tasks: output.tasks });
}

@Injectable()
export class NativeAiService implements OnModuleInit {
  private readonly logger = new Logger(NativeAiService.name);
  constructor(@Inject(CapabilityService) private readonly capabilities: CapabilityService) {}

  onModuleInit(): void {
    registerNativeAiBridge({ providerId: 'miaoda', name: '妙搭公共模型', modelId: 'miaoda-chat',
      publicEnabled: true, complete: (request: NativeAiRequest) => this.complete(request) });
  }

  async complete(request: NativeAiRequest): Promise<NativeAiResult> {
    const structured: boolean = request.purpose === 'study-plan';
    const pluginInstanceId: string = structured ? 'keling-study-plan' : 'keling-study-assistant';
    const actionKey: string = structured ? 'textToJson' : 'textGenerate';
    const input: { conversation: string; outputBudget: string } = {
      conversation: JSON.stringify(request.messages),
      outputBudget: String(Math.max(256, Math.min(8192, request.maxOutputTokens))),
    };
    const started: number = Date.now();
    try {
      request.signal.throwIfAborted();
      let content: string;
      if (structured) {
        const output: unknown = await this.capabilities.load(pluginInstanceId).call(actionKey, input);
        request.signal.throwIfAborted();
        content = nativePlanContent(output);
      } else {
        content = await collectNativeText(
          this.capabilities.load(pluginInstanceId).callStreamWithEvents(actionKey, input), request.signal,
        );
      }
      this.logger.log({ pluginInstanceId, actionKey, outputMode: structured ? 'unary' : 'stream',
        completed: true, outputCharacters: content.length, durationMs: Date.now() - started });
      // This plugin does not expose token accounting; never invent usage.
      return { content };
    } catch (error) {
      this.logger.warn({ pluginInstanceId, actionKey, outputMode: structured ? 'unary' : 'stream',
        inputKeys: Object.keys(input), error: error instanceof Error ? error.name : 'UnknownError',
        reason: error instanceof Error && [
          'Unexpected event after completion', 'Native stream failed', 'Invalid native text chunk',
          'Native response exceeded limit', 'Incomplete native response',
          'Invalid native plan', 'Invalid native plan task',
        ].includes(error.message) ? error.message : 'External capability failed' });
      throw new Error('Native learning model failed');
    }
  }
}
