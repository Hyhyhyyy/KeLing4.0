import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { DownloadController } from './download.controller';

@Module({ controllers: [DownloadController, GatewayController], providers: [GatewayService] })
export class GatewayModule {}
