import * as THREE from 'three';

export interface DisplayPoint2D {
  x: number; // Pixels [0, width]
  y: number; // Pixels [0, height]
}

export interface NormalizedUV {
  u: number; // [0, 1]
  v: number; // [0, 1]
}

export class DisplayCoordinates {
  public readonly displayWidth: number;
  public readonly displayHeight: number;
  public readonly meshWidth: number;
  public readonly meshHeight: number;

  // Reusable scratch vectors and matrices to prevent garbage in transform routines
  private readonly _scratchLocal: THREE.Vector3 = new THREE.Vector3();
  private readonly _scratchWorld: THREE.Vector3 = new THREE.Vector3();
  private readonly _inverseWorldMatrix: THREE.Matrix4 = new THREE.Matrix4();

  constructor(
    displayWidth: number = 1024,
    displayHeight: number = 640,
    meshWidth: number = 0.17,
    meshHeight: number = 0.105
  ) {
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.meshWidth = meshWidth;
    this.meshHeight = meshHeight;
  }

  /**
   * Convert 2D display pixel coordinates (top-left origin) to Normalized UV [0, 1]
   */
  public displayToUV(displayPt: DisplayPoint2D): NormalizedUV {
    return {
      u: Math.max(0, Math.min(1, displayPt.x / this.displayWidth)),
      v: Math.max(0, Math.min(1, 1.0 - displayPt.y / this.displayHeight))
    };
  }

  /**
   * Convert Normalized UV [0, 1] to 2D display pixel coordinates
   */
  public uvToDisplay(uv: NormalizedUV): DisplayPoint2D {
    return {
      x: uv.u * this.displayWidth,
      y: (1.0 - uv.v) * this.displayHeight
    };
  }

  /**
   * Convert 2D display pixel coordinates to 3D screen-local coordinates on the mesh plane
   */
  public displayToScreenLocal(displayPt: DisplayPoint2D, target?: THREE.Vector3): THREE.Vector3 {
    const uv = this.displayToUV(displayPt);
    const out = target ?? new THREE.Vector3();
    out.set(
      (uv.u - 0.5) * this.meshWidth,
      (uv.v - 0.5) * this.meshHeight,
      0
    );
    return out;
  }

  /**
   * Convert 3D screen-local coordinates to 2D display pixel coordinates
   */
  public screenLocalToDisplay(localPt: THREE.Vector3): DisplayPoint2D {
    const u = localPt.x / this.meshWidth + 0.5;
    const v = localPt.y / this.meshHeight + 0.5;
    return this.uvToDisplay({ u, v });
  }

  /**
   * Convert 2D display pixel coordinates to global 3D Three.js world coordinates
   */
  public displayToWorld(
    displayPt: DisplayPoint2D,
    screenMesh: THREE.Object3D,
    target?: THREE.Vector3
  ): THREE.Vector3 {
    const local = this.displayToScreenLocal(displayPt, this._scratchLocal);
    screenMesh.updateWorldMatrix(true, false);
    const out = target ?? new THREE.Vector3();
    out.copy(local).applyMatrix4(screenMesh.matrixWorld);
    return out;
  }

  /**
   * Convert global 3D Three.js world coordinates to 2D display pixel coordinates
   */
  public worldToDisplay(
    worldPt: THREE.Vector3,
    screenMesh: THREE.Object3D
  ): DisplayPoint2D {
    screenMesh.updateWorldMatrix(true, false);
    this._inverseWorldMatrix.copy(screenMesh.matrixWorld).invert();
    this._scratchLocal.copy(worldPt).applyMatrix4(this._inverseWorldMatrix);
    return this.screenLocalToDisplay(this._scratchLocal);
  }
}
