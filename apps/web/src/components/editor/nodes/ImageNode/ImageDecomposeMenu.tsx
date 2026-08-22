import { useState, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineSquare2Stack } from 'react-icons/hi2';
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';
import { DropdownPanel, DropdownPanelItem } from '@/components/base';
import { cn } from '@/utils/classnames';
import { imageToolBtn } from './imageToolbarShared';

export type DecomposeMode = 'standard' | 'depth';

/** Split-layers mode menu: standard subject/text vs depth-based industrial pipeline. */
function ImageDecomposeMenu({
  onPick,
}: {
  onPick: (mode: DecomposeMode) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12, mainAxis: false })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const modes: { key: DecomposeMode; titleKey: string; hintKey: string }[] = [
    {
      key: 'standard',
      titleKey: 'editor.imageToolbar.editElementsStandard',
      hintKey: 'editor.imageToolbar.editElementsStandardHint',
    },
    {
      key: 'depth',
      titleKey: 'editor.imageToolbar.editElementsDepth',
      hintKey: 'editor.imageToolbar.editElementsDepthHint',
    },
  ];

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        className={cn(imageToolBtn, open && 'bg-[var(--accent-soft)]')}
        {...getReferenceProps()}
      >
        <HiOutlineSquare2Stack className="h-4 w-4" />
        <span>{t('editor.imageToolbar.editElements')}</span>
      </button>
      <FloatingPortal>
        {open ? (
          <DropdownPanel
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[80] min-w-[11.5rem]"
            {...getFloatingProps()}
          >
            {modes.map((m) => (
              <DropdownPanelItem
                key={m.key}
                className="h-auto min-h-8 items-start py-1.5"
                onClick={() => {
                  onPick(m.key);
                  setOpen(false);
                }}
              >
                <span className="flex flex-col gap-0.5 text-left">
                  <span className="text-[13px] font-semibold text-[var(--ink)]">
                    {t(m.titleKey)}
                  </span>
                  <span className="text-[11px] font-normal leading-snug text-[var(--muted)]">
                    {t(m.hintKey)}
                  </span>
                </span>
              </DropdownPanelItem>
            ))}
          </DropdownPanel>
        ) : null}
      </FloatingPortal>
    </>
  );
}

export default memo(ImageDecomposeMenu);
