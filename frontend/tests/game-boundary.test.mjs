import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx|rs)$/.test(entry.name)) yield path;
  }
}

test("the game runs without the automotive service or its capture routes", () => {
  for (const removed of ["data-server", "research", "frontend/src/store/recon",
    "frontend/src/game/modes/recon", "frontend/src/ui/command"]) {
    assert.equal(existsSync(join(root, removed)), false, removed);
  }
  const files = [join(root, "package.json"), join(root, "frontend/vite.config.ts"),
    ...sources(join(root, "frontend/src")), ...sources(join(root, "avenlab-server/src"))];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"),
      /signal[_-]recon|useCan(?:Bus|Data)Store|socketcan|candump|\/data\/can\b|127\.0\.0\.1:8001/i,
      relative(root, file));
  }
});
