import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCube, HiOutlineLanguage, HiOutlineSquare2Stack } from 'react-icons/hi2';
import { LuCrosshair, LuEraser } from 'react-icons/lu';
import { cn } from '@/utils/classnames';
import ImageRemoveBgMenu, { type RemoveBgMode } from './ImageRemoveBgMenu';
import {
  ImageToolSep,
  ImageUpscaleIcon,
  TOOL_ICON,
  TOOL_STROKE,
  imageToolBtn,
} from './imageToolbarShared';

export type { RemoveBgMode };

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
  onRemoveBg,
  onEraser,
  onMark,
  onReplaceText,
  onEditElements,
  onMultiAngle,
  previewSlot,
  downloadSlot,
}: {
  onUpscale: () => void;
  onRemoveBg: (mode: RemoveBgMode) => void;
  onEraser: () => void;
  onMark?: () => void;
  onReplaceText?: () => void;
  onEditElements?: () => void;
  onMultiAngle: () => void;
  previewSlot?: ReactNode;
  downloadSlot?: ReactNode;
}) {
  const { t } = useTranslation();
  const hasTrailing = Boolean(previewSlot || downloadSlot);
  return (
    <>
      <Tool label={t('editor.imageToolbar.upscale')} onClick={onUpscale}>
        <ImageUpscaleIcon />
      </Tool>
      <ImageRemoveBgMenu onPick={onRemoveBg} />
      <Tool label={t('editor.imageToolbar.eraser')} onClick={onEraser}>
        <LuEraser className={TOOL_ICON} strokeWidth={TOOL_STROKE} />
      </Tool>
      {onMark ? (
        <Tool label={t('editor.imageToolbar.mark')} onClick={onMark}>
          <LuCrosshair className={TOOL_ICON} strokeWidth={TOOL_STROKE} />
        </Tool>
      ) : null}
      {onReplaceText ? (
        <Tool label={t('editor.imageToolbar.replaceText')} onClick={onReplaceText}>
          <HiOutlineLanguage className={TOOL_ICON} strokeWidth={TOOL_STROKE} />
        </Tool>
      ) : null}
      {onEditElements ? (
        <Tool label={t('editor.imageToolbar.editElements')} onClick={onEditElements}>
          <HiOutlineSquare2Stack className={TOOL_ICON} strokeWidth={TOOL_STROKE} />
        </Tool>
      ) : null}
      <Tool label={t('editor.imageToolbar.multiAngle')} onClick={onMultiAngle}>
        <HiOutlineCube className={TOOL_ICON} strokeWidth={TOOL_STROKE} />
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
