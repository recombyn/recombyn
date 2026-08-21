import { memo, type ReactNode } from 'react';
import { BsBadgeHd } from 'react-icons/bs';

export const imageToolBtn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)]';

/** Outline stroke matching LuEraser / HiOutline* on the image toolbar. */
export const TOOL_ICON = 'h-4 w-4';
export const TOOL_STROKE = 2;

export function ImageUpscaleIcon({ className = TOOL_ICON }: { className?: string }) {
  return <BsBadgeHd className={className} aria-hidden />;
}

/** Person in crop corners — same box as the rest of the toolbar icons. */
export function ImageRemoveBgIcon({ className = TOOL_ICON }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={TOOL_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M7.5 17.5c1.2-2 2.8-3 4.5-3s3.3 1 4.5 3" />
    </svg>
  );
}

function ImageToolSep() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />;
}

export function imageMoreRow(icon: ReactNode, label: string, extra?: ReactNode) {
  return (
    <span className="flex w-full items-center gap-2.5 text-[var(--ink)]">
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 text-left text-[13px] font-medium">{label}</span>
      {extra}
    </span>
  );
}

const MemoizedImageToolSep = memo(ImageToolSep);
export { MemoizedImageToolSep as ImageToolSep };
