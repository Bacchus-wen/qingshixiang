# Memory crowd — source and processing

- Source: xikhar/cybercity, https://github.com/xikhar/cybercity . No repository license; use is limited to the user-authorized internal company demo. Do not treat this as permission for public redistribution.
- Source models: `reference/cybercity/assets/models/crowd/male.glb` and `female.glb`, and their companion JSON material/animation metadata. Source hashes are in `manifest.json`.
- Four selected LOD1 outfits: male raincoat, female raincoat, female trench, male hoodie. Umbrellas and animation clips remain from those models.
- `src/systems/ghosts/bake-crowd.mjs` deterministically bakes 20 Float32 animation frames and preserves source primitive UVs, material names, index ranges, fabric repeats and map filenames. No Blender, geometry quantization or new model generation.
- Runtime VAT sampling adapts the previously credited cybercity approach. Clothes take real scene lighting; no additional crowd lights.
- Texture sources/conversion are documented in `assets/textures/crowd/CREDITS.md`. Actual atlas conversion is a separate, explicit-approval step; preparing the recipe does not mean JPG outputs exist.
