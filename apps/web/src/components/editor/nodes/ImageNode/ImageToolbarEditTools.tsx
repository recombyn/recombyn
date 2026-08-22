import { memo, type ReactNode } from 'react';

import { useTranslation } from 'react-i18next';

import { HiOutlineCube, HiOutlineLanguage } from 'react-icons/hi2';

import { LuEraser } from 'react-icons/lu';

import { Icon } from '@/components/base';

import { cn } from '@/utils/classnames';

import { ImageToolSep, imageToolBtn } from './imageToolbarShared';

function Tool({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(imageToolBtn, 'relative', active && 'bg-[var(--accent-soft)]')}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/** Image selection toolbar edit actions (AI tools + optional trailing slots). */
function ImageToolbarEditTools({
  onUpscale,
  onEraser,
  onReplaceText,
  onMultiAngle,
  previewSlot,
  downloadSlot,
}: {
  onUpscale: () => void;
  onEraser: () => void;
  onReplaceText?: () => void;
  onMultiAngle: () => void;
  previewSlot?: ReactNode;
  downloadSlot?: ReactNode;
}) {
  const { t } = useTranslation();
  const hasTrailing = Boolean(previewSlot || downloadSlot);

  return (
    <>
      <Tool label={t('editor.imageToolbar.upscale')} onClick={onUpscale}>
        <Icon name="editor-upscale" width={16} height={16} className="text-current" />
      </Tool>
      <Tool label={t('editor.imageToolbar.eraser')} onClick={onEraser}>
        <LuEraser className="h-4 w-4" />
      </Tool>
      {onReplaceText ? (
        <Tool label={t('editor.imageToolbar.replaceText')} onClick={onReplaceText}>
          <HiOutlineLanguage className="h-4 w-4" />
        </Tool>
      ) : null}
      <Tool label={t('editor.imageToolbar.multiAngle')} onClick={onMultiAngle}>
        <HiOutlineCube className="h-4 w-4" />
      </Tool>
      {hasTrailing ? (
        <>
          <ImageToolSep />
          {previewSlot}
          {downloadSlot}
        </>
      ) : null}
    </>
  );
}

export default memo(ImageToolbarEditTools);
