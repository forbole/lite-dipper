import { Buffer } from "buffer/";

// Ledger's HID framing uses Buffer during module evaluation, before a device
// is opened. Load this module before importing either Ledger dependency.
if (typeof globalThis.Buffer === "undefined") {
  Object.defineProperty(globalThis, "Buffer", {
    value: Buffer,
    writable: true,
    configurable: true
  });
}
