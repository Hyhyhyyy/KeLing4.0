import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { registerLearningPlanetGenerator } from '../../../vendor/keling-server.cjs';

const instanceId = 'keling-learning-planet';
const actionKey = 'textToJson';

/** Schema: hydrated ai-text-to-json 1.0.26, unary {title,story,planetStyleIndex,regions}. */
@Injectable()
export class NativePlanetService implements OnModuleInit {
  private readonly logger = new Logger(NativePlanetService.name);
  constructor(@Inject(CapabilityService) private readonly capabilityService: CapabilityService) {}

  onModuleInit(): void {
    registerLearningPlanetGenerator(async (input, signal) => {
      if (signal.aborted) throw new Error('Planet generation cancelled');
      let output: unknown;
      try {
        output = await this.capabilityService.load(instanceId).call(actionKey, {
          subject: input.subject, level: input.level, goal: input.goal || '建立基础理解并完成第一轮探索',
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
  }
}
