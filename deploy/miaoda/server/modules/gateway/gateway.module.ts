import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { DownloadController } from './download.controller';
import { ArtworkController } from './artwork.controller';
import { FontController } from './font.controller';
import { ReleaseController } from './release.controller';
import { NativePlanetService } from './native-planet.service';
import { NativeAiService } from './native-ai.service';

@Module({ controllers: [ReleaseController, ArtworkController, FontController, DownloadController, GatewayController], providers: [GatewayService, NativePlanetService, NativeAiService] })
export class GatewayModule {}
