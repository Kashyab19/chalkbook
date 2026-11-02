'use client';
import { useEffect, useRef } from 'react';
import { currentArtPrefetchAllowed } from '@/lib/sync-schedule';

type Props = {
  onUpdateReady?: (apply: (() => void) | null) => void;
  onOfflineReady?: (ready: boolean) => void;
  onMessage?: (message: string) => void;
};

export function OfflineRuntime({
  onUpdateReady,
  onOfflineReady,
  onMessage,
}: Props) {
  const onUpdateReadyRef = useRef(onUpdateReady);
  const onOfflineReadyRef = useRef(onOfflineReady);
  const onMessageRef = useRef(onMessage);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadAfterUpdate = useRef(false);
  useEffect(() => {
    onUpdateReadyRef.current = onUpdateReady;
    onOfflineReadyRef.current = onOfflineReady;
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const keyboard = !!viewport && window.innerHeight - viewport.height > 150;
      document.documentElement.style.setProperty(
        '--keyboard-offset',
        keyboard
          ? `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`
          : '0px',
      );
      if (keyboard && document.activeElement instanceof HTMLInputElement)
        requestAnimationFrame(() =>
          document.activeElement?.scrollIntoView({
            block: 'center',
            behavior: 'auto',
          }),
        );
    };
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production')
      return;
    let disposed = false;
    const applyUpdate = () => {
      if (!registration.current?.waiting) return;
      reloadAfterUpdate.current = true;
      registration.current.waiting.postMessage({ type: 'skip-waiting' });
    };
    const shellIsCached = async () => {
      if (!('caches' in window)) return false;
      const keys = await caches.keys();
      const shell = keys.find((key) => key.startsWith('gym-shell-'));
      return (
        !!shell &&
        !!(await caches.open(shell)).match(new URL('/', location.href).toString())
      );
    };
    const warmCache = () => {
      navigator.serviceWorker.controller?.postMessage({
        type: 'warm-cache',
        includeArt: currentArtPrefetchAllowed(),
      });
    };
    const controllerChanged = () => {
      onUpdateReadyRef.current?.(null);
      // Reload only after the person explicitly chose Update. Background
      // service-worker activity must never interrupt a workout.
      if (reloadAfterUpdate.current) location.reload();
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      controllerChanged,
    );
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((nextRegistration) => {
        if (disposed) return;
        registration.current = nextRegistration;
        const inspect = async () => {
          if (disposed) return;
          // An active worker alone is not enough: a failed install can leave
          // a worker present without a complete shell for the next offline
          // launch. Only promise offline use after the root shell is cached.
          const ready =
            !!navigator.serviceWorker.controller && (await shellIsCached());
          onOfflineReadyRef.current?.(ready);
          if (ready) warmCache();
          const waiting = !!nextRegistration.waiting;
          onUpdateReadyRef.current?.(waiting ? applyUpdate : null);
        };
        void inspect();
        nextRegistration.addEventListener('updatefound', () =>
          nextRegistration.installing?.addEventListener('statechange', () =>
            void inspect(),
          ),
        );
        void navigator.serviceWorker.ready.then(() => void inspect());
        void nextRegistration.update().catch(() => {});
      })
      .catch(() =>
        onMessageRef.current?.(
          'Offline setup has not finished. Reconnect and reopen before training offline.',
        ),
      );
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        controllerChanged,
      );
      onUpdateReadyRef.current?.(null);
    };
  }, []);
  return null;
}
