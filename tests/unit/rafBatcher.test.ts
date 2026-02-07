import { afterEach, describe, expect, it, vi } from "vitest";

import { createRafBatcher } from "@/lib/dom/rafBatcher";

describe("createRafBatcher", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  it("flushes at most once per animation frame", () => {
    const flush = vi.fn();
    let queued: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      queued = cb;
      return 1;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    const batcher = createRafBatcher(flush);
    batcher.schedule();
    batcher.schedule();
    batcher.schedule();

    expect(flush).not.toHaveBeenCalled();
    queued?.(0);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancels a scheduled flush", () => {
    const flush = vi.fn();
    globalThis.requestAnimationFrame = vi.fn(() => 123);
    globalThis.cancelAnimationFrame = vi.fn();

    const batcher = createRafBatcher(flush);
    batcher.schedule();
    batcher.cancel();

    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(123);
  });
});

