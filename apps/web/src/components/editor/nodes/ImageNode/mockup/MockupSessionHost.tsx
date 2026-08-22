import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  memo,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { LuPackage } from 'react-icons/lu';
import { message } from '@/components/base';
import {
  RcbOverlayPortal,
  rcbCameraCssZoom,
  rcbSceneToScreen,
  rcbScreenPxToScene,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '@/components/rcb';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import { useImageToolCapabilities } from '@/service/imageTools';
import { isMockupEnabled, renderMockup } from '@/service/mockupTools';
import { uploadImageFromSrc } from '@/utils/uploadImage';
import { cn } from '@/utils/classnames';
import {
  closeImageToolPanel,
  patchDocumentNode,
} from '@/store/modules/editor';
import type { SceneDocument, SceneNodeInput } from '@/components/rcb/sceneNode';

/** Default builtin template (`demo-cylinder`). */
const DEFAULT_TEMPLATE_ID = 'demo-cylinder';
const DEFAULT_TEMPLATE_WIDTH = 720;
const DEFAULT_TEMPLATE_HEIGHT = 960;

function nodeBox(document: SceneDocument, node: SceneNodeInput) {
  if (!node) return null;
  const { left, top } = nodeLeftTop(document, node);
  return {
    left,
    top,
    width: Math.max(1, Number(node.width) || 1),
    height: Math.max(1, Number(node.height) || 1),
  };
}

function readImageFile(file: File, onLoad: (dataUrl: string) => void) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const url = String(reader.result || '').trim();
    if (url) onLoad(url);
  };
  reader.readAsDataURL(file);
}

/**
 * Mockup session (closed-source): drag design onto template, then Rasterize.
 * Only active when intelligence mockup capability is enabled.
 */
function MockupSessionHost({ document }: { document: SceneDocument }): ReactNode {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const camera = useRcbCamera();
  const { data: imageToolCaps } = useImageToolCapabilities();
  const mockupEnabled = isMockupEnabled(imageToolCaps);

  const panel = useSelector(
    (s: any) => s.editor.imageToolPanel as null | { nodeId: string; kind: string }
  );
  const selectedNodeId = useSelector((s: any) => s.editor.selectedNodeId as string | null);

  const sessionOpen = panel?.kind === 'mockup' && mockupEnabled;
  const nodeId = sessionOpen ? panel!.nodeId : null;
  const node = nodeId ? document?.deltaSetLike?.[nodeId] : null;
  const box = useMemo(() => (node ? nodeBox(document, node) : null), [document, node]);

  const template = useMemo(() => {
    const tpl = imageToolCaps?.mockup?.templates?.find((t) => t.id === DEFAULT_TEMPLATE_ID);
    return {
      id: tpl?.id || DEFAULT_TEMPLATE_ID,
      width: tpl?.width || DEFAULT_TEMPLATE_WIDTH,
      height: tpl?.height || DEFAULT_TEMPLATE_HEIGHT,
    };
  }, [imageToolCaps?.mockup?.templates]);

  const [designSrc, setDesignSrc] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rendering, setRendering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => dispatch(closeImageToolPanel()), [dispatch]);

  useEffect(() => {
    if (panel?.kind === 'mockup' && !mockupEnabled) {
      dispatch(closeImageToolPanel());
    }
  }, [panel?.kind, mockupEnabled, dispatch]);

  useEffect(() => {
    if (!sessionOpen || !nodeId) {
      setDesignSrc(null);
      setDragOver(false);
      setRendering(false);
      return;
    }
    const src = String(node?.attrs?.src || '').trim();
    setDesignSrc(src || null);
  }, [sessionOpen, nodeId, node?.attrs?.src]);

  useEffect(() => {
    if (!sessionOpen || !nodeId) return;
    if (!selectedNodeId || selectedNodeId !== nodeId) close();
  }, [selectedNodeId, sessionOpen, nodeId, close]);

  useEffect(() => {
    if (!sessionOpen || !nodeId) return;
    if (!node || node.key !== 'image') close();
  }, [sessionOpen, nodeId, node, close]);

  useEffect(() => {
    if (!sessionOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sessionOpen, close]);

  const onFiles = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    readImageFile(file, setDesignSrc);
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      onFiles(e.dataTransfer.files);
    },
    [onFiles]
  );

  const onRasterize = async () => {
    if (!nodeId || !designSrc || rendering) return;
    setRendering(true);
    const hide = message.loading(t('editor.imageToolbar.processingMockup'), 0);
    try {
      const result = await renderMockup(designSrc, template.id);
      const uploaded = await uploadImageFromSrc(result.image, 'mockup.png');
      dispatch(
        patchDocumentNode({
          nodeId,
          patch: { attrs: { src: uploaded.url || result.image } },
        })
      );
      message.success(t('editor.imageToolbar.mockupDone'));
      close();
    } catch (err) {
      console.warn('[mockup]', err);
      message.error(t('editor.imageToolbar.mockupFailed'));
    } finally {
      hide();
      setRendering(false);
    }
  };

  const z = Math.max(0.05, rcbCameraCssZoom(camera));
  const toolbarGap = rcbScreenPxToScene(10, z);
  const footerStyle = useRcbScreenToolbarStyle({
    left: box ? box.left + box.width / 2 : 0,
    top: box ? box.top + box.height + toolbarGap : 0,
    anchor: 'top',
  });

  if (!sessionOpen || !nodeId || !box || !node) return null;

  const origin = rcbSceneToScreen(camera, box.left, box.top);
  const stageW = box.width * z;
  const stageH = box.height * z;
  const headerH = 28;

  const dimLabel = `${template.width} × ${template.height}`;

  return (
    <RcbOverlayPortal>
      <div
        data-mockup-session
        className="pointer-events-none absolute inset-0 z-[36]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-auto absolute flex items-center justify-between gap-3 text-[12px] font-medium text-[var(--accent)]"
          style={{
            left: origin.x,
            top: origin.y - headerH - 4,
            width: stageW,
            height: headerH,
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <LuPackage className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{t('editor.imageToolbar.mockup')}</span>
          </span>
          <span className="tabular-nums text-[11px] font-normal">{dimLabel}</span>
        </div>

        <div
          className="pointer-events-auto absolute overflow-hidden rounded-sm ring-2 ring-[var(--accent)]"
          style={{
            left: origin.x,
            top: origin.y,
            width: stageW,
            height: stageH,
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {designSrc ? (
            <img
              src={designSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-[var(--surface-2)]" />
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <button
              type="button"
              className={cn(
                'pointer-events-auto max-w-[88%] rounded-full px-4 py-2 text-center text-[13px] font-medium text-white shadow-lg transition',
                dragOver ? 'bg-black/75 scale-[1.02]' : 'bg-black/55 hover:bg-black/65'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('editor.imageToolbar.mockupDropHint')}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div
          data-mockup-toolbar
          className="pointer-events-auto absolute z-[37]"
          style={footerStyle}
        >
          <button
            type="button"
            disabled={!designSrc || rendering}
            className={cn(
              'inline-flex h-9 min-w-[120px] items-center justify-center rounded-full px-5 text-[13px] font-medium shadow-md transition',
              designSrc && !rendering
                ? 'bg-white text-[var(--ink)] hover:bg-white/95'
                : 'cursor-not-allowed bg-white/60 text-[var(--muted)]'
            )}
            onClick={() => void onRasterize()}
          >
            {t('editor.imageToolbar.mockupRasterize')}
          </button>
        </div>
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(MockupSessionHost);
