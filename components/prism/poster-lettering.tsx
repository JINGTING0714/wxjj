import { posterTextCss } from '@/lib/poster-typography';
import type { PosterText } from '@/lib/poster';

/** Paint the outline below the gradient so shadows cannot cover its fill. */
export function PosterLettering({
  text,
  ratio = 1,
  sample,
}: {
  text: PosterText;
  ratio?: number;
  sample?: string;
}) {
  const style = posterTextCss(text, ratio),
    gradient = ['gradient', 'extrude', 'double-outline', 'chrome'].includes(
      text.style,
    ),
    value = sample ?? text.text,
    width = text.size * ratio * (text.strokeWidth ?? 0.04);
  return (
    <span className="poster-lettering">
      {gradient && (
        <span
          aria-hidden="true"
          className="poster-lettering-underlay"
          style={{
            ...style,
            backgroundImage: 'none',
            WebkitTextFillColor: text.stroke,
            color: text.stroke,
            WebkitTextStroke:
              text.style === 'double-outline'
                ? `${width * 3}px ${text.stroke}`
                : style.WebkitTextStroke,
          }}
        >
          {value}
        </span>
      )}
      <span
        className="poster-lettering-face"
        style={{
          ...style,
          ...(gradient
            ? {
                textShadow: 'none',
                WebkitTextStroke:
                  text.style === 'double-outline'
                    ? `${width * 1.3}px ${text.color2}`
                    : style.WebkitTextStroke,
              }
            : {}),
        }}
      >
        {value}
      </span>
    </span>
  );
}
