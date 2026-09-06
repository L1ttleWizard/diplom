import * as THREE from 'three';

export interface RenderTargetOptions {
  width?: number;
  height?: number;
}

export class DisplayRenderTarget {
  public readonly width: number;
  public readonly height: number;
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly texture: THREE.CanvasTexture;

  private _isDirty: boolean = true;

  constructor(options: RenderTargetOptions = {}) {
    this.width = options.width ?? 1024;
    this.height = options.height ?? 640;

    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    } else {
      // Dummy canvas mock for headless testing
      this.canvas = { width: this.width, height: this.height } as any;
      this.ctx = {} as any;
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  public attachToScreenMesh(mesh: THREE.Mesh): void {
    if (!mesh.material) return;

    if (Array.isArray(mesh.material)) {
      for (const mat of mesh.material) {
        this.applyTextureToMaterial(mat as THREE.MeshStandardMaterial);
      }
    } else {
      this.applyTextureToMaterial(mesh.material as THREE.MeshStandardMaterial);
    }
  }

  private applyTextureToMaterial(material: THREE.MeshStandardMaterial): void {
    material.map = this.texture;
    material.emissiveMap = this.texture;
    material.emissive = new THREE.Color('#ffffff');
    material.emissiveIntensity = 0.95; // glowing LCD backlight
    material.roughness = 0.15;
    material.metalness = 0.05;
    material.needsUpdate = true;
  }

  public markDirty(): void {
    this._isDirty = true;
  }

  public updateTexture(): void {
    if (this._isDirty) {
      this.texture.needsUpdate = true;
      this._isDirty = false;
    }
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
