import * as THREE from 'three';
import { clockFaceTexture, labelTexture, rugTexture } from './textures';
import { PALETTE } from './palette';

/**
 * Sceny zakończeń (filmowe przejścia kamery w Three.js).
 *  – escape: ulica za drzwiami, zegar na wieży wskazuje 23:47
 *  – truth: kamera wchodzi w lustro (używa pokoju)
 *  – loop: postać na łóżku – ten sam człowiek co gracz
 */

export interface CinemaPath {
  positions: THREE.Vector3[];
  looks: THREE.Vector3[];
  duration: number;
}

export function buildStreetScene(): { scene: THREE.Scene; path: CinemaPath } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.navy);
  scene.fog = new THREE.FogExp2(PALETTE.navy, 0.035);
  const ambient = new THREE.HemisphereLight(PALETTE.steel, PALETTE.graphite, 0.5);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(PALETTE.steel, 0.9);
  moon.position.set(-5, 10, 4);
  scene.add(moon);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.35, metalness: 0.2 }));
  road.rotation.x = -Math.PI / 2;
  scene.add(road);

  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const h = 6 + ((i * 37) % 11);
    const b = new THREE.Mesh(new THREE.BoxGeometry(3 + (i % 3), h, 4), buildingMat);
    b.position.set(-12 + i * 2.2 + (i % 2) * 0.5, h / 2, -14 - (i % 3) * 2);
    scene.add(b);
    // okna z ciepłym światłem
    for (let k = 0; k < 6; k++) {
      if ((i + k) % 3 === 0) continue;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
      win.position.set(b.position.x - 1 + (k % 3), 1.5 + Math.floor(k / 3) * 2.5 + (i % 2), b.position.z + 2.01);
      scene.add(win);
    }
  }

  // Wieża z zegarem – 23:47
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 16, 3), buildingMat);
  tower.position.set(0, 8, -22);
  scene.add(tower);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ map: clockFaceTexture() }));
  face.position.set(0, 13, -20.45);
  face.rotation.y = Math.PI;
  scene.add(face);
  const hourH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.04), new THREE.MeshBasicMaterial({ color: 0x17191d }));
  hourH.position.set(0, 13.15, -20.44);
  hourH.rotation.z = -((11 + 47 / 60) * Math.PI) / 6;
  scene.add(hourH);
  const minH = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.04), new THREE.MeshBasicMaterial({ color: 0x17191d }));
  minH.position.set(0, 13.2, -20.44);
  minH.rotation.z = -((47 / 60) * Math.PI * 2);
  scene.add(minH);

  // Latarnie
  for (let i = -2; i <= 2; i++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 8), buildingMat);
    pole.position.set(i * 5, 2, -6);
    scene.add(pole);
    const light = new THREE.PointLight(PALETTE.amber, 9, 12, 2);
    light.position.set(i * 5, 4.2, -6);
    scene.add(light);
  }

  // Deszcz (cząsteczki)
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 30;
    pos[i * 3 + 1] = Math.random() * 14;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 4;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbcd3e0, size: 0.03, transparent: true, opacity: 0.6 }));
  rain.name = 'rain';
  scene.add(rain);

  const path: CinemaPath = {
    positions: [new THREE.Vector3(-0.2, 1.55, 2.5), new THREE.Vector3(0, 1.6, 2.8), new THREE.Vector3(0, 1.6, 1.0), new THREE.Vector3(0, 1.6, -4)],
    looks: [new THREE.Vector3(0, 1.4, -3), new THREE.Vector3(0, 2.2, -10), new THREE.Vector3(0, 9, -22), new THREE.Vector3(0, 12.5, -22)],
    duration: 12,
  };
  return { scene, path };
}

/** Postać na łóżku w pokoju 404 – „ktoś, kto wygląda dokładnie jak gracz”. */
export function buildSleeper(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sleeper';
  const suit = new THREE.MeshStandardMaterial({ color: 0x1a2330, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9b89a, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 6, 12), suit);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.62, 0);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin);
  head.position.set(0.75, 0.68, 0);
  head.castShadow = true;
  g.add(head);
  g.position.set(2.0, 0, 1.75);
  return g;
}

/** Tabliczka informacyjna dla zakończenia C (napis na podłodze/ścianie w pokoju). */
export function captionPlane(text: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: labelTexture([text], { w: 1024, h: 256, size: 48 }), transparent: true }));
}

export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mm) => mm.dispose());
  });
}

export { rugTexture };
