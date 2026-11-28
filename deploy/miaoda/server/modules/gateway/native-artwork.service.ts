import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { registerPlanetArtworkGenerator, registerPlanetVisualDesigner } from '../../../vendor/keling-server.cjs';

const PUBLIC_ORIGIN = 'https://ucn5aajxnx7f.feishuapp.com';
const PUBLIC_PLUGIN_PATH = /^\/(?:spark\/)?app\/app_17h4dw5jwdg\/runtime\/api\/v1\/storage\/object\/bucket_aadk4xawzf4xg_static\/(.+)$/;

/** The plugin can return its already-public static object path; private storage paths are not accepted. */
export function normalizePlanetArtworkUrl(value: string): string {
  if (!value || value.length > 2000 || value !== value.trim()) throw new Error('Invalid artwork URL');
  if (value.startsWith('/')) {
    const matched = value.match(PUBLIC_PLUGIN_PATH);
    if (!matched) throw new Error('Unrecognized public artwork path');
    const key = decodeURIComponent(matched[1]);
    if (!/^plugin\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) || key.length > 1024 || key.includes('..') || key.split('/').some(part => !part || part === '.')) throw new Error('Invalid public artwork key');
    return new URL(value, PUBLIC_ORIGIN).href;
  }
  const url = new URL(value), host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.includes(':') || /^[0-9.]+$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) throw new Error('Invalid artwork URL');
  return url.href;
}

/** Unary image plugin output is {images:string[]}; URL stays a public image result. */
@Injectable()
export class NativeArtworkService implements OnModuleInit {
  private readonly logger = new Logger(NativeArtworkService.name);
  constructor(@Inject(CapabilityService) private readonly capabilities: CapabilityService) {}
  onModuleInit(): void {
    registerPlanetVisualDesigner(async (input,signal) => {
      signal.throwIfAborted();
      try {
        const result: unknown = await this.capabilities.load('keling-planet-visual-design').call('textToJson', {
          subject:input.subject, meaning:input.meaning, instruction:input.instruction,
          research:JSON.stringify(input.research), references:JSON.stringify(input.references),
        });
        signal.throwIfAborted();return result;
      } catch (error) {
        this.logger.warn({pluginInstanceId:'keling-planet-visual-design', actionKey:'textToJson', outputMode:'unary', inputKeys:['subject','meaning','instruction','research','references'], error:error instanceof Error?error.name:'UnknownError'});
        throw new Error('Planet visual design failed');
      }
    });
    registerPlanetArtworkGenerator(async (prompt, signal, referenceImages) => {
      signal.throwIfAborted();
      const useReferences=!!referenceImages?.length,instanceId=useReferences?'keling-planet-artwork-reference':'keling-planet-artwork',actionKey=useReferences?'imageToImage':'textToImage';
      try {
        if(useReferences&&(referenceImages!.length>5||referenceImages!.some(url=>url.includes('/api/v1/storage/object/')||normalizePlanetArtworkUrl(url)!==url)))throw new Error('Invalid external visual references');
        const result = await this.capabilities.load(instanceId).call(actionKey, useReferences?{prompt,referenceImages}:{prompt});
        signal.throwIfAborted();
        if (!result || typeof result !== 'object' || !('images' in result) || !Array.isArray(result.images) || typeof result.images[0] !== 'string') throw new Error('Invalid image response');
        return normalizePlanetArtworkUrl(result.images[0]);
      } catch (error) {
        this.logger.warn({pluginInstanceId:instanceId, actionKey, outputMode:'unary', inputKeys:useReferences?['prompt','referenceImages']:['prompt'], errorType:error instanceof Error?error.name:'UnknownError'});
        throw new Error('Planet artwork generation failed');
      }
    });
  }
}
