import * as THREE from 'three';

export class AssetLifecycle {
  private readonly _geometries: Map<string, THREE.BufferGeometry> = new Map();
  private readonly _materials: Map<string, THREE.Material> = new Map();
  private readonly _textures: Map<string, THREE.Texture> = new Map();

  public getOrCreateGeometry<T extends THREE.BufferGeometry>(
    key: string,
    factory: () => T
  ): T {
    const existing = this._geometries.get(key);
    if (existing) {
      return existing as T;
    }
    const created = factory();
    this._geometries.set(key, created);
    return created;
  }

  public getOrCreateMaterial<T extends THREE.Material>(
    key: string,
    factory: () => T
  ): T {
    const existing = this._materials.get(key);
    if (existing) {
      return existing as T;
    }
    const created = factory();
    this._materials.set(key, created);
    return created;
  }

  public getOrCreateTexture<T extends THREE.Texture>(
    key: string,
    factory: () => T
  ): T {
    const existing = this._textures.get(key);
    if (existing) {
      return existing as T;
    }
    const created = factory();
    this._textures.set(key, created);
    return created;
  }

  public disposeObject(root: THREE.Object3D, disposeMaterials: boolean = true): void {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }

        if (disposeMaterials && mesh.material) {
          if (Array.isArray(mesh.material)) {
            for (const mat of mesh.material) {
              this.disposeMaterial(mat);
            }
          } else {
            this.disposeMaterial(mesh.material);
          }
        }
      }
    });

    if (root.parent) {
      root.parent.remove(root);
    }
  }

  public disposeMaterial(material: THREE.Material): void {
    material.dispose();

    // Dispose textures attached to material uniforms/maps
    const matAny = material as any;
    const textureKeys = ['map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 'envMap', 'alphaMap', 'roughnessMap', 'metalnessMap'];
    for (const key of textureKeys) {
      if (matAny[key] && matAny[key].dispose) {
        matAny[key].dispose();
      }
    }
  }

  public clearAll(): void {
    for (const geom of this._geometries.values()) {
      geom.dispose();
    }
    this._geometries.clear();

    for (const mat of this._materials.values()) {
      this.disposeMaterial(mat);
    }
    this._materials.clear();

    for (const tex of this._textures.values()) {
      tex.dispose();
    }
    this._textures.clear();
  }

  public get stats() {
    return {
      cachedGeometries: this._geometries.size,
      cachedMaterials: this._materials.size,
      cachedTextures: this._textures.size
    };
  }
}
