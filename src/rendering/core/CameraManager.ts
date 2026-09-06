import * as THREE from 'three';

export interface CameraConfig {
  fov?: number;
  near?: number;
  far?: number;
  aspect?: number;
  initialRadius?: number;
  initialTheta?: number;
  initialPhi?: number;
  target?: THREE.Vector3;
}

export class CameraManager {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly target: THREE.Vector3;

  private readonly _defaultTarget: THREE.Vector3;
  private readonly _defaultRadius: number;
  private readonly _defaultTheta: number;
  private readonly _defaultPhi: number;

  private _radius: number;
  private _theta: number; // Azimuthal angle in radians
  private _phi: number;   // Polar angle in radians

  public minDistance: number = 0.3;
  public maxDistance: number = 10.0;
  public minPolarAngle: number = 0.05; // avoid pole singularity
  public maxPolarAngle: number = Math.PI / 2 - 0.02; // stay above table ground

  // Scratch vectors to prevent per-frame allocations
  private readonly _scratchOffset: THREE.Vector3 = new THREE.Vector3();
  private readonly _scratchRight: THREE.Vector3 = new THREE.Vector3();
  private readonly _scratchUp: THREE.Vector3 = new THREE.Vector3();

  constructor(config: CameraConfig = {}) {
    const fov = config.fov ?? 45;
    const near = config.near ?? 0.1;
    const far = config.far ?? 100;
    const aspect = config.aspect ?? 16 / 9;

    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    this._defaultTarget = (config.target ?? new THREE.Vector3(0, 0.22, 0)).clone();
    this.target = this._defaultTarget.clone();

    this._defaultRadius = config.initialRadius ?? 1.2;
    this._defaultTheta = config.initialTheta ?? 0.25; // slightly angled view
    this._defaultPhi = config.initialPhi ?? 1.15;      // ~65 degrees elevation

    this._radius = this._defaultRadius;
    this._theta = this._defaultTheta;
    this._phi = this._defaultPhi;

    this.update();
  }

  public get radius(): number {
    return this._radius;
  }

  public get theta(): number {
    return this._theta;
  }

  public get phi(): number {
    return this._phi;
  }

  public orbit(deltaTheta: number, deltaPhi: number): void {
    this._theta += deltaTheta;
    this._phi += deltaPhi;

    // Clamp polar angle
    this._phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._phi));
    this.update();
  }

  public zoom(deltaDistance: number): void {
    this._radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this._radius + deltaDistance)
    );
    this.update();
  }

  public pan(deltaX: number, deltaY: number): void {
    // Compute camera right and up directions
    this._scratchRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this._scratchUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

    this._scratchRight.multiplyScalar(-deltaX * this._radius * 0.5);
    this._scratchUp.multiplyScalar(deltaY * this._radius * 0.5);

    this.target.add(this._scratchRight).add(this._scratchUp);
    this.update();
  }

  public reset(): void {
    this.target.copy(this._defaultTarget);
    this._radius = this._defaultRadius;
    this._theta = this._defaultTheta;
    this._phi = this._defaultPhi;
    this.update();
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public update(): void {
    // Spherical to Cartesian relative to target
    const sinPhiRadius = Math.sin(this._phi) * this._radius;
    this._scratchOffset.set(
      sinPhiRadius * Math.sin(this._theta),
      Math.cos(this._phi) * this._radius,
      sinPhiRadius * Math.cos(this._theta)
    );

    this.camera.position.copy(this.target).add(this._scratchOffset);
    this.camera.lookAt(this.target);
  }
}
