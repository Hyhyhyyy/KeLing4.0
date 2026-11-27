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
