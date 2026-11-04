// First paint only needs the IndexedDB snapshot. The recovery cache is consulted
// when that snapshot is empty, so the two reads start together.
export async function assembleStartupSnapshot<T extends { data: unknown }>(deps: {
  readDatabase: () => Promise<T>;
  readRecovery: () => Promise<T | null>;
  writeIfEmpty: (candidate: T) => Promise<{ snapshot: T; used: boolean }>;
  mirror?: (snapshot: T) => void;
}): Promise<{ recovered: boolean; snapshot: T }> {
  const recovery = deps.readRecovery().then(
    (value) => value,
    () => null,
  );
  let snapshot: T;
  try {
    snapshot = await deps.readDatabase();
  } catch (error) {
    void recovery.then(
      () => {},
      () => {},
    );
    throw error;
  }
  if (snapshot.data) {
    void recovery.then(
      () => {},
      () => {},
    );
    deps.mirror?.(snapshot);
    return { recovered: false, snapshot };
  }
  const candidate = await recovery;
  if (!candidate?.data) return { recovered: false, snapshot };
  const written = await deps.writeIfEmpty(candidate);
  return { recovered: written.used, snapshot: written.snapshot };
}
