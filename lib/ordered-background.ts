// Runs tasks one after another without making the caller wait. A rejection is
// swallowed so a later task still runs, matching the recovery-cache rule that a
// failed mirror never fails the IndexedDB save.
export function createOrderedBackground() {
  let chain: Promise<void> = Promise.resolve();
  return {
    enqueue(task: () => Promise<void>) {
      chain = chain.then(task).catch(() => {});
    },
    drain() {
      return chain;
    },
  };
}
