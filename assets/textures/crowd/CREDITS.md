# Crowd texture sources and conversion recipe

Source: xikhar/cybercity, https://github.com/xikhar/cybercity . No repository license. User-authorized internal company demo only; no public redistribution permission is implied.

Source directory: `reference/cybercity/assets/textures/crowd/`.
Exact per-outfit material/file assignments and UV repeats live in `assets/models/crowd/manifest.json`.

Selected source textures:
- Raincoats and boots: `fab_pvc_d.jpg`, `fab_pvc_n.jpg`.
- Trench and belt: `fab_twill_d.jpg`, `fab_twill_n.jpg`.
- Hoodie: `fab_knit_d.jpg`, `fab_knit_n.jpg`.
- Underlying clothes: `male_elegantsuit01_diffuse.jpg`, `male_casualsuit06_diffuse.jpg`, `male_casualsuit06_normal.jpg`, `female_casualsuit01_diffuse.jpg`, `female_casualsuit01_normal.jpg`.
- Shoes: `shoes05_diffuse.jpg`; procedural boots retain the source PVC material/tint.
- Skin: `young_lightskinned_male_diffuse3.jpg`, `young_lightskinned_female_diffuse3.jpg`.
- Hair/face: `short02_diffuse.png`, `bob02_diffuse.png`, `long01_diffuse.png`, `eyebrow001.png`, `eyelashes01.png`, `brown_eye.jpg`.

Prepared conversion: `node src/systems/ghosts/prepare-textures.mjs --confirmed`, run from project root **only after the user's image-conversion approval**. Local Node + macOS sips, JPEG quality 85; zero external API calls, zero paid quota, no generated imagery. It creates two 1024x1024 JPEGs per outfit: sRGB color and linear data (R/G tangent normal, B original opacity). Each atlas has sixteen 256px tiles, an 8px gutter, and 240px inner samples. Source PNG opacity remains available for hair/brow/lash cutouts. Normal Z is reconstructed in the shader. The UV repeat is applied per fragment, not wrapped per vertex.

`manifest.json` in this directory is written only after actual successful conversion and records input/output SHA-256, dimensions and byte counts. It is intentionally absent while approval is pending. The converter refuses output exceeding the 6,000,000-byte incremental UV + JPEG budget. Metadata/credits are additional small files; the final verification also accounts for them. Runtime uses two samplers per outfit and no additional draw calls. Whole-atlas mipmaps are disabled to avoid material bleeding.
