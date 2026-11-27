# Public

Runtime assets are addressed by stable URL. models/ and textures are Git LFS assets. world-builder/ is refreshed from installed Rust map JSON by the sync script. draco/ contains the local decoder. Change generated catalogs/metadata with their source assets; do not rename URLs without updating consumers.

The open-art/garage directory contains redistribution-cleared workshop models in standard glTF format with local, content-hashed resources. The main menu requests them from this directory after character selection. Include attribution, license, source, and modifications for each model in its glTF metadata and in the [garage credits](open-art/garage/CREDITS.md). The private model and texture catalog continues to use the staging asset gateway.
