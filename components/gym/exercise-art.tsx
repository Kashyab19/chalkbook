import { exerciseArtPath } from '@/lib/exercise-art';

export function ExerciseArt({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  const src = exerciseArtPath(name) ?? '/brand/logo.webp';

  return (
    <span aria-hidden="true" className={`exercise-art ${className}`}>
      {/* Static local art is already compressed and has explicit dimensions. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width="160" height="160" loading="lazy" />
    </span>
  );
}
