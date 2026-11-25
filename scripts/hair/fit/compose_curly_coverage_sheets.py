"""Compose private review sheets from existing Blender PNGs (requires Pillow)."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


VIEWS = ("front", "back", "top", "left", "right", "three-quarter")
BACKGROUND = "#181b20"
PANEL = "#22272e"
FOREGROUND = "#f3f5f7"
MUTED = "#b6c0c9"


def label(draw, xy, text, points, color=FOREGROUND):
    draw.text(xy, text, font=ImageFont.load_default(size=points), fill=color)


def paste_frame(sheet, path, x, y, size, *, mask=False):
    with Image.open(path) as source:
        frame = source.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    if mask:
        frame = ImageOps.colorize(frame.convert("L"), "#15191f", "#ffd178")
    sheet.paste(frame, (x, y))


def compose_comparison(source, output):
    size, pitch_x, pitch_y = 272, 576, 344
    sheet = Image.new("RGB", (3 * pitch_x + 40, 2 * pitch_y + 110), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    label(draw, (24, 17), "Vesper / Curly Mane", 30)
    label(draw, (24, 58), "Original Face4 and Curls textures, rendered in Blender Cycles", 17, MUTED)
    for index, view in enumerate(VIEWS):
        x = 24 + (index % 3) * pitch_x
        y = 96 + (index // 3) * pitch_y
        draw.rounded_rectangle((x, y, x + pitch_x - 12, y + pitch_y - 10), radius=8, fill=PANEL)
        label(draw, (x + 9, y + 7), view.replace("-", " ").title(), 19)
        for column, (stage, title) in enumerate((("before", "Before alignment"), ("after", "Global candidate"))):
            left = x + 6 + column * (size + 7)
            paste_frame(sheet, source / f"{view}-{stage}.png", left, y + 35, size)
            label(draw, (left + 2, y + 310), title, 14, MUTED)
    sheet.save(output)


def compose_exposure(source, output, report):
    size, x_step, y_step = 270, 289, 327
    sheet = Image.new("RGB", (4 * x_step + 32, 2 * y_step + 102), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    label(draw, (24, 17), "Crown and back scalp exposure", 30)
    label(draw, (24, 56), "Gold shows visible original scalp through or between the source hair cards.", 17, MUTED)
    for row, (view, title) in enumerate((("top", "Crown / top"), ("back", "Back"))):
        y = 89 + row * y_step
        label(draw, (24, y), title, 18)
        values = report["views"][view]
        frames = [
            (f"{view}-after.png", "Global candidate", False),
            (f"{view}-scalp-reference.png", "Scalp region with hair hidden", True),
            (f"{view}-before-exposure.png", f"Before: {values['before']['visible_fraction']:.1%} visible", True),
            (f"{view}-after-exposure.png", f"After: {values['after']['visible_fraction']:.1%} visible", True),
        ]
        for column, (filename, caption, mask) in enumerate(frames):
            x = 24 + column * x_step
            paste_frame(sheet, source / filename, x, y + 28, size, mask=mask)
            label(draw, (x, y + 301), caption, 15, MUTED)
    sheet.save(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("render_dir", type=Path)
    parser.add_argument("out_dir", type=Path)
    args = parser.parse_args()
    comparison = args.out_dir / "Vesper-Curly-Mane-Six-Views.png"
    exposure = args.out_dir / "Vesper-Curly-Mane-Crown-Back-Exposure.png"
    if comparison.exists() or exposure.exists():
        raise FileExistsError("Choose new private sheet paths")
    report = json.loads((args.render_dir / "coverage-report.json").read_text(encoding="utf-8"))
    args.out_dir.mkdir(parents=True, exist_ok=True)
    compose_comparison(args.render_dir, comparison)
    compose_exposure(args.render_dir, exposure, report)


if __name__ == "__main__":
    main()
