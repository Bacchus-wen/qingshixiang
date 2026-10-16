import * as THREE from 'three/webgpu';
import {
  pass, depthPass, mrt, output, velocity, normalView, metalness, roughness, packNormalToRGB, unpackRGBToNormal, sample,
  normalWorld, materialReference, uniform, vec2, vec3, vec4, float, screenUV, time, hash, floor, fract, mix,
  smoothstep, length, luminance, clamp, max, min, renderOutput, Fn, agxToneMapping, exp,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

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
      exposure: uniform(1.05), // v3: real lights now carry the street
      vignette: uniform(0.5),
      grain: uniform(0.035),
      saturation: uniform(1.12), hueKeep: uniform(0.45),
      contrast: uniform(0.45),
      blackPoint: uniform(0.02),
      lift: uniform(new THREE.Vector3(0.004, 0.006, 0.009)),
      // film: amber halation hugging warm highlights, gate weave (sub-pixel frame drift), density flicker
      halation: uniform(0.55), aoStrength: uniform(0.85), scatter: uniform(0.16), streak: uniform(0.08), weave: uniform(new THREE.Vector2()), flicker: uniform(0),
      ssrIntensity: uniform(1.0),
      // depth of field, driven by the director (bokeh 0 = off)
      focus: uniform(10), focalRange: uniform(6), bokeh: uniform(0),
      bloomStrength: 0.3, bloomRadius: 0.7, bloomThreshold: 1.4, // v3: only lamp and tube cores bloom
    };
    renderer.toneMapping = THREE.AgXToneMapping;
  }

  // volumes added after build() (e.g. by a system's late init) still get the occluder depth
  registerVolume(material) { this.volumes.push(material); if (this.preDepth) material.depthNode = this.preDepth.sample(screenUV); }

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
    this.preDepth = preDepth;
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

    // v3 (review): ground-truth AO at half resolution -- contact shadows under the robot, props and cars, dark seams
    // and corners; the flat "grey box" look came largely from its absence
    let base = color;
    if (!dbg.includes('noao') && this.ctx?.quality !== 'low') {
      const aoPass = ao(depth, sample((u) => unpackRGBToNormal(nTex.sample(u))), camera);
      aoPass.resolutionScale = 0.5; aoPass.radius.value = 1.1; aoPass.thickness.value = 1.5; aoPass.scale.value = 1.8; aoPass.samples.value = 12;
      this.aoPass = aoPass;
      const occ = aoPass.getTextureNode().r;
      base = vec4(color.rgb.mul(mix(float(1), occ, params.aoStrength)), color.a);
      if (dbg.includes('aoonly')) base = vec4(vec3(occ), 1);
    }
    // SSR only on smooth, up-facing (wet ground, puddles) surfaces; walls and rough surfaces use the environment.
    let lit = base;
    if (!dbg.includes('nossr')) {
      const refl = float(1).sub(smoothstep(0.04, 0.45, mr.g)).mul(mr.b);
      const ssrPass = ssr(color, depth, sample((u) => unpackRGBToNormal(nTex.sample(u))), {
        metalnessNode: refl, roughnessNode: mr.g, reflectNonMetals: false, camera, // refl acts as metalness: zero-refl pixels early-out
      });
      ssrPass.resolutionScale = 0.5;
      ssrPass.quality.value = 0.5;
      ssrPass.maxDistance.value = 100; // v3: high signs still reflect in the road
      if (ssrPass.maxLuminance) ssrPass.maxLuminance.value = 40; // neon reflections not clipped
      ssrPass.thickness.value = 0.15;
      ssrPass.blurQuality = 2;
      this.ssrPass = ssrPass;
      // gate SSR ourselves: only up-facing, glossy pixels receive reflections (walls/shutters never smear)
      lit = base.add(ssrPass.rgb.mul(params.ssrIntensity).mul(mr.b)); // v3: refl was applied twice (SSR already weights it)
      if (dbg.includes('ssronly')) lit = ssrPass.rgb.mul(4);
      if (dbg.includes('refl')) lit = vec3(refl);
      if (dbg.includes('nrm')) lit = nTex.rgb;
      if (dbg.includes('mr')) lit = vec3(mr.r, mr.g, 0);
    }
    const aa0 = noAA ? lit : traa(lit, depth, vel, camera);
    const aa = dbg.includes('nodof') ? aa0 : dof(aa0, scenePass.getViewZNode(), params.focus, params.focalRange, params.bokeh);

    const bloomPass = bloom(aa, params.bloomStrength, params.bloomRadius, params.bloomThreshold);
    this.bloomPass = bloomPass;
    // gate weave: the whole developed frame drifts a fraction of a pixel, like film in a projector gate
    const aaTex = aa.getTextureNode?.();
    const frameCol = aaTex ? aaTex.sample(screenUV.add(params.weave)) : aa;
    // halation: light scattered back through the film base. Only chromatic (memory-amber) glow gets the warm
    // fringe, so the silver present stays neutral and the past bleeds a little more than it should.
    const bl = bloomPass.rgb;
    const bmax = max(bl.r, max(bl.g, bl.b));
    const chroma = smoothstep(0.04, 0.3, bmax.sub(min(bl.r, min(bl.g, bl.b))).div(bmax.add(1e-4)));
    const halo = bl.mul(vec3(1.0, 0.42, 0.16)).mul(chroma).mul(params.halation);
    // v3 (after cybercity, Grok r15b): the lit picture scattered into the rainy air -- a quarter-resolution blur mixed
    // in by distance (neon and windows bleed into the haze), and a faint horizontal streak on the hottest cores
    let air = frameCol.rgb;
    if (!dbg.includes('noscatter')) {
      const blur = gaussianBlur(aa, null, 2.5, { resolutionScale: 0.25 }).rgb;
      const dist = scenePass.getViewZNode().negate().max(0);
      const amt = float(1).sub(exp(dist.mul(-0.006))).mul(params.scatter);
      air = mix(frameCol.rgb, blur, amt).add(blur.mul(0.03));
      const hot = max(aa.rgb.sub(vec3(2.0)), vec3(0));
      const streak = gaussianBlur(hot, vec2(1, 0), 14, { resolutionScale: 0.25 }).rgb;
      air = air.add(streak.mul(vec3(0.55, 0.65, 1.0)).mul(params.streak));
    }
    const hdr = air.add(bl).add(halo).mul(params.exposure).mul(params.flicker.add(1));
    // v3 hue-preserving AgX (after cybercity): plain AgX bleaches saturated neon to white too early; blending in a
    // max-channel mapped version keeps the colour, only the hottest cores go white
    const tmFull = agxToneMapping(hdr.rgb, float(1));
    const peak = max(hdr.r, max(hdr.g, hdr.b)).max(1e-4);
    const tmPeak = agxToneMapping(vec3(peak), float(1)).g;
    const tm = mix(tmFull, hdr.rgb.div(peak).mul(tmPeak), params.hueKeep);
    const mapped = renderOutput(vec4(tm, 1), THREE.NoToneMapping, THREE.SRGBColorSpace);

    const grade = Fn(() => {
      const c = clamp(mapped.rgb, 0, 1).toVar();
      c.assign(mix(vec3(luminance(c)), c, params.saturation));
      // print-like curve: deeper blacks, gentle shoulder
      c.assign(max(c.sub(params.blackPoint), vec3(0)).div(float(1).sub(params.blackPoint)));
      c.assign(mix(c, c.mul(c).mul(float(3).sub(c.mul(2))), params.contrast));
      c.addAssign(params.lift.mul(float(1).sub(c)));
      // split toning: cold, slightly teal shadows; faintly warm highlights
      const lum = luminance(c);
      c.addAssign(vec3(-0.012, 0.012, 0.022).mul(float(1).sub(lum).pow(3)));
      c.mulAssign(mix(vec3(1), vec3(1.02, 0.99, 0.96), smoothstep(0.35, 0.9, lum)));
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
    // weave/flicker: smooth pseudo-random drift stepped at 24 fps (film cadence), deterministic in frame count
    const f = Math.floor(this.frame * 24 / 60), n = (k) => Math.sin(f * 12.9898 + k * 78.233) * 43758.5453 % 1;
    const P = this.params, a = 0.45 / 1080; // ~0.45 px at 1080p
    P.weave.value.x += (n(1) * a * 0.6 - P.weave.value.x) * 0.35;
    P.weave.value.y += (n(2) * a - P.weave.value.y) * 0.35;
    P.flicker.value += (n(3) * 0.012 - P.flicker.value) * 0.3;
    this.pipeline.render();
  }
}
