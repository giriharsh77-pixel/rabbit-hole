import { useId } from 'react';

/** The Rabbit Hole mark: a tunnel of concentric rings falling away from the viewer. */
export function Logo({ size = 30 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Rabbit Hole">
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff8a4c" />
          <stop offset="1" stopColor="#e0400d" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${id}-g)`} />
      <g fill="none" stroke="#0b0b0d" strokeLinecap="round">
        <ellipse cx="16" cy="16.5" rx="10" ry="6.6" strokeWidth="1.7" opacity="0.28" />
        <ellipse cx="16" cy="17.2" rx="6.6" ry="4.3" strokeWidth="1.8" opacity="0.55" />
        <ellipse cx="16" cy="18" rx="3.2" ry="2" strokeWidth="2" opacity="0.9" fill="#0b0b0d" />
      </g>
      <ellipse cx="11.2" cy="10" rx="3.6" ry="1.4" fill="#fff" opacity="0.28" transform="rotate(-18 11.2 10)" />
    </svg>
  );
}
