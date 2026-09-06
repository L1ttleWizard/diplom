/**
 * Rendering Layer (Wave 2+)
 *
 * This layer is responsible for Three.js scene management, GPU shaders,
 * and rendering adapters. It depends on Domain/Application interfaces,
 * but Domain NEVER depends on or imports this layer.
 */

export interface IOscilloscopeRendererAdapter {
  initialize(canvas: unknown): Promise<void>;
  renderFrame(): void;
  destroy(): void;
}
