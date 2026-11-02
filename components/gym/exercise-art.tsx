import { useState } from 'react';
import { exerciseArtPath } from '@/lib/exercise-art';

export function ExerciseArt({
  name,
  className = '',
  priority = 'low',
}: {
  name: string;
  className?: string;
  priority?: 'high' | 'low' | 'auto';
}) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? (exerciseArtPath(name) ?? '/brand/repwise-mark.png') : '/brand/repwise-mark.png';
  const eager = priority === 'high';

  return (
    <span aria-hidden="true" className={`exercise-art ${className}`}>
      {/* Static local art is already compressed and has explicit dimensions. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width="160"
        height="160"
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={priority}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
