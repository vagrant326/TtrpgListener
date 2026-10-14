import type { ReactNode } from "react";

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const MicIcon = () => (
  <Icon size={14}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
  </Icon>
);

export const MonitorIcon = () => (
  <Icon>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <path d="M9 5v14M15 5v14" />
  </Icon>
);

export const SparkIcon = () => (
  <Icon size={14}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon size={14}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);

export const UpIcon = () => (
  <Icon size={14}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const DownIcon = () => (
  <Icon size={14}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon size={14}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon size={14}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const LogoIcon = () => (
  <Icon size={16}>
    <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" />
    <path d="M12 22V12M20.5 7L12 12 3.5 7" />
  </Icon>
);
