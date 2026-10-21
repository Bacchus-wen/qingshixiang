// Workarounds for three.js r186 (WebGPURenderer) bugs that affect this project. Call once, right after renderer.init().
//
// 1. RenderObject.getGeometryCacheKey() describes each vertex attribute by name, stride, offset, item size and the
//    "normalized" flag but not by its array type. Two meshes whose attributes differ only in storage -- e.g. normals as
//    normalized Int8 (meshopt default) vs normalized Int16 -- get the same cache key, so they share one node state and
//    one render pipeline, and the one drawn second reads its vertices with the other's vertex format (garbled
//    normals/UVs: blotchy "camouflage" lighting, wrong colours). WebGL2 binds attributes per draw and is not affected.
//    Seen here when the scene's level-of-detail models (Int8 normals) met two older street models (Int16 normals).
//    The fix appends the array type of every attribute to the key; it is applied to the RenderObject prototype the
//    first time the renderer creates a render object (the class itself is not exported).
export function applyThreeFixes(renderer) {
  const objs = renderer._objects;
  if (!objs || objs.__fixed) return;
  objs.__fixed = true;
  const get0 = objs.get;
  objs.get = function (...args) {
    const ro = get0.apply(this, args);
    const P = Object.getPrototypeOf(ro);
    if (!P.__typedGeometryKey) {
      P.__typedGeometryKey = true;
      const base = P.getGeometryCacheKey;
      P.getGeometryCacheKey = function () {
        let key = base.call(this);
        const attrs = this.geometry.attributes;
        for (const name of Object.keys(attrs).sort()) {
          const a = attrs[name], arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
          key += name + ':' + (arr ? arr.constructor.name : '?') + ',';
        }
        return key;
      };
    }
    return ro;
  };
}

// 2. Render pipelines compile in the GPU process. Created the default way (createRenderPipeline), the first frame that
//    draws a new material waits until its pipeline is compiled: on the opening of the shop story -- a few hundred
//    materials of 60-80 KB of WGSL each, every one coming into view for the first time -- frames of 2-16 s, and 40 s
//    of a 45 s opening frozen (tools/perf-open.mjs, 2026-10-21). Created with createRenderPipelineAsync instead, they
//    compile in parallel and the frame goes on without that object until its pipeline is ready (r186 skips a draw
//    whose pipeline is not ready: Pipelines.isReady). Engine.warmUp compiles everything in the scene that way behind
//    the loading screen, so in the story itself nothing waits and nothing is missing.
//    Returns { pending: pipelines still compiling, created, settled(): a promise for the ones in flight }.
export function asyncPipelines(renderer) {
  const P = renderer._pipelines;
  const pending = new Set();
  const state = { created: 0, get pending() { return pending.size; }, settled: () => Promise.all([...pending]) };
  const sink = { push(p) { state.created++; pending.add(p); p.finally(() => pending.delete(p)); } };
  const get = P.getForRender;
  P.getForRender = function (renderObject, promises = null) { return get.call(this, renderObject, promises ?? sink); };
  return state;
}
