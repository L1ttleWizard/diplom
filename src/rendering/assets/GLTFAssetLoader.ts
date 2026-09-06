import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLifecycle } from './AssetLifecycle';

export interface LoadedModelResult {
  root: THREE.Group;
  screenMesh: THREE.Mesh | null;
  interactiveObjects: Map<string, THREE.Object3D>;
  isFallback: boolean;
}

export class GLTFAssetLoader {
  private readonly _loader: GLTFLoader;
  private readonly _assets: AssetLifecycle;
  private readonly _modelCache: Map<string, LoadedModelResult> = new Map();

  constructor(assets?: AssetLifecycle) {
    this._loader = new GLTFLoader();
    this._assets = assets ?? new AssetLifecycle();
  }

  public async loadModel(
    url: string,
    fallbackFactory?: () => LoadedModelResult
  ): Promise<LoadedModelResult> {
    const cached = this._modelCache.get(url);
    if (cached) {
      return cached;
    }

    try {
      const gltf = await this.loadAsync(url);
      const interactiveObjects = new Map<string, THREE.Object3D>();
      let screenMesh: THREE.Mesh | null = null;

      gltf.scene.traverse((obj) => {
        if (obj.name) {
          interactiveObjects.set(obj.name, obj);
          if (obj.name.includes('screen') && (obj as THREE.Mesh).isMesh) {
            screenMesh = obj as THREE.Mesh;
          }
        }
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      const result: LoadedModelResult = {
        root: gltf.scene,
        screenMesh,
        interactiveObjects,
        isFallback: false
      };

      this._modelCache.set(url, result);
      return result;
    } catch (err) {
      console.warn(`[GLTFAssetLoader] Failed to load model from "${url}":`, err);

      if (fallbackFactory) {
        console.info('[GLTFAssetLoader] Using fallback procedural model.');
        const fallback = fallbackFactory();
        this._modelCache.set(url, fallback);
        return fallback;
      }

      throw err;
    }
  }

  private loadAsync(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this._loader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (error) => reject(error)
      );
    });
  }

  public clearCache(): void {
    this._modelCache.clear();
  }
}
