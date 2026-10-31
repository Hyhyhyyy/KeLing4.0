import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GatewayService } from './gateway.service';

/** Public transport for the existing public app. KeLing validates every account token upstream. */
@Controller()
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @All(['/', '*'])
  async forward(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.gateway.forward(req, res);
  }
}
