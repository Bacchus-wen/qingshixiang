// Bake-time material mapping; source GLB primitives retain their original UVs.
// Read alongside reference/cybercity/assets/models/crowd/{male,female}.json.
export const VAT_FORMAT = 'indices-u32_positions-f32_normals-f32_uvs-f32';
export const ATLAS_SIZE = 1024;
export const TILE_SIZE = 256;
export const GUTTER = 8;
const FABRIC = {
  rain: ['fab_pvc', 2.5, .6], trench: ['fab_twill', 9, .7],
  knit: ['fab_knit', 9, .9], boots: ['fab_pvc', 4, .3],
};
export function materialSpec(name, source, slot) {
  const original = source.materials[name];
  if (!original) throw new Error(`Missing source material ${name}`);
  const maps = source.textures[name] || {};
  const fabric = !maps.map && FABRIC[name.split('_')[0]];
  const umbrella = name.startsWith('umb_');
  const alphaCutout = /^(hair_|brow$|lash$)/.test(name);
  const diffuse = maps.map || (fabric ? `textures/crowd/${fabric[0]}_d.jpg` : null);
  const normal = maps.normal || (fabric ? `textures/crowd/${fabric[0]}_n.jpg` : null);
  return {
    name, slot, diffuse, normal, alphaCutout, umbrella,
    // Textured clothes/skin keep their photographic albedo; fabric detail uses
    // the authored linear tint and twice the grayscale fabric detail (upstream).
    color: maps.map ? [1, 1, 1] : original.color.slice(0, 3),
    fabricDetail: !!fabric, repeat: fabric?.[1] || 1,
    normalScale: normal ? fabric?.[2] ?? 1 : 0,
    roughness: umbrella ? .75 : name.startsWith('rain_') ? .35 : .6,
    // glTF v=0 is the top of the image; runtime textures use flipY=false.
    rect: [(slot % 4 * TILE_SIZE + GUTTER + .5) / ATLAS_SIZE,
      (Math.floor(slot / 4) * TILE_SIZE + GUTTER + .5) / ATLAS_SIZE,
      (TILE_SIZE - 2 * GUTTER - 1) / ATLAS_SIZE,
      (TILE_SIZE - 2 * GUTTER - 1) / ATLAS_SIZE],
  };
}
