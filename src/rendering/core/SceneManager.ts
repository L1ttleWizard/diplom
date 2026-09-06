import * as THREE from 'three';
import { ISceneHierarchy } from '../types';

export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly hierarchy: ISceneHierarchy;

  private _keyLight: THREE.DirectionalLight;
  private _fillLight: THREE.DirectionalLight;
  private _ambientLight: THREE.AmbientLight;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#14171d');

    // Build standardized scene hierarchy
    const root = new THREE.Group();
    root.name = 'lab_root';

    const environmentGroup = new THREE.Group();
    environmentGroup.name = 'environment_group';

    const lightingGroup = new THREE.Group();
    lightingGroup.name = 'lighting_group';

    const oscilloscopeGroup = new THREE.Group();
    oscilloscopeGroup.name = 'oscilloscope_group';

    const generatorGroup = new THREE.Group();
    generatorGroup.name = 'generator_group';

    const circuitGroup = new THREE.Group();
    circuitGroup.name = 'circuit_group';

    root.add(environmentGroup);
    root.add(lightingGroup);
    root.add(oscilloscopeGroup);
    root.add(generatorGroup);
    root.add(circuitGroup);

    this.scene.add(root);

    this.hierarchy = {
      root,
      environmentGroup,
      lightingGroup,
      oscilloscopeGroup,
      generatorGroup,
      circuitGroup
    };

    // Setup three-point laboratory lighting
    this._ambientLight = new THREE.AmbientLight('#d8e0eb', 0.85);
    this._ambientLight.name = 'light_ambient';
    lightingGroup.add(this._ambientLight);

    this._keyLight = new THREE.DirectionalLight('#ffffff', 1.8);
    this._keyLight.name = 'light_key';
    this._keyLight.position.set(2.5, 3.5, 2.0);
    this._keyLight.castShadow = true;
    this._keyLight.shadow.mapSize.width = 2048;
    this._keyLight.shadow.mapSize.height = 2048;
    this._keyLight.shadow.bias = -0.0001;
    this._keyLight.shadow.camera.near = 0.5;
    this._keyLight.shadow.camera.far = 10;
    this._keyLight.shadow.camera.left = -2;
    this._keyLight.shadow.camera.right = 2;
    this._keyLight.shadow.camera.top = 2;
    this._keyLight.shadow.camera.bottom = -2;
    lightingGroup.add(this._keyLight);

    this._fillLight = new THREE.DirectionalLight('#9bc4e2', 0.8);
    this._fillLight.name = 'light_fill';
    this._fillLight.position.set(-2.5, 2.0, -1.0);
    lightingGroup.add(this._fillLight);
  }

  public setShadows(enabled: boolean): void {
    this._keyLight.castShadow = enabled;
  }
}
