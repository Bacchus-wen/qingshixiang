# robot_split.glb

- Source: `assets/generated/compare/studio/robot-h3.1-8k.glb` (Tripo, unchanged).
- Made by `tools/blender/robot_split.py` (Blender 5.2, headless) on 2026-10-21.
- Content: the same model, cut into two meshes, `robot` and `stool`, in model space (height 1.05 m, origin at the bottom centre, facing +z).
- Why: Tripo generated the robot and its stool as one fused surface. The turn on the stool needs the stool to stay still.
- Changes to the stool:
  - The seat top inside the rim is a new flat plate. Its texture `seat_top` is baked from the original seat.
  - Cable ends that were sunk into the front rim are removed.
- Changes to both meshes: the cuts are closed.
- Use: the input of the `robot` LOD set (`tools/lod-models.json`).
