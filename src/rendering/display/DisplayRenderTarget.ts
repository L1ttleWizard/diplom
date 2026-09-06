import * as THREE from 'three';

export interface RenderTargetOptions {
  width?: number;
  height?: number;
  dpr?: number;
}

export class DisplayRenderTarget {
  private _width: number;
  private _height: number;
  private _dpr: number;

  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly texture: THREE.CanvasTexture;

  private _isDirty: boolean = true;

  constructor(options: RenderTargetOptions = {}) {
    this._width = options.width ?? 1024;
    this._height = options.height ?? 640;
    this._dpr = options.dpr ?? 1.0;

    const physicalW = Math.round(this._width * this._dpr);
    const physicalH = Math.round(this._height * this._dpr);

    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = physicalW;
      this.canvas.height = physicalH;
      this.ctx = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    } else {
      // Dummy canvas mock for headless testing
      this.canvas = { width: physicalW, height: physicalH } as any;
      this.ctx = {} as any;
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  public get width(): number {
    return this._width;
  }

  public get height(): number {
    return this._height;
  }

  public get dpr(): number {
    return this._dpr;
  }

  public get physicalWidth(): number {
    return Math.round(this._width * this._dpr);
  }

  public get physicalHeight(): number {
    return Math.round(this._height * this._dpr);
  }

  public resize(width: number, height: number, dpr?: number): void {
    const newDpr = dpr ?? this._dpr;
    if (this._width === width && this._height === height && this._dpr === newDpr) {
      return;
    }

    this._width = width;
    this._height = height;
    this._dpr = newDpr;

    const physicalW = Math.round(width * newDpr);
    const physicalH = Math.round(height * newDpr);

    this.canvas.width = physicalW;
    this.canvas.height = physicalH;
    this.markDirty();
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
