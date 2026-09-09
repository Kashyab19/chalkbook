'use client';
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { draftValue } from '@/lib/notebook-store';
// Unapplied program edits are drafts, distinct from the program used to generate
// sessions. Persist them too, so closing the app does not discard ongoing typing.
export function useDeviceDraft<T>(
  key: string,
  initial: T,
): [T, (value: SetStateAction<T>) => void] {
  const [value, setValue] = useState(initial);
  const current = useRef(value),
    edited = useRef(false);
  useEffect(() => {
    let live = true;
    void draftValue<T>(key)
      .then((stored) => {
        if (live && !edited.current && stored !== undefined) {
          current.current = stored;
          setValue(stored);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  return [
    value,
    (next) => {
      edited.current = true;
      current.current =
        typeof next === 'function'
          ? (next as (value: T) => T)(current.current)
          : next;
      setValue(current.current);
      void draftValue(key, { value: current.current }).catch(() =>
        window.dispatchEvent(
          new CustomEvent('gym-storage-error', {
            detail:
              'An unfinished edit could not be saved on this device. Keep the app open and retry.',
          }),
        ),
      );
    },
  ];
}
