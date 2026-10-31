"""Regenerate shared artwork from a complete directory of original PNGs."""
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageStat, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'assets/stellar'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--source-commit', help='Git commit containing the supplied original PNGs')
    args = parser.parse_args()
    source_dir = args.source.resolve()
    if source_dir == TARGET.resolve():
        parser.error('Use a separate directory containing the original PNGs.')
    sources = sorted(source_dir.glob('*.png'))
    names = {p.name if p.name == 'app_icon.png' else p.stem + '.webp' for p in sources}
    existing = {p.name for p in TARGET.iterdir() if p.suffix in ('.png', '.webp')}
    if not sources or existing - names:
        parser.error('Supply the complete original PNG directory, not a partial image selection.')
    records = []
    for source in sources:
        target = TARGET / (source.name if source.name == 'app_icon.png' else source.stem + '.webp')
        with Image.open(source) as original:
            if source.name == 'app_icon.png':
                shutil.copyfile(source, target)
            else:
                original.save(target, format='WEBP', quality=100, method=6, exact=True)
            with Image.open(target) as encoded:
                background = Image.new('RGBA', original.size, 'white')
                left = Image.alpha_composite(background, original.convert('RGBA')).convert('RGB')
                right = Image.alpha_composite(background, encoded.convert('RGBA')).convert('RGB')
                rms = math.sqrt(sum(v * v for v in ImageStat.Stat(ImageChops.difference(left, right)).rms) / 3)
            records.append({'name': target.name, 'source': source.name, 'sourceSha256': digest(source),
                            'sha256': digest(target), 'bytes': target.stat().st_size,
                            'width': original.width, 'height': original.height, 'rgbRms': round(rms, 4)})
    manifest = {'version': 2,
                'originalSource': {'commit': args.source_commit, 'directory': 'assets/stellar'},
                'encoding': {'format': 'WebP lossy quality 100; app_icon remains original PNG',
                             'quality': 100, 'method': 6, 'pillow': pillow_version},
                'assets': records}
    (TARGET / 'manifest.json').write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print(f'Prepared {len(records)} shared assets for Web and Android.')


if __name__ == '__main__':
    main()
