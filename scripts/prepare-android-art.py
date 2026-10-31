"""Encode packaged game artwork; retain the original PNGs as authoring sources."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageStat, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/stellar'
TARGET = ROOT / 'apps/android/app/src/main/optimizedAssets/stellar'
MANIFEST = ROOT / 'docs/auth/android-art-manifest.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if args.verify else None
    TARGET.mkdir(parents=True, exist_ok=True)
    records = []
    for source in sorted(SOURCE.glob('*.png')):
        target = TARGET / (source.stem + '.webp')
        with Image.open(source) as original:
            if not args.verify:
                original.save(target, format='WEBP', quality=100, method=6, exact=True)
            with Image.open(target) as encoded:
                assert original.size == encoded.size, source.name + ': size changed'
                left, right = original.convert('RGBA'), encoded.convert('RGBA')
                assert left.getchannel('A').tobytes() == right.getchannel('A').tobytes(), source.name + ': alpha changed'
                # Compare visible pixels against a white background, including transparent art.
                back = Image.new('RGBA', original.size, 'white')
                diff = ImageChops.difference(Image.alpha_composite(back, left).convert('RGB'), Image.alpha_composite(back, right).convert('RGB'))
                channels = ImageStat.Stat(diff).rms
                rms = math.sqrt(sum(value * value for value in channels) / 3)
                assert rms < 10, source.name + ': excessive encoding difference'
                records.append({'source': source.name, 'sourceSha256': digest(source), 'file': target.name,
                                'sha256': digest(target), 'bytes': target.stat().st_size,
                                'width': original.width, 'height': original.height, 'rgbRms': round(rms, 4)})
    assert len(records) == len(list(TARGET.glob('*.webp'))), 'Unexpected packaged artwork'
    manifest = {'format': 'WebP (lossy, maximum quality)', 'quality': 100, 'method': 6, 'pillow': pillow_version, 'originalBytes': sum(p.stat().st_size for p in SOURCE.glob('*.png')), 'packagedBytes': sum(r['bytes'] for r in records), 'files': records}
    if args.verify:
        assert previous == manifest, 'Artwork manifest does not match source or packaged files'
    else:
        MANIFEST.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print(json.dumps({'filesVerified': len(records), 'originalBytes': manifest['originalBytes'], 'packagedBytes': manifest['packagedBytes'], 'maximumRgbRms': max(r['rgbRms'] for r in records), 'pillow': pillow_version}))


if __name__ == '__main__':
    main()
