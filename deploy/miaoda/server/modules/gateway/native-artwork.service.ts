import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { registerPlanetArtworkGenerator } from '../../../vendor/keling-server.cjs';

/** Unary image plugin output is {images:string[]}; URL stays a public image result. */
@Injectable()
export class NativeArtworkService implements OnModuleInit {
  private readonly logger = new Logger(NativeArtworkService.name);
  constructor(@Inject(CapabilityService) private readonly capabilities: CapabilityService) {}
  onModuleInit(): void {
    registerPlanetArtworkGenerator(async (prompt, signal) => {
      signal.throwIfAborted();
      try {
        const result = await this.capabilities.load('keling-planet-artwork').call('textToImage', {prompt});
        signal.throwIfAborted();
        if (!result || typeof result !== 'object' || !('images' in result) || !Array.isArray(result.images) || typeof result.images[0] !== 'string') throw new Error('Invalid image response');
        return result.images[0];
      } catch (error) {
        this.logger.warn({pluginInstanceId:'keling-planet-artwork', actionKey:'textToImage', errorType:error instanceof Error?error.name:'UnknownError'});
        throw new Error('Planet artwork generation failed');
      }
    });
  }
}
