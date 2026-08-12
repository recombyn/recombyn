import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

export type LogoScheme = 'dark' | 'light';

type Props = {
  /** Outer square size in px — always rendered 1:1. */
  size?: number;
  className?: string;
  bordered?: boolean;
  /**
   * `dark` — white feather on dark plate (`/logo-mark.png`), for light rails.
   * `light` — dark feather on light plate (`/logo-mark-light.png`), for dark rails (e.g. login art).
   * `auto` / omit — same as `dark`.
   */
  scheme?: LogoScheme | 'auto';
};

function markSrc(scheme: LogoScheme | 'auto' | undefined): string {
  if (scheme === 'light') return '/logo-mark-light.png';
  return '/logo-mark.png';
}

/**
 * Brand mark — scheme picks the fixed plate (not CSS theme).
 * Used by: HomeBody, LoginDialog, EditorBootOverlay.
 */
function AppLogo({
  size = 36,
  className,
  bordered = false,
  scheme = 'dark',
}: Props) {
  const { t } = useTranslation();

  return (
    <img
      src={markSrc(scheme)}
      alt={t('app.name')}
      width={size}
      height={size}
      draggable={false}
      className={cn('block shrink-0', className)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
        aspectRatio: '1 / 1',
        objectFit: 'contain',
        flex: '0 0 auto',
        // Beat Tailwind preflight `img { height: auto }`
        // so flex parents cannot stretch the bitmap.
        ...(bordered
          ? { borderRadius: '36%', boxShadow: 'inset 0 0 0 1px var(--line)' }
          : null),
      }}
    />
  );
}

export default memo(AppLogo);
