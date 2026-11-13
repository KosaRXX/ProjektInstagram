import * as THREE from 'three';
import { softDotTexture } from './textures';

/**
 * Efekty atmosferyczne: deszcz na szybie (przesuwający się w górę), „deszcz w górę” za oknem,
 * kurz w świetle lampy, mgła. Wszystko wykonane na GPU/CPU w sposób lekki.
 */

const glassVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glassFrag = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  void main() {
    float cols = 46.0;
    float x = vUv.x * cols;
    float id = floor(x);
    float rnd = hash(id * 12.9898);
    float fx = fract(x) - 0.5;
    float line = smoothstep(0.09, 0.0, abs(fx) - 0.05 * rnd);
    // przesuw w górę: wzór zależy od (y - t), więc struktury płyną ku górze
    float yy = fract(vUv.y * (1.2 + rnd) - uTime * (0.12 + rnd * 0.22));
    float head = smoothstep(0.0, 0.35, yy) * smoothstep(1.0, 0.8, yy);
    float drop = line * head * step(0.6, rnd) * uStrength;
    float alpha = drop * 0.14;
    gl_FragColor = vec4(vec3(0.75, 0.86, 0.95), alpha);
  }
`;

export interface Effects {
  root: THREE.Group;
  update(t: number, dt: number, cameraPos: THREE.Vector3): void;
  setQuality(level: 'low' | 'medium' | 'high' | 'ultra'): void;
  dispose(): void;
}

export function createEffects(detail: 'low' | 'medium' | 'high' | 'ultra'): Effects {
  const root = new THREE.Group();
  root.name = 'effects';

  // 1) Deszcz na szybie (efekt w shaderze – tani)
  const glassMat = new THREE.ShaderMaterial({
    vertexShader: glassVert,
    fragmentShader: glassFrag,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
    transparent: true,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), glassMat);
  glass.position.set(0, 1.9, -2.93);
  root.add(glass);

  // 2) „Deszcz w górę” – krople tuż przy szybie, lecące do góry
  const dropCount = detail === 'low' ? 80 : detail === 'medium' ? 160 : 280;
  const dropPos = new Float32Array(dropCount * 3);
  const dropSpeed = new Float32Array(dropCount);
  const seed = (i: number, k: number) => Math.abs(Math.sin(i * 91.7 + k * 13.1));
  for (let i = 0; i < dropCount; i++) {
    dropPos[i * 3] = (seed(i, 1) - 0.5) * 2.4;
    dropPos[i * 3 + 1] = 0.9 + seed(i, 2) * 2.0;
    dropPos[i * 3 + 2] = -2.86 + seed(i, 3) * 0.04;
    dropSpeed[i] = 0.4 + seed(i, 4) * 0.9;
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const dropMat = new THREE.PointsMaterial({ color: 0xbcd3e0, size: 0.018, transparent: true, opacity: 0.55, depthWrite: false, map: softDotTexture() });
  const drops = new THREE.Points(dropGeo, dropMat);
  root.add(drops);

  // 3) Kurz w świetle (dryfujące cząsteczki)
  const dustCount = detail === 'low' ? 120 : detail === 'medium' ? 240 : detail === 'high' ? 360 : 520;
  const dustPos = new Float32Array(dustCount * 3);
  const dustVel = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (seed(i, 5) - 0.5) * 5;
    dustPos[i * 3 + 1] = 0.3 + seed(i, 6) * 2.8;
    dustPos[i * 3 + 2] = (seed(i, 7) - 0.5) * 5;
    dustVel[i * 3] = (seed(i, 8) - 0.5) * 0.05;
    dustVel[i * 3 + 1] = (seed(i, 9) - 0.5) * 0.02;
    dustVel[i * 3 + 2] = (seed(i, 10) - 0.5) * 0.05;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xe7b76a,
    size: 0.025,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: softDotTexture(),
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  root.add(dust);

  let quality = detail;

  return {
    root,
    update(t, dt, cameraPos) {
      glassMat.uniforms.uTime.value = t;
      // krople – lecą w górę i zawijają się
      const arr = dropGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < dropCount; i++) {
        arr[i * 3 + 1] += dt * dropSpeed[i] * 0.9;
        if (arr[i * 3 + 1] > 3.1) arr[i * 3 + 1] = 0.9;
      }
      dropGeo.attributes.position.needsUpdate = true;
      // kurz – powoli dryfuje, zawija się wokół gracza
      const dArr = dustGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < dustCount; i++) {
        dArr[i * 3] += dustVel[i * 3] * dt * 6 + Math.sin(t * 0.3 + i) * dt * 0.02;
        dArr[i * 3 + 1] += dustVel[i * 3 + 1] * dt * 6;
        dArr[i * 3 + 2] += dustVel[i * 3 + 2] * dt * 6;
        const dx = dArr[i * 3] - cameraPos.x;
        const dz = dArr[i * 3 + 2] - cameraPos.z;
        if (dx > 2.5) dArr[i * 3] -= 5;
        if (dx < -2.5) dArr[i * 3] += 5;
        if (dz > 2.5) dArr[i * 3 + 2] -= 5;
        if (dz < -2.5) dArr[i * 3 + 2] += 5;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dustMat.opacity = quality === 'low' ? 0.2 : 0.35;
    },
    setQuality(level) {
      quality = level;
      dust.visible = level !== 'low';
      drops.visible = true;
    },
    dispose() {
      dropGeo.dispose();
      dustGeo.dispose();
      glass.geometry.dispose();
      glassMat.dispose();
      dropMat.map?.dispose();
      dropMat.dispose();
      dustMat.map?.dispose();
      dustMat.dispose();
    },
  };
}
