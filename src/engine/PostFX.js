import * as THREE from 'three/webgpu';
import {
  pass, uniform, vec2, vec3, vec4, float, screenUV, time, hash, floor, fract, mix, smoothstep, length, luminance,
  clamp, max, renderOutput, Fn,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

// Post pipeline v0: scene -> bloom -> exposure + AgX -> display grade (lifted cold blacks, vignette, grain).
// SSR, TRAA and the memory-cone composite are added in later phases (see docs/PROGRESS.md).
export class PostFX {
  constructor(renderer, scene, camera, ctx) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.ctx = ctx;
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

  build() {
    const { renderer, scene, camera, params } = this;
    const pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputColorTransform = false;

    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode('output');
    const bloomPass = bloom(color, params.bloomStrength, params.bloomRadius, params.bloomThreshold);
    this.bloomPass = bloomPass;
    const hdr = color.add(bloomPass).mul(params.exposure);
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
  }

  render() { this.pipeline.render(); }
}
