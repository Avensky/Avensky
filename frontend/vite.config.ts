// vite.config.ts
import { execFile } from "node:child_process";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { discoveredWardrobeCatalogFile, isWardrobeCatalogInput, wardrobeCatalogFile, wardrobeDirectory } from "./scripts/discover-wardrobe-garments.mts";
import { characterLod, findVillagerModel, hasCharacterModel, hasCompatibleWardrobeRevision, installedPackedVesperPortrait, vesperActorUrls } from "./scripts/character-model-paths.mts";
import { prepareBuild } from "./scripts/prepare-build.mjs";
import { publicRoot, releaseOutput, stagingRelease, type StagingRelease } from "./scripts/staging-release.mjs";
import { isStreamedAsset } from "./src/assets/assetPaths.ts";
import { fittedHairCatalog, fittedTennisGarments } from "./src/game/characters/fittedWardrobe/alphaAssets.ts";
import { resolveDeploymentEnvironment } from "./src/net/deploymentEnvironment.ts";

const frontend = fileURLToPath(new URL(".", import.meta.url));

function assetDefines(release: StagingRelease | null) {
  const hasModel = (file: URL) => release
    ? file.href.startsWith(publicRoot.href) && Object.hasOwn(release.assets, "/" + decodeURIComponent(file.href.slice(publicRoot.href.length)))
    : hasCharacterModel(file);
  const heroesPreviewManifest = new URL("./public/models/heroes-generated/previews.json", import.meta.url);
  const heroesVehiclePreviews = release?.previews ?? (existsSync(heroesPreviewManifest)
    ? JSON.parse(readFileSync(heroesPreviewManifest, "utf8")) : {});
  const wardrobeSets: { id: string }[] = JSON.parse(readFileSync(new URL("../packages/wardrobe-catalog/character-wardrobe.json", import.meta.url), "utf8"));
  const standaloneCorsetIds = [...wardrobeSets.map(({ id }) => id),
    "gothic-laced-bodice", "gothic-underbust-vest", "gothic-underbust-vest-original-cut", "gothic-underbust-vest-tucked",
    "gothic-high-collar"];
  const standaloneCorsetLods = Object.fromEntries(standaloneCorsetIds.map(id => [id, {
    garage: hasModel(new URL(`./public/models/characters/female/wardrobe/corsets/${id}.garage.glb`, import.meta.url)),
    mobile: hasModel(new URL(`./public/models/characters/female/wardrobe/corsets/${id}.mobile.glb`, import.meta.url)),
  }]));
  const bundledWardrobeLods = Object.fromEntries(wardrobeSets.map(({ id }) => [id, {
    garage: hasModel(new URL(`./public/models/characters/wardrobe/${id}.garage.glb`, import.meta.url)),
    mobile: hasModel(new URL(`./public/models/characters/wardrobe/${id}.mobile.glb`, import.meta.url)),
  }]));

  const dressingRoomImports: { id: string; url: string; mobileUrl?: string; revisionUrl?: string; retired?: boolean }[] =
    [wardrobeCatalogFile, discoveredWardrobeCatalogFile].flatMap(file => JSON.parse(readFileSync(file, "utf8")));
  const activeImports = dressingRoomImports.filter(item => !item.retired);
  const garmentFile = (url: string) => new URL(`./public${url}`, import.meta.url);
  const installedRevisions = activeImports.filter(({ id, revisionUrl, url }) =>
    revisionUrl && (release ? release.wardrobeRevisions.includes(id) && hasModel(garmentFile(revisionUrl))
      : hasCompatibleWardrobeRevision(garmentFile(revisionUrl), garmentFile(url))),
  ).map(({ id }) => id);
  const bagFolder = "/models/characters/female/props/bag-black-gold";
  const bagModelUrl = [
    `${bagFolder}/bag-black-gold-mobile.glb`,
    `${bagFolder}/bag-black-gold-garage.glb`,
    "/models/characters/props/bag-black-gold/bag-black-gold-mobile.glb",
    "/models/characters/props/bag-black-gold/bag-black-gold-garage.glb",
    "/models/characters/shop-bag.glb",
  ].find(url => hasModel(new URL(`./public${url}`, import.meta.url)));
  const rook = findVillagerModel("male", hasModel);
  const vesper = findVillagerModel("female", hasModel);
  const { model: vesperModelUrl, portrait: authoredPortrait } = vesperActorUrls(vesper, publicRoot, hasModel);
  const portraitHash = authoredPortrait && release?.assets[authoredPortrait]?.sha256;
  const packedPath = portraitHash && "/models/characters/portraits-generated/vesper-" + portraitHash.slice(0, 16) + ".glb";
  const packedPortrait = release
    ? (packedPath && Object.hasOwn(release.assets, packedPath) ? packedPath : null)
    : installedPackedVesperPortrait(vesper);

  const fittedHair: {id: string; label: string; url: string; mesh: string; sha256: string}[] = JSON.parse(readFileSync(
    new URL("../packages/wardrobe-catalog/fitted-hair.json", import.meta.url), "utf8"));
  return {
    __FITTED_HAIR_IDS__: JSON.stringify(fittedHair.filter(style => release?.assets[style.url]?.sha256 === style.sha256).map(style => style.id)),
    __STAGING_ASSET_RELEASE__: JSON.stringify(release && {
      id: release.id, paths: Object.fromEntries(Object.keys(release.assets).map(path => [path, true])),
    }),
    __HEROES_VEHICLE_PREVIEWS__: JSON.stringify(heroesVehiclePreviews),
    __FITTED_HAIR_URLS__: JSON.stringify(fittedHairCatalog.filter(item => hasModel(garmentFile(item.url))).map(item => item.url)),
    __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify([...activeImports, ...fittedTennisGarments]
      .filter(item => item.url && hasModel(garmentFile(item.url))).map(item => item.id)),
    __DRESSING_ROOM_MOBILE_IDS__: JSON.stringify(activeImports.filter(item => item.mobileUrl && hasModel(garmentFile(item.mobileUrl))).map(item => item.id)),
    __DRESSING_ROOM_REVISION_IDS__: JSON.stringify(installedRevisions),
    __STANDALONE_CORSET_LODS__: JSON.stringify(standaloneCorsetLods),
    __BUNDLED_WARDROBE_LODS__: JSON.stringify(bundledWardrobeLods),
    __WARDROBE_SET_IDS__: JSON.stringify(Object.keys(bundledWardrobeLods).filter(id =>
      bundledWardrobeLods[id].garage || bundledWardrobeLods[id].mobile,
    )),
    __CHARACTER_BAG_URL__: JSON.stringify(bagModelUrl ?? null),
    __VILLAGER_MODEL_URL__: JSON.stringify(vesperModelUrl),
    __VILLAGER_PORTRAIT_URL__: JSON.stringify(packedPortrait ?? authoredPortrait),
    __CHARACTER_MODEL_FALLBACKS__: JSON.stringify(packedPortrait && authoredPortrait ? { [packedPortrait]: authoredPortrait } : {}),
    __ROOK_MODEL_URL__: JSON.stringify(characterLod(rook, "garage", hasModel) ?? rook?.sourceUrl ?? null),
    __ROOK_PORTRAIT_URL__: JSON.stringify(characterLod(rook, "portrait", hasModel) ?? rook?.sourceUrl ?? null),
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, frontend, "VITE_");
  const staging = resolveDeploymentEnvironment(mode, env.VITE_DEPLOY_ENV) === "staging";
  if (command === "build") prepareBuild(staging ? "staging" : "local");
  const release = staging ? stagingRelease(process.env.AVENSKY_PREBUILT_ASSETS) : null;
  return {
    publicDir: staging && command === "serve" ? false : undefined,
    define: assetDefines(release),
    // The road workbench has its own virtual bundle / preview build. Scanning all
    // preview HTML at app startup wasted work and attempted to resolve that bundle.
    optimizeDeps: { entries: ["index.html"] },
    build: {
      outDir: staging ? "dist-staging" : undefined,
      copyPublicDir: !staging,
      rollupOptions: {
        input: [
          fileURLToPath(new URL("./index.html", import.meta.url)),
          fileURLToPath(new URL("./previews/wardrobe-asset.html", import.meta.url)),
        ],
      },
    },
    resolve: { dedupe: ["react", "react-dom", "three"] },
    plugins: [
      release && {
        name: "staging-public-files",
        writeBundle(options) {
          const source = fileURLToPath(publicRoot);
          cpSync(source, resolve(frontend, options.dir ?? "dist-staging"), {
            recursive: true,
            filter: file => {
              const path = "/" + relative(source, file).split(sep).join("/");
              return !/\.glb$/i.test(path) && !isStreamedAsset(path) && !path.startsWith("/models/heroes-generated/");
            },
          });
          mkdirSync(new URL(".", releaseOutput), { recursive: true });
          const temporary = new URL(releaseOutput.href + "." + process.pid);
          writeFileSync(temporary, JSON.stringify(release, null, 2) + "\n");
          renameSync(temporary, releaseOutput);
        },
      },
      {
        name: "installed-map-catalog",
        configureServer(server: ViteDevServer) {
          const directory = fileURLToPath(new URL("../avenlab-server/src/assets/blocks/", import.meta.url));
          const script = fileURLToPath(new URL("../scripts/sync-world-builder-map.mjs", import.meta.url));
          let timer: ReturnType<typeof setTimeout>;
          const refresh = (file: string) => {
            if (!resolve(file).startsWith(resolve(directory) + sep) || !file.endsWith("_colliders.json")) return;
            clearTimeout(timer);
            timer = setTimeout(() => execFile(process.execPath, [script], error => {
              if (error) server.config.logger.error(error.message);
              else server.ws.send({ type: "full-reload" });
            }), 200);
          };
          server.watcher.add(directory);
          server.watcher.on("add", refresh).on("change", refresh).on("unlink", refresh);
          server.httpServer?.once("close", () => { clearTimeout(timer); server.watcher.off("add", refresh).off("change", refresh).off("unlink", refresh); });
        },
      },
      {
        name: "installed-wardrobe-catalog",
        configureServer(server: ViteDevServer) {
          let timer: ReturnType<typeof setTimeout>;
          const refresh = (file: string) => {
            if (!isWardrobeCatalogInput(file)) return;
            clearTimeout(timer);
            timer = setTimeout(() => server.restart().catch(error => server.config.logger.error(String(error))), 250);
          };
          server.watcher.add([wardrobeCatalogFile, discoveredWardrobeCatalogFile, wardrobeDirectory].map(file => fileURLToPath(file)));
          server.watcher.on("add", refresh).on("change", refresh).on("unlink", refresh);
          server.httpServer?.once("close", () => { clearTimeout(timer); server.watcher.off("add", refresh).off("change", refresh).off("unlink", refresh); });
        },
      },
      react({ babel: { plugins: [["babel-plugin-react-compiler"]] } }),
      tailwindcss(),
    ],
    server: {
      port: 5174,
    },
  };
});
