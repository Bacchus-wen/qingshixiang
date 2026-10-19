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
