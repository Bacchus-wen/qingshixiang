import * as THREE from 'three/webgpu';
import {
  pass, depthPass, mrt, output, velocity, uniform, vec2, vec3, vec4, float, screenUV, time, hash, floor, fract, mix,
  smoothstep, length, luminance, clamp, max, renderOutput, Fn,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';

// Post pipeline v1:
//   opaque depth pre-pass (volumes read it for occlusion)
//   -> scene pass (MRT: color + velocity; volumes are transparent and ray-march inside it)
//   -> TRAA (also resolves the per-frame jittered volume ray offsets) -> bloom -> exposure + AgX -> display grade
// Systems register VolumeNodeMaterials with registerVolume(mat) during init; they share `volumeJitter`.
function halton(i, b) { let r = 0, f = 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
const HALTON = Array.from({ length: 32 }, (_, i) => [halton(i + 1, 2), halton(i + 1, 3)]);

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
      lift: uniform(new THREE.Vector3(0.004, 0.006, 0.009)),
      bloomStrength: 0.25, bloomRadius: 0.5, bloomThreshold: 0.9,
    };
    renderer.toneMapping = THREE.AgXToneMapping;
  }

  registerVolume(material) { this.volumes.push(material); }

  build() {
    const { renderer, scene, camera, params } = this;
    const noAA = this.ctx.params.get('pfx')?.includes('notraa');
    const pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputColorTransform = false;

    const prePass = depthPass(scene, camera);
    prePass.transparent = false;
    const preDepth = prePass.getTextureNode('depth');
    for (const m of this.volumes) m.depthNode = preDepth.sample(screenUV);

    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, velocity }));
    const color = scenePass.getTextureNode('output');
    const vel = scenePass.getTextureNode('velocity');
    const aa = noAA ? color : traa(color, preDepth, vel, camera);

    const bloomPass = bloom(aa, params.bloomStrength, params.bloomRadius, params.bloomThreshold);
    this.bloomPass = bloomPass;
    const hdr = aa.add(bloomPass).mul(params.exposure);
    const mapped = renderOutput(vec4(hdr.rgb, 1), THREE.AgXToneMapping, THREE.SRGBColorSpace);

    const grade = Fn(() => {
      const c = clamp(mapped.rgb, 0, 1).toVar();
      c.assign(mix(vec3(luminance(c)), c, params.saturation));
      c.addAssign(params.lift.mul(float(1).sub(c)));
      const d = length(screenUV.sub(0.5).mul(vec2(1, 0.8)));
      c.mulAssign(float(1).sub(smoothstep(0.25, 0.85, d).mul(params.vignette)));
      const px = floor(screenUV.mul(vec2(1920, 1080)));
      const g = hash(px.x.add(px.y.mul(1931)).add(floor(fract(time.mul(0.41)).mul(7919)).mul(2099))).sub(0.5);
      c.addAssign(g.mul(params.grain));
      return vec4(max(c, vec3(0)), 1);
    })();

    pipeline.outputNode = grade;
    this.pipeline = pipeline;
    this.scenePass = scenePass;
    this.prePass = prePass;
  }

  render() {
    const h = HALTON[this.frame++ % 32];
    this.volumeJitter.value.set(h[0], h[1]);
    this.pipeline.render();
  }
}
