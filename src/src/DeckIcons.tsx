type IconProps = {
  size?: number;
  className?: string;
};

export function IconDashboard({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 4.5h6.5v6.5H4z" />
      <path d="M13.5 4.5H20v6.5h-6.5z" />
      <path d="M4 14h6.5v6.5H4z" />
      <path d="M13.5 14H20v6.5h-6.5z" />
    </svg>
  );
}

export function IconLive({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 4l7 7" />
      <path d="M3.5 2.5l3 1 1 3-2 2-3-3z" />
      <path d="M12 13l6.5 6.5" />
      <path d="M16.5 21.5l4-4" />
      <path d="M19 4l-7 7" />
      <path d="M21.5 2.5l-3 1-1 3 2 2 3-3z" />
      <path d="M12 13l-6.5 6.5" />
      <path d="M7.5 21.5l-4-4" />
    </svg>
  );
}

export function IconVoice({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z" />
      <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17v4" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

export function IconBuild({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 5.5a4.5 4.5 0 0 0 5 5L10 20a2.8 2.8 0 0 1-4-4l9.5-9.5a4.5 4.5 0 0 0-1-1z" />
      <path d="M7.5 17.5h.01" />
    </svg>
  );
}

export function IconInsights({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 19.5V4.5" />
      <path d="M4 19.5h16" />
      <path d="M7 15l4-4 3 3 5-7" />
      <path d="M16 7h3v3" />
    </svg>
  );
}

export function IconAccount({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function IconStore({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 9.5l1-5h14l1 5" />
      <path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5 9.8V20h14V9.8" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  );
}

export function IconSettings({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7z" />
      <path d="M13.5 2.8l.7 2.2a7.4 7.4 0 0 1 1.5.6l2.1-1.1 1.7 2.9-1.8 1.4a7 7 0 0 1 0 1.7l1.8 1.4-1.7 2.9-2.1-1.1a7.4 7.4 0 0 1-1.5.6l-.7 2.2h-3l-.7-2.2a7.4 7.4 0 0 1-1.5-.6l-2.1 1.1-1.7-2.9 1.8-1.4a7 7 0 0 1 0-1.7L4.5 7.4l1.7-2.9 2.1 1.1a7.4 7.4 0 0 1 1.5-.6l.7-2.2z" />
    </svg>
  );
}