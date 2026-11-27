import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { DownloadController } from './download.controller';
import { ArtworkController } from './artwork.controller';
import { FontController } from './font.controller';
import { NativePlanetService } from './native-planet.service';

@Module({ controllers: [ArtworkController, FontController, DownloadController, GatewayController], providers: [GatewayService, NativePlanetService] })
export class GatewayModule {}
