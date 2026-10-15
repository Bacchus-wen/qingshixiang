import * as THREE from 'three/webgpu';
import {
  pass, depthPass, mrt, output, velocity, normalView, metalness, roughness, packNormalToRGB, unpackRGBToNormal, sample,
  normalWorld, materialReference, uniform, vec2, vec3, vec4, float, screenUV, time, hash, floor, fract, mix,
  smoothstep, length, luminance, clamp, max, renderOutput, Fn,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';

// Post pipeline v1:
//   opaque depth pre-pass (volumes read it for occlusion)
//   -> scene pass (MRT: color + velocity; volumes are transparent and ray-march inside it)
//   -> TRAA (also resolves the per-frame jittered volume ray offsets) -> bloom -> exposure + AgX -> display grade
// Systems register VolumeNodeMaterials with registerVolume(mat) during init; they share `volumeJitter`.
function halton(i, b) { let r = 0, f = 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
const HALTON = Array.from({ length: 32 }, (_, i) => [halton(i + 1, 2), halton(i + 1, 3)]);

export const OCCLUDER_LAYER = 1;

export class PostFX {
  constructor(renderer, scene, camera, ctx) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.ctx = ctx;
    this.volumes = [];
    this.volumeJitter = uniform(new THREE.Vector2());
    this.frame = 0;
    this.params = {
      exposure: uniform(1.0),
      vignette: uniform(0.5),
      grain: uniform(0.035),
      saturation: uniform(0.85),
      contrast: uniform(0.38),
      blackPoint: uniform(0.018),
      lift: uniform(new THREE.Vector3(0.004, 0.006, 0.009)),
      ssrIntensity: uniform(1.0),
      // depth of field, driven by the director (bokeh 0 = off)
      focus: uniform(10), focalRange: uniform(6), bokeh: uniform(0),
      bloomStrength: 0.25, bloomRadius: 0.5, bloomThreshold: 0.9,
    };
    renderer.toneMapping = THREE.AgXToneMapping;
  }

  registerVolume(material) { this.volumes.push(material); }

  build() {
    const { renderer, scene, camera, params } = this;
    const dbg = (this.ctx.params.get('pfx') || '').split(',');
    const noAA = dbg.includes('notraa');
    const low = this.ctx.quality === 'low';
    if (low) dbg.push('nossr', 'nodof');
    const pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputColorTransform = false;

    // occluder-only depth pre-pass for the volumes: a camera that sees layer 1 (merged street, robot, door) only,
    // instead of re-drawing every small object a second time (the frame was CPU/draw-call bound)
    const preCam = this.preCam = camera.clone();
    preCam.layers.set(OCCLUDER_LAYER);
    const prePass = depthPass(scene, preCam);
    prePass.transparent = false;
    const preDepth = prePass.getTextureNode('depth');
    for (const m of this.volumes) m.depthNode = preDepth.sample(screenUV);

    const scenePass = pass(scene, camera);
    // G-buffer attachments carry alpha = "opaque"; transparent draws (rain, fog, beams) blend with alpha 0 and keep
    // the opaque values underneath, so SSR and TRAA never see a raindrop's normal or roughness.
    const opaqueW = float(1).sub(materialReference('transparent', 'float'));
    const gbuf = mrt({
      output,
      normal: vec4(packNormalToRGB(normalView), opaqueW),
      // b = how up-facing the shaded surface is (world space), so SSR can be limited to the ground plane
      metalrough: vec4(metalness, roughness, smoothstep(0.55, 0.9, normalWorld.y), opaqueW),
      velocity: vec4(velocity, 0, opaqueW),
    });
    const keep = new THREE.BlendMode(THREE.NormalBlending);
    for (const k of ['normal', 'metalrough', 'velocity']) gbuf.setBlendMode(k, keep);
    scenePass.setMRT(gbuf);
    scenePass.getTexture('normal').type = THREE.UnsignedByteType;
    scenePass.getTexture('metalrough').type = THREE.UnsignedByteType;
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const vel = scenePass.getTextureNode('velocity');
    const nTex = scenePass.getTextureNode('normal');
    const mr = scenePass.getTextureNode('metalrough');

    // SSR only on smooth, up-facing (wet ground, puddles) surfaces; walls and rough surfaces use the environment.
    let lit = color;
    if (!dbg.includes('nossr')) {
      const refl = float(1).sub(smoothstep(0.04, 0.45, mr.g)).mul(mr.b);
      const ssrPass = ssr(color, depth, sample((u) => unpackRGBToNormal(nTex.sample(u))), {
        metalnessNode: refl, roughnessNode: mr.g, reflectNonMetals: false, camera, // refl acts as metalness: zero-refl pixels early-out
      });
      ssrPass.resolutionScale = 0.5;
      ssrPass.quality.value = 0.5;
      ssrPass.maxDistance.value = 60;
      ssrPass.thickness.value = 0.15;
      ssrPass.blurQuality = 2;
      this.ssrPass = ssrPass;
      // gate SSR ourselves: only up-facing, glossy pixels receive reflections (walls/shutters never smear)
      lit = color.add(ssrPass.rgb.mul(refl).mul(params.ssrIntensity));
      if (dbg.includes('ssronly')) lit = ssrPass.rgb.mul(4);
      if (dbg.includes('refl')) lit = vec3(refl);
      if (dbg.includes('nrm')) lit = nTex.rgb;
      if (dbg.includes('mr')) lit = vec3(mr.r, mr.g, 0);
    }
    const aa0 = noAA ? lit : traa(lit, depth, vel, camera);
    const aa = dbg.includes('nodof') ? aa0 : dof(aa0, scenePass.getViewZNode(), params.focus, params.focalRange, params.bokeh);

    const bloomPass = bloom(aa, params.bloomStrength, params.bloomRadius, params.bloomThreshold);
    this.bloomPass = bloomPass;
    const hdr = aa.add(bloomPass).mul(params.exposure);
    const mapped = renderOutput(vec4(hdr.rgb, 1), THREE.AgXToneMapping, THREE.SRGBColorSpace);

    const grade = Fn(() => {
      const c = clamp(mapped.rgb, 0, 1).toVar();
      c.assign(mix(vec3(luminance(c)), c, params.saturation));
      // print-like curve: deeper blacks, gentle shoulder
      c.assign(max(c.sub(params.blackPoint), vec3(0)).div(float(1).sub(params.blackPoint)));
      c.assign(mix(c, c.mul(c).mul(float(3).sub(c.mul(2))), params.contrast));
      c.addAssign(params.lift.mul(float(1).sub(c)));
      const d = length(screenUV.sub(0.5).mul(vec2(1, 0.8)));
      c.mulAssign(float(1).sub(smoothstep(0.25, 0.85, d).mul(params.vignette)));
      const px = floor(screenUV.mul(vec2(1920, 1080)));
      const g = hash(px.x.add(px.y.mul(1931)).add(floor(fract(time.mul(0.41)).mul(7919)).mul(2099))).sub(0.5);
      c.addAssign(g.mul(params.grain));
      return vec4(max(c, vec3(0)), 1);
    })();

    // debug views (?pfx=refl|nrm|mr|ssronly) bypass bloom/tonemap so values read raw
    const rawDbg = ['refl', 'nrm', 'mr', 'ssronly'].some((k) => dbg.includes(k));
    pipeline.outputNode = rawDbg ? vec4(lit.rgb, 1) : grade;
    this.pipeline = pipeline;
    this.scenePass = scenePass;
    this.prePass = prePass;
  }

  render() {
    const c = this.camera, p = this.preCam;
    if (p) { p.position.copy(c.position); p.quaternion.copy(c.quaternion); p.fov = c.fov; p.aspect = c.aspect; p.near = c.near; p.far = c.far; p.updateProjectionMatrix(); p.updateMatrixWorld(); }
    const h = HALTON[this.frame++ % 32];
    this.volumeJitter.value.set(h[0], h[1]);
    this.pipeline.render();
  }
}
