export const SYNC_PAUSED_MESSAGE =
  'Sync paused. Your changes are saved on this device and will retry automatically.';

export function syncRequestError(_error: unknown) {
  return Error(SYNC_PAUSED_MESSAGE);
}
