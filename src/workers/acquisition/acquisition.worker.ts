import { AcquisitionWorkerCore } from './AcquisitionWorkerCore';

const core = new AcquisitionWorkerCore();

self.onmessage = (event: MessageEvent) => {
  core.handleMessage(event.data, (msg, transfer) => {
    if (transfer && transfer.length > 0) {
      // Transferable objects: zero-copy pointer transfer
      (self as unknown as Worker).postMessage(msg, transfer);
    } else {
      (self as unknown as Worker).postMessage(msg);
    }
  });
};
