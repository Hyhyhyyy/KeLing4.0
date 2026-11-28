import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CapabilityService, PlatformHttpClientService } from '@lark-apaas/fullstack-nestjs-core';
import { RequestContextService } from '@lark-apaas/nestjs-common';
import { registerLearningPlanetGenerator, registerLearningQuestionGenerator, registerTopicResearchProvider } from '../../../vendor/keling-server.cjs';

const instanceId = 'keling-learning-planet';
const actionKey = 'textToJson';

/** Schema: hydrated ai-text-to-json 1.0.26, unary {title,story,planetStyleIndex,regions}. */
@Injectable()
export class NativePlanetService implements OnModuleInit {
  private readonly logger = new Logger(NativePlanetService.name);
  constructor(
    @Inject(CapabilityService) private readonly capabilityService: CapabilityService,
    @Inject(PlatformHttpClientService) private readonly platformHttp: PlatformHttpClientService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  onModuleInit(): void {
    // Exact raw-search request and response contract from official ai-search-summary 1.0.14.
    // The SDK applies the existing app/user context; there is no alternative credential or bypass.
    registerTopicResearchProvider(async (query, signal) => {
      signal.throwIfAborted();
      try {
        const response: Response = await this.platformHttp.instance.post(
          '/api/v1/studio/innerapi/integration_apis/call',
          { apiName: 'tool.web_search', userID: this.requestContext.get('userId') ?? '', input: { query } },
          { timeout: 30000, signal },
        );
        signal.throwIfAborted();
        if (!response.ok) throw new Error('Search dependency rejected request');
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('data' in body)
          || !body.data || typeof body.data !== 'object' || !('output' in body.data)) {
          throw new Error('Invalid search response envelope');
        }
        const output: unknown = body.data.output;
        if (!output || typeof output !== 'object' || !('results' in output) || !Array.isArray(output.results)) {
          throw new Error('Invalid search results');
        }
        this.logger.log({ operation: 'topic-search', resultCount: output.results.length });
        return output;
      } catch (error) {
        this.logger.warn({ operation: 'topic-search', error: error instanceof Error ? error.name : 'UnknownError' });
        throw new Error('Topic web search failed');
      }
    });
    registerLearningPlanetGenerator(async (input, signal) => {
      if (signal.aborted) throw new Error('Planet generation cancelled');
      let output: unknown;
      try {
        output = await this.capabilityService.load(instanceId).call(actionKey, {
          subject: input.subject, level: input.level, goal: input.goal || '建立理解并辨析不同语境',
          research: JSON.stringify(input.research), questionCount: String(input.questionCount ?? 12),
          contextMode: input.contextMode ?? 'auto',
        });
        if (signal.aborted) throw new Error('Planet generation cancelled');
        if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('Unexpected planet output type');
        const value = output as Record<string, unknown>;
        if (typeof value.title !== 'string' || typeof value.story !== 'string' || typeof value.planetStyleIndex !== 'number' || !Array.isArray(value.regions)) throw new Error('Missing planet output fields');
        return value;
      } catch (error) {
        this.logger.warn({ pluginInstanceId: instanceId, actionKey, outputMode: 'unary', inputKeys: ['subject', 'level', 'goal'], resultType: typeof output, resultKeys: output && typeof output === 'object' ? Object.keys(output) : [], error: error instanceof Error ? error.name : 'UnknownError' });
        throw new Error('Native planet generation failed');
      }
    });
    registerLearningQuestionGenerator(async (input, signal) => {
      signal.throwIfAborted();
      try {
        const output: unknown = await this.capabilityService.load('keling-learning-question').call('textToJson', {
          subject: input.subject, level: input.level, goal: input.goal || '理解主题并练习',
          contextMode: input.contextMode ?? 'auto', research: JSON.stringify(input.research),
          lesson: input.lesson, question: JSON.stringify(input.question), instruction: input.instruction,
        });
        signal.throwIfAborted();
        if (!output || typeof output !== 'object' || !('question' in output)
          || !output.question || typeof output.question !== 'object' || Array.isArray(output.question)) {
          throw new Error('Invalid generated question');
        }
        return output.question;
      } catch (error) {
        this.logger.warn({ pluginInstanceId: 'keling-learning-question', actionKey,
          error: error instanceof Error ? error.name : 'UnknownError' });
        throw new Error('Native question regeneration failed');
      }
    });
  }
}
