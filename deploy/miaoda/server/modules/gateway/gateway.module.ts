import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { DownloadController } from './download.controller';
import { ArtworkController } from './artwork.controller';
import { FontController } from './font.controller';
import { ReleaseController } from './release.controller';
import { NativePlanetService } from './native-planet.service';
import { NativeAiService } from './native-ai.service';
import { NativeArtworkService } from './native-artwork.service';

@Module({ controllers: [ReleaseController, ArtworkController, FontController, DownloadController, GatewayController], providers: [GatewayService, NativePlanetService, NativeAiService, NativeArtworkService] })
export class GatewayModule {}
