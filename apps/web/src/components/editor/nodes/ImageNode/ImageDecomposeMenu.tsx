import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineSquare2Stack } from 'react-icons/hi2';
import { imageToolBtn } from './imageToolbarShared';

export type DecomposeMode = 'depth';

/** Depth-based industrial layering — only shown when intelligence is connected. */
function ImageDecomposeMenu({ onPick }: { onPick: (mode: DecomposeMode) => void }): ReactNode {
  const { t } = useTranslation();
  return (
    <button type="button" className={imageToolBtn} onClick={() => onPick('depth')}>
      <HiOutlineSquare2Stack className="h-4 w-4" />
      <span>{t('editor.imageToolbar.editElements')}</span>
    </button>
  );
}

export default memo(ImageDecomposeMenu);
