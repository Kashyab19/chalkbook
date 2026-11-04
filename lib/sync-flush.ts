// Posts stay strictly ordered: the next operation is not sent until the previous
// post has resolved. The local acknowledgement is independent of that next post,
// so it overlaps the network wait. Replaying an operation id is a no-op on the
// server, which is what makes that overlap safe if the acknowledgement fails.
export async function flushPending<
  T extends { pending: readonly { id: string }[] },
>(args: {
  snapshot: T;
  post: (operation: T['pending'][number]) => Promise<void>;
  acknowledge: (id: string) => Promise<T>;
  online: () => boolean;
  publish: (snapshot: T) => void;
}): Promise<{ snapshot: T; paused: boolean }> {
  let snapshot = args.snapshot;
  let prefetched: { id: string; done: Promise<void> } | null = null;
  const finishPrefetch = async () => {
    if (!prefetched) return;
    const done = prefetched.done;
    prefetched = null;
    await done;
  };
  while (snapshot.pending.length) {
    if (!args.online()) {
      await finishPrefetch();
      return { snapshot, paused: true };
    }
    const operation = snapshot.pending[0];
    if (prefetched?.id === operation.id) await finishPrefetch();
    else {
      await finishPrefetch();
      await args.post(operation);
    }
    const acknowledged = args.acknowledge(operation.id);
    const next = snapshot.pending[1];
    if (next && args.online()) {
      const done = args.post(next);
      void done.catch(() => {});
      prefetched = { id: next.id, done };
    }
    try {
      snapshot = await acknowledged;
    } catch (error) {
      void prefetched?.done.catch(() => {});
      prefetched = null;
      throw error;
    }
    args.publish(snapshot);
  }
  return { snapshot, paused: false };
}
