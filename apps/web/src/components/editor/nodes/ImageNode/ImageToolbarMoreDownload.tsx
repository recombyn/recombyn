import { useMemo, useState, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowsPointingOut,
  HiOutlineEllipsisHorizontal,
  HiOutlineScissors,
} from 'react-icons/hi2';
import { MdOutlineFlip, MdOutlineOpacity } from 'react-icons/md';
import { TbDroplet } from 'react-icons/tb';
import { Dropdown } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import type { MenuItemType } from '@/components/base/dropdown';
import { cn } from '@/utils/classnames';
import { BlendModeIcon } from '@/components/rcb/selection/chrome/BlendModeControl';
import { IconCornerRadius } from '@/components/rcb/selection/chrome/StyleToolbarIcons';
import { imageMoreRow, imageToolBtn } from './imageToolbarShared';

export type ImageMoreAction =
  | 'expand'
  | 'adjust'
  | 'blendMode'
  | 'effects'
  | 'cornerRadius'
  | 'opacity'
  | 'crop'
  | 'flipRotate';

function moreItem(key: ImageMoreAction, icon: ReactNode, label: string): MenuItemType {
  return { key, label: imageMoreRow(icon, label) };
}

/** Image toolbar “More” menu: tools that dock to the right of the node. */
function ImageToolbarMoreDownload({
  onAction,
  showCornerRadius = true,
}: {
  onAction: (key: ImageMoreAction) => void;
  showCornerRadius?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const items: MenuItemType[] = useMemo(() => {
    const list: MenuItemType[] = [
      moreItem(
        'expand',
        <HiOutlineArrowsPointingOut className="h-4 w-4" />,
        t('editor.imageToolbar.expand')
      ),
      moreItem(
        'adjust',
        <HiOutlineAdjustmentsHorizontal className="h-4 w-4" />,
        t('editor.imageToolbar.adjust')
      ),
      moreItem(
        'blendMode',
        <BlendModeIcon mode="normal" className="h-4 w-4" />,
        t('editor.imageToolbar.blendMode')
      ),
      moreItem('effects', <TbDroplet className="h-4 w-4" />, t('editor.imageToolbar.effects')),
    ];
    if (showCornerRadius) {
      list.push(
        moreItem(
          'cornerRadius',
          <IconCornerRadius className="h-4 w-4" />,
          t('editor.imageToolbar.cornerRadius')
        )
      );
    }
    list.push(
      moreItem(
        'opacity',
        <MdOutlineOpacity className="h-4 w-4" />,
        t('editor.imageToolbar.opacity')
      ),
      moreItem('crop', <HiOutlineScissors className="h-4 w-4" />, t('editor.imageToolbar.crop')),
      moreItem(
        'flipRotate',
        <MdOutlineFlip className="h-4 w-4" />,
        t('editor.imageToolbar.flipRotate')
      )
    );
    return list;
  }, [t, showCornerRadius]);

  return (
    <Dropdown
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      offset={8}
      strategy="fixed"
      items={items}
      onClick={(key) => {
        onAction(key as ImageMoreAction);
        setOpen(false);
      }}
      popupClassName="min-w-[11.5rem]"
      floatingClassName="z-[80]"
      referenceClassName="inline-flex"
    >
      <Tooltip tip={t('editor.imageToolbar.more')} placement="top">
        <button
          type="button"
          aria-label={t('editor.imageToolbar.more')}
          className={cn(imageToolBtn, open && 'bg-[var(--accent-soft)]')}
        >
          <HiOutlineEllipsisHorizontal className="h-4 w-4" />
        </button>
      </Tooltip>
    </Dropdown>
  );
}

export default memo(ImageToolbarMoreDownload);
