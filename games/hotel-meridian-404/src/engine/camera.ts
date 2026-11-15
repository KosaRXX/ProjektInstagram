import * as THREE from 'three';
import type { Collider } from './room';

/** Ograniczenia pokoju i kolizje z meblami (prostokąty na podłodze + promień gracza). */
export const ROOM_BOUNDS = { minX: -2.55, maxX: 2.55, minZ: -2.55, maxZ: 2.55 };
const PLAYER_RADIUS = 0.3;
export const EYE_HEIGHT = 1.55;

export interface MoveInput {
  /** Wejście: x w prawo, y do przodu (−1…1). Klawiatura i joystick. */
  x: number;
  y: number;
}

/**
 * Kontroler pierwszej osoby: obrót (yaw/pitch), ruch po podłodze z kolizjami.
 * Nie wie nic o grze – tylko porusza kamerą.
 */
export class FirstPersonController {
  readonly position = new THREE.Vector3(0, EYE_HEIGHT, 2.1);
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  speed = 1.7;
  enabled = true;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly colliders: Collider[]) {
    this.apply();
  }

  look(dx: number, dy: number): void {
    const k = 0.0022 * this.sensitivity;
    this.yaw -= dx * k;
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - dy * k));
    this.apply();
  }

  /** Porusza się w kierunku patrzenia; kolizje są sprawdzane osobno dla każdej osi (ślizganie się po ścianach). */
  move(input: MoveInput, dt: number): void {
    if (!this.enabled) return;
    const mag = Math.hypot(input.x, input.y);
    if (mag < 0.01) return;
    const scale = Math.min(1, mag) / mag;
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const dx = (rightX * input.x + fwdX * input.y) * scale * this.speed * dt;
    const dz = (rightZ * input.x + fwdZ * input.y) * scale * this.speed * dt;
    this.tryMove(dx, 0);
    this.tryMove(0, dz);
  }

  private blocked(x: number, z: number): boolean {
    if (x < ROOM_BOUNDS.minX || x > ROOM_BOUNDS.maxX || z < ROOM_BOUNDS.minZ || z > ROOM_BOUNDS.maxZ) return true;
    return this.colliders.some(
      (c) => x > c.minX - PLAYER_RADIUS && x < c.maxX + PLAYER_RADIUS && z > c.minZ - PLAYER_RADIUS && z < c.maxZ + PLAYER_RADIUS,
    );
  }

  private tryMove(dx: number, dz: number): void {
    const nx = this.position.x + dx;
    const nz = this.position.z + dz;
    if (!this.blocked(nx, nz)) {
      this.position.x = nx;
      this.position.z = nz;
      this.apply();
    }
  }

  /** Ustawia pozycję i kierunek (np. po zakończeniu widoku szczegółowego). */
  setPose(pos: THREE.Vector3, yaw: number, pitch: number): void {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = pitch;
    this.apply();
  }

  /** Kierunek patrzenia (dla punktu w świecie): używany po przejściu widoku szczegółowego. */
  lookAtPoint(target: THREE.Vector3): void {
    const dx = target.x - this.position.x;
    const dy = target.y - this.position.y;
    const dz = target.z - this.position.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.apply();
  }

  private apply(): void {
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.position.copy(this.position);
  }
}

/** Płynne przejście kamery (ease-in-out), czas w sekundach. */
export interface CameraTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromLook: THREE.Vector3;
  toLook: THREE.Vector3;
  duration: number;
  elapsed: number;
  onDone?: () => void;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function stepTween(tw: CameraTween, camera: THREE.PerspectiveCamera, dt: number): boolean {
  tw.elapsed = Math.min(tw.duration, tw.elapsed + dt);
  const k = easeInOut(tw.elapsed / tw.duration);
  camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
  const look = new THREE.Vector3().lerpVectors(tw.fromLook, tw.toLook, k);
  camera.lookAt(look);
  return tw.elapsed >= tw.duration;
}
