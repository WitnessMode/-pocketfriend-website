"""Derive a tangent-space normal map (and a tweaked albedo) from a photo texture.
Usage: python normal_from_albedo.py <albedo.png> <out_normal.png> [strength] [out_albedo.png]
Tileable-aware: gradients wrap at edges so a seamless source stays seamless.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

def main():
    src = sys.argv[1]
    out_normal = sys.argv[2]
    strength = float(sys.argv[3]) if len(sys.argv) > 3 else 2.4
    out_albedo = sys.argv[4] if len(sys.argv) > 4 else None

    img = Image.open(src).convert('RGB')
    # height from luminance, lightly blurred to suppress jpeg/webp noise
    gray = img.convert('L').filter(ImageFilter.GaussianBlur(0.8))
    h = np.asarray(gray, dtype=np.float32) / 255.0

    # wrap-around central differences -> seamless gradients
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5

    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(h)
    length = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx, ny, nz = nx/length, ny/length, nz/length

    # encode to 0..255 (OpenGL/+Y normal map convention)
    normal = np.stack([
        (nx * 0.5 + 0.5),
        (ny * 0.5 + 0.5),
        (nz * 0.5 + 0.5),
    ], axis=-1)
    Image.fromarray((normal * 255).astype(np.uint8), 'RGB').save(out_normal)
    print(f'normal -> {out_normal}  ({img.size[0]}x{img.size[1]}, strength={strength})')

    if out_albedo:
        # gently darken + desaturate so it tiles as a believable rock base
        arr = np.asarray(img, dtype=np.float32)
        lum = arr.mean(axis=-1, keepdims=True)
        arr = lum + (arr - lum) * 0.72      # desaturate 28%
        arr = arr * 0.86                     # darken slightly
        Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB').save(out_albedo)
        print(f'albedo -> {out_albedo}')

if __name__ == '__main__':
    main()
