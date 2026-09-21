from PIL import Image
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "image" / "몬스터"
FILES = [
    "피아누스(좌붕).gif",
    "피아누스(우붕).gif",
    "파풀라투스.gif",
]


def process(src: Path, out: Path) -> None:
    im = Image.open(src)
    if getattr(im, "n_frames", 1) > 1:
        im.seek(0)
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                px[x, y] = (r, g, b, 0)
                continue
            if r >= 248 and g >= 248 and b >= 248:
                px[x, y] = (r, g, b, 0)
            elif r >= 230 and g >= 230 and b >= 230 and max(r, g, b) - min(r, g, b) < 12:
                px[x, y] = (r, g, b, 0)
    im.save(out, "PNG")
    print("wrote", out)


def main() -> None:
    for name in FILES:
        src = BASE / name
        out = BASE / (Path(name).stem + ".png")
        if not src.is_file():
            raise SystemExit(f"missing {src}")
        process(src, out)


if __name__ == "__main__":
    main()
