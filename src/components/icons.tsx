import type { ReactElement, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps, children: ReactElement | ReactElement[]): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) =>
  base(p, <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></>);

export const SettingsIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);

export const ExpandIcon = (p: IconProps) =>
  base(p, <><path d="M14 4h6v6" /><path d="M10 20H4v-6" /><path d="m20 4-7 7" /><path d="m4 20 7-7" /></>);

export const ArrowRightIcon = (p: IconProps) => base(p, <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);

export const RefreshIcon = (p: IconProps) =>
  base(p, <><path d="M20 11a8 8 0 0 0-14.9-3.5L3 10" /><path d="M3 4v6h6" /><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14" /><path d="M21 20v-6h-6" /></>);

export const UpIcon = (p: IconProps) => base(p, <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);

export const CommentIcon = (p: IconProps) =>
  base(p, <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" />);

export const CloseIcon = (p: IconProps) => base(p, <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>);

export const ShieldIcon = (p: IconProps) =>
  base(p, <><path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>);

export const StarIcon = (p: IconProps) =>
  base(p, <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" fill="currentColor" />);

export const AlertIcon = (p: IconProps) =>
  base(p, <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.2v.1" /></>);

export const InfoIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.8v.1" /></>);

export const EyeIcon = (p: IconProps) =>
  base(p, <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);

export const OfflineIcon = (p: IconProps) =>
  base(p, <><path d="M2 8.8a15 15 0 0 1 4-2.2" /><path d="M22 8.8a15 15 0 0 0-8.5-3.6" /><path d="M5 12.9a10 10 0 0 1 3.2-2" /><path d="M19 12.9a10 10 0 0 0-4.2-2.4" /><path d="M8.5 16.4a5 5 0 0 1 7 0" /><path d="M12 20h.01" /><path d="m3 3 18 18" /></>);

export const BookIcon = (p: IconProps) =>
  base(p, <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M8 7h8" /><path d="M8 11h6" /></>);

export const PlayIcon = (p: IconProps) => base(p, <path d="M7 4.5v15l12-7.5-12-7.5Z" />);

export const SparkleIcon = (p: IconProps) =>
  base(p, <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.3 6.3 2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" /></>);

export const LockIcon = (p: IconProps) =>
  base(p, <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);

export const TrashIcon = (p: IconProps) =>
  base(p, <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>);
