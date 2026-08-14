import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandWordmarkLoader } from '@/components/base/AppLogo';
import { cn } from '@/utils/classnames';

type Props = {
  progress: number;
  exiting?: boolean;
};

/** Boot loader only — no skeleton chrome. */
function EditorBootOverlay({ progress, exiting = false }: Props) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex items-center justify-center bg-[var(--canvas)] transition-opacity duration-300',
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
      role="progressbar"
      aria-busy="true"
      aria-label={t('editor.initializing')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <BrandWordmarkLoader size="lg" />
    </div>
  );
}

export default memo(EditorBootOverlay);
