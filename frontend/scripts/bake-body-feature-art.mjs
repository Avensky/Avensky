// Offline art bake. Usage: node scripts/bake-body-feature-art.mjs BODY_OVERVIEW.png BODY_HAIRSTYLE.png IDENTITY.png
// The source art is the original Avensky UI concept imagery created for the project in November 2026.
// Identify the full-resolution Body overview (1846 × 852), portrait Hairstyle (910 × 1729) and Identity (1774 × 887)
// by SHA-256 prefix, respectively: 88f5d2963e0e9842, ff99be3a8182ec81 and 9f34242dea0ae627.
// Requires ImageMagick 6+ with WebP. Runtime only reads the finished WebP sheets.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [overview, portrait, identity] = process.argv.slice(2);
if (!overview || !portrait || !identity) throw new Error("Pass the three original concept PNGs in display order.");
const base = fileURLToPath(new URL("../src/game/characters/bodyArt/", import.meta.url));
const w = 256, h = 192;
const iris = "path 'M77 89 Q107 71 154 80 L177 89 C187 122 162 150 132 151 C100 154 70 132 77 89 Z' fill black ellipse 126,98 14,15 0,360";
const brow = "path 'M4 91 Q8 68 37 63 Q86 56 119 48 Q168 35 198 50 Q232 59 252 77 L252 86 Q219 67 191 66 Q157 65 119 81 Q64 101 4 107 Z'";
const lips = "path 'M51 101 C71 95 107 65 126 61 Q135 59 144 64 Q156 60 164 62 C176 67 190 88 206 105 Q202 130 159 133 C117 135 72 112 51 101 Z'";
const lid = "path 'M14 166 C33 128 48 110 78 103 C124 83 175 91 205 114 Q230 132 250 145 Q220 147 200 135 C164 112 117 106 83 118 Q37 132 14 166 Z'";
const crown = "path 'M9 185 Q0 142 21 96 Q30 53 83 25 Q137 -7 182 16 Q222 16 238 51 Q209 41 205 57 Q163 90 145 183 L124 198 Q124 151 110 144 Q86 137 82 166 L91 195 Z'";
const ends = "path 'M104 -5 L148 -5 Q146 25 125 55 Q114 82 121 111 Q123 134 113 162 Q91 166 64 135 Q50 125 49 113 Q63 79 86 69 Q87 54 97 49 Z'";

// UVs refer to the finished 256 × 192 cell. A material swatch fills only its pigment region.
const baseHair = { source: overview, crop: "264x198+1252+192" };
const eye = { source: overview, crop: "264x198+1542+192" };
const browCrop = { source: overview, crop: "264x198+1542+471" };
const sheets = {
  "body-features": { columns: 3, cells: [
    { source: portrait, crop: "576x432+177+66" }, baseHair, eye,
    { source: overview, crop: "252x189+975+471" }, { source: overview, crop: "264x198+1252+471" }, browCrop,
  ] },
  "body-hair": { columns: 2, cells: [
    { ...baseHair, dye: "#69462f" }, { source: portrait, crop: "310x233+280+63", dye: "#65432d", mask: crown, darkHair: true },
    { ...baseHair, dye: "#8d6849", highlights: true }, { source: portrait, crop: "256x192+227+302", dye: "#674831", mask: ends, darkHair: true },
  ] },
  "body-complexion": { columns: 3, cells: [
    { ...eye, dye: "#78502c", mask: iris },
    { source: overview, crop: "183x137+1324+513", dye: "#b47859" },
    { ...browCrop, dye: "#513a2c", mask: brow, darkHair: true },
  ] },
  "body-makeup": { columns: 3, cells: [
    { source: identity, crop: "176x132+535+371", dye: "#994f43", mask: lips },
    { source: overview, crop: "224x144+1578+531", dye: "#84543e", mask: lid, feather: 5.5, strength: .78 },
    { source: identity, crop: "114x86+623+261" },
  ] },
};

function convert(args, input) {
  return execFileSync("convert", args, { input, maxBuffer: 12 * 1024 * 1024 });
}

function makeCell({ source, crop, dye, mask, feather = 1.4, highlights, darkHair, strength = 1 }) {
  const pixels = convert([source, "-crop", crop, "+repage", "-resize", w + "x" + h + "!", "-depth", "8", "rgba:-"]);
  if (!dye) return pixels;
  const reference = dye.slice(1).match(/../g).map(part => parseInt(part, 16));
  const coverage = mask && convert(["-size", w + "x" + h, "xc:black", "-fill", "white", "-draw", mask,
    "-blur", "0x" + feather, "-colorspace", "gray", "-depth", "8", "gray:-"]);
  for (let i = 0; i < w * h; i++) {
    const rgb = pixels.subarray(4 * i, 4 * i + 3);
    // At the reference dye, the matte composites back to the original artwork.
    // Shadow and specular residuals stay in front of every other dye.
    let weight = 1;
    for (let c = 0; c < 3; c++)
      weight = Math.min(weight, rgb[c] / reference[c], (255 - rgb[c]) / (255 - reference[c]));
    if (coverage) weight *= strength * coverage[i] / 255;
    if (darkHair) weight *= Math.min(1, Math.max(0, (130 - rgb[0]) / 45));
    if (highlights) weight *= Math.min(1, Math.max(0, (rgb[0] - 48) / 52));
    // Quantize coverage for good alpha compression. Keep the residual at full color resolution.
    const alpha = Math.max(1, 255 - Math.floor(weight * 15) * 17);
    for (let c = 0; c < 3; c++)
      rgb[c] = Math.max(0, Math.min(255, Math.round((255 * rgb[c] - (255 - alpha) * reference[c]) / alpha)));
    pixels[4 * i + 3] = alpha;
  }
  return pixels;
}

for (const [name, { columns: cols, cells }] of Object.entries(sheets)) {
  const rows = Math.ceil(cells.length / cols), atlas = Buffer.alloc(w * h * 4 * cols * rows);
  for (const [index, cell] of cells.entries()) {
    const rgba = makeCell(cell), x = (index % cols) * w, y = Math.floor(index / cols) * h;
    for (let row = 0; row < h; row++)
      rgba.copy(atlas, 4 * ((row + y) * cols * w + x), 4 * row * w, 4 * (row + 1) * w);
  }
  convert(["-size", (cols * w) + "x" + (rows * h), "-depth", "8", "rgba:-", "-strip",
    "-quality", "80", "-define", "webp:method=6", base + name + ".webp"], atlas);
}
