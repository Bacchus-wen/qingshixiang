// Temporary scene to verify the engine and the screenshot pipeline. Remove once the street exists.
export default {
  name: 'sandbox',
  async init(ctx) {
    const { THREE, scene } = ctx;
    scene.background = new THREE.Color(0x05070a);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardNodeMaterial({ color: 0x1a1d22, roughness: 0.3 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    this.box = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardNodeMaterial({ color: 0x8a8f96, roughness: 0.6 }));
    this.box.position.y = 1;
    scene.add(this.box);
    const lamp = new THREE.PointLight(0xffb070, 30, 20);
    lamp.position.set(2, 3, 2);
    scene.add(lamp, new THREE.HemisphereLight(0x324050, 0x080808, 0.4));
  },
  update(dt) { this.box.rotation.y += dt * 0.3; },
};
