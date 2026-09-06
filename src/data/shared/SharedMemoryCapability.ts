import { SharedMemoryCapabilityReport } from './types';

/**
 * SharedMemoryCapability
 *
 * Runtime detector evaluating whether SharedArrayBuffer and Atomics are available
 * and securely permitted in the current JavaScript execution environment.
 */
export class SharedMemoryCapability {
  private static _cachedReport: SharedMemoryCapabilityReport | null = null;

  /**
   * Evaluates the current environment and returns a comprehensive report.
   * Caches the result after first evaluation unless forceRefresh is true.
   */
  public static check(forceRefresh: boolean = false): SharedMemoryCapabilityReport {
    if (this._cachedReport && !forceRefresh) {
      return this._cachedReport;
    }

    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    const hasAtomics = typeof Atomics !== 'undefined';

    // In browsers, window.crossOriginIsolated / self.crossOriginIsolated indicates COOP/COEP headers.
    // In Node.js / Vitest environments, crossOriginIsolated is typically undefined, but SAB is natively enabled.
    let isIsolated = false;
    if (typeof globalThis !== 'undefined' && 'crossOriginIsolated' in globalThis) {
      isIsolated = Boolean((globalThis as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated);
    } else if (typeof window === 'undefined') {
      // Server-side / Node.js test environment has no cross-origin restrictions
      isIsolated = true;
    }

    let canAllocate = false;
    let failureReason = '';

    if (!hasSAB) {
      failureReason = 'SharedArrayBuffer is not defined in this runtime environment';
    } else if (!hasAtomics) {
      failureReason = 'Atomics API is not available';
    } else if (!isIsolated) {
      failureReason =
        'Environment is not cross-origin isolated. Missing Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp HTTP headers.';
    } else {
      try {
        const testBuf = new SharedArrayBuffer(16);
        const testArr = new Int32Array(testBuf);
        Atomics.store(testArr, 0, 42);
        if (Atomics.load(testArr, 0) === 42) {
          canAllocate = true;
        } else {
          failureReason = 'Atomics store/load verification failed on test SharedArrayBuffer';
        }
      } catch (err) {
        failureReason = `SharedArrayBuffer allocation blocked: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const isSupported = hasSAB && hasAtomics && isIsolated && canAllocate;
    const reason = isSupported
      ? 'SharedArrayBuffer and Atomics are fully supported and cross-origin isolated'
      : failureReason;

    this._cachedReport = {
      isSupported,
      crossOriginIsolated: isIsolated,
      hasAtomics,
      canAllocateSAB: canAllocate,
      reason
    };

    return this._cachedReport;
  }

  /**
   * Convenience boolean check.
   */
  public static isSupported(): boolean {
    return this.check().isSupported;
  }

  /**
   * Resets cached detection for testing purposes.
   */
  public static resetCache(): void {
    this._cachedReport = null;
  }
}
