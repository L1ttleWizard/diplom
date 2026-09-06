/**
 * Deterministic 32-bit Pseudo-Random Number Generator (Mulberry32).
 * Provides bit-exact reproducible sequences across runs and platforms.
 */
export class DeterministicRandom {
  private readonly _initialSeed: number;
  private _state: number;

  constructor(seed: number = 1337) {
    this._initialSeed = seed >>> 0;
    this._state = this._initialSeed;
  }

  public get seed(): number {
    return this._initialSeed;
  }

  /**
   * Generates next float in range [0, 1)
   */
  public next(): number {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates next float uniformly distributed in [min, max)
   */
  public nextUniform(min: number = -1.0, max: number = 1.0): number {
    return min + this.next() * (max - min);
  }

  /**
   * Generates next standard Gaussian random variable using Box-Muller transform: N(mean, stdDev^2)
   */
  public nextGaussian(mean: number = 0.0, stdDev: number = 1.0): number {
    let u1 = 0;
    let u2 = 0;
    // Avoid log(0)
    while (u1 === 0) u1 = this.next();
    while (u2 === 0) u2 = this.next();

    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Resets PRNG to initial or newly specified seed
   */
  public reset(seed?: number): void {
    this._state = (seed !== undefined ? seed : this._initialSeed) >>> 0;
  }
}
