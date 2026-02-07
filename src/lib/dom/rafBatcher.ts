export type RafBatcher = {
  schedule: () => void;
  cancel: () => void;
};

export const createRafBatcher = (flush: () => void): RafBatcher => {
  let rafId: number | null = null;
  return {
    schedule: () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        flush();
      });
    },
    cancel: () => {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    },
  };
};

