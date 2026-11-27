import { Controller, Get, Inject, Logger, Res } from '@nestjs/common';
import { FileService } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';

const ART_BUCKET: string = 'bucket_aadk4xawzf4xg';
const ART_PATH: string = '/1882830203673659.webp';
const ART_SHA256: string = 'cb7465ec80df7de393563fe1dc7933fd2867acda31cd8152eb609493b327fd78';
const ARROW_PATH: string = '/1882832922057850.webp';
const ARROW_SHA256: string = 'b722445a6f11afa60081ef6c92cb3a907acd288df5832e839212c65d398b6107';
const GUIDE_PATH: string = '/1882902547070985.webp';
const GUIDE_SHA256: string = 'ddb5f0afe6b4545cc062cd18abc0bce73b18fd2b9ec3094209e290bf56a0f695';

/** Only reviewed public artwork is exposed; no caller-selected file paths. */
@Controller('stellar')
export class ArtworkController {
  private readonly logger: Logger = new Logger(ArtworkController.name);

  constructor(@Inject(FileService) private readonly files: FileService) {}

  @Get('title_mascots.webp')
  async titleMascots(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, ART_PATH, ART_SHA256);
  }

  @Get('navigation_arrow.webp')
  async navigationArrow(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, ARROW_PATH, ARROW_SHA256);
  }

  @Get('guide_scroll.webp')
  async guideScroll(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, GUIDE_PATH, GUIDE_SHA256);
  }

  @Get('subject_planets.webp')
  async subjectPlanets(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, '/1882973251214384.webp', 'ff467a16d12e48b6ccfd6e6314bc8ad85520ab8e12e3591baa158eb78cedac09');
  }

  @Get('journey_avatars.webp')
  async journeyAvatars(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, '/1883006906073152.webp',
      '821b7a19866a4e6bcaf78d30e4eb53a23d7f943890c955d188a7025ac750f6ae');
  }

  @Get('journey_frames.webp')
  async journeyFrames(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, '/1883006937943079.webp',
      'f0ae2a4f2574c131a01515af50dcdde2b2d9f3e4cdae08d3096c5a806ab2943e');
  }

  @Get('journey_titles.webp')
  async journeyTitles(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, '/1883006990377047.webp',
      '12edcd4d4b264ef854038f46893b41fa6bf07223ea4d6e7c831deed3e568e20b');
  }

  @Get('journey_furniture.webp')
  async journeyFurniture(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, '/1883007013951496.webp',
      '9f866b5797ddbda31f3181b453c8fd16745133f07bd4b80a52756d6ca76de4fc');
  }

  @Get('story_cockpit.webp')
  async storyCockpit(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, '/1883007023176708.webp',
      'aaf6a997fe6ecbfee9e69f509c8e002ee2e5fbc0ceeb55b379bb070a89d8a375');
  }

  @Get('story_cockpit_mobile.webp')
  async storyCockpitMobile(@Res() res: Response): Promise<void> {
    await this.redirectArtwork(res, '/1883007023178804.webp',
      'e01dd858df3e83d7c7e5e455140f5464d83e25c525a35e0b684097d504c221f3');
  }

  private async redirectArtwork(res: Response, path: string, sha256: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const signedUrl: string = await Promise.race([
        this.files.from(ART_BUCKET).createSignedUrl(path, 3600),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Artwork link timeout')), 12_000);
        }),
      ]);
      const url: URL = new URL(signedUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid artwork URL');
      // A fresh one-hour URL is issued after this five-minute redirect expires.
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('X-Content-SHA256', sha256);
      res.redirect(302, url.toString());
    } catch (error: unknown) {
      this.logger.warn('Public artwork unavailable', error instanceof Error ? error.stack : String(error));
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ error: '图片暂时无法加载' });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
