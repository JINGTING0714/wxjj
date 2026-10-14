import { decoration } from '@/lib/poster-decoration';
export function PosterDecoration({
  id,
  color,
  outline = false,
}: {
  id: string;
  color: string;
  outline?: boolean;
}) {
  const value = decoration(id);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {value?.paths.map((path, index) => (
        <path
          key={index}
          d={path}
          fill={
            outline || ['arrow', 'wave', 'bracket', 'orbit'].includes(id)
              ? 'none'
              : color
          }
          stroke={color}
          strokeWidth={outline ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
