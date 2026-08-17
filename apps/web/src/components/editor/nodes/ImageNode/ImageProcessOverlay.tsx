import { useMemo, type CSSProperties, type ReactNode, memo } from 'react';
import { SoftGlowSurface } from '@/components/base';
import {
  RcbOverlayPortal,
  useRcbCamera,
  useRcbDevicePixelRatio,
  rcbCameraCssZoom,
  rcbSceneToScreen,
} from '@/components/rcb';
import { radiiFromAttrs } from '@/components/rcb/scene/document/sceneRadii';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import type { SceneDocument, SceneNodeInput } from '@/components/rcb/sceneNode';

const PILL_BOTTOM_PAD_PX = 14;

export type ProcessGeomOverride = {
  left: number;
  top: number;
  width: number;
  height: number;
  angle?: number;
};

function readNodeAngle(node: SceneNodeInput, override?: ProcessGeomOverride | null) {
  if (override && Number.isFinite(override.angle)) return Number(override.angle);
  const n = Number(node?.attrs?.angle);
  return Number.isFinite(n) ? n : 0;
}

function useProcessWorldBox(
  document: SceneDocument,
  node: SceneNodeInput,
  override?: ProcessGeomOverride | null
) {
  const camera = useRcbCamera();
  const { left: docLeft, top: docTop } = nodeLeftTop(document, node);
  const left = override ? override.left : docLeft;
  const top = override ? override.top : docTop;
  const width = Math.max(1, override ? override.width : Number(node.width) || 1);
  const height = Math.max(1, override ? override.height : Number(node.height) || 1);
  const z = rcbCameraCssZoom(camera);
  const inv = 1 / z;
  const radii = radiiFromAttrs(node.attrs || {});
  const angle = readNodeAngle(node, override);
  return {
    left,
    top,
    width,
    height,
    z,
    inv,
    angle,
    // Radii stay in scene units (shell is under camera scale).
    borderRadius: `${radii.tl}px ${radii.tr}px ${radii.br}px ${radii.bl}px`,
  };
}

/** SoftGlow plate + status pill on the world layer (same lattice as the control box). */
function ProcessNodeChrome({
  nodeId,
  node,
  document,
  override,
}: {
  nodeId: string;
  node: SceneNodeInput;
  document: SceneDocument;
  override?: ProcessGeomOverride | null;
}): ReactNode {
  const { left, top, width, height, borderRadius, angle } = useProcessWorldBox(
    document,
    node,
    override
  );
  const camera = useRcbCamera();
  const dpr = useRcbDevicePixelRatio();
  const origin = rcbSceneToScreen(camera, left, top, dpr);
  const z = rcbCameraCssZoom(camera);
  const screenWidth = width * z;
  const screenHeight = height * z;
  const screenBorderRadius = borderRadius
    .split(' ')
    .map((value) => `${Math.max(0, Number.parseFloat(value) * z)}px`)
    .join(' ');
  const label = String(node.attrs?.processLabel || '处理中');

  const frameStyle = useMemo((): CSSProperties => {
    const style: CSSProperties = {
      position: 'absolute',
      left: origin.x,
      top: origin.y,
      width: screenWidth,
      height: screenHeight,
    };
    if (Math.abs(angle) > 0.001) {
      style.transform = `rotate(${angle}deg)`;
      style.transformOrigin = 'center center';
    }
    return style;
  }, [origin.x, origin.y, screenWidth, screenHeight, angle]);

  const shimmerStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      inset: 0,
      borderRadius: screenBorderRadius,
    }),
    [screenBorderRadius]
  );

  // Counter-scale the pill so typography stays screen-constant under camera zoom.
  const pillStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      left: '50%',
      top: screenHeight - PILL_BOTTOM_PAD_PX,
      transform: 'translate(-50%, -100%)',
      transformOrigin: 'center bottom',
    }),
    [screenHeight]
  );

  return (
    <RcbOverlayPortal>
      <div
        data-scene-node-id={nodeId}
        className="pointer-events-none absolute"
        // Keep the colored process plate visible for selected nodes. Selection
        // chrome owns the higher layer, so this never hides handles or controls.
        style={{ ...frameStyle, zIndex: 0 }}
      >
      <SoftGlowSurface
        data-image-process-shimmer
        tone="random"
        seed={nodeId}
        className="absolute inset-0"
        style={shimmerStyle}
        aria-hidden
      />
      <div
        data-image-process-label
        className="absolute z-[1] whitespace-nowrap rounded-full bg-[rgba(55,55,55,0.72)] px-2.5 py-1 text-[11px] font-medium leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]"
        style={pillStyle}
      >
        {label}
      </div>
      </div>
    </RcbOverlayPortal>
  );
}

/**
 * World-layer SoftGlow + status pills for upload / generate on image / video / audio / lottie.
 * Stays visible during move/resize — SVG underlay is a dull plate; SoftGlow must not vanish.
 * `geometryOverrides` keeps the plate glued while Redux is still on the pre-gesture document.
 */
function ImageProcessOverlay({
  document,
  geometryOverrides = null,
}: {
  document: SceneDocument;
  geometryOverrides?: Record<string, ProcessGeomOverride> | null;
}): ReactNode {
  const ids = useMemo(() => {
    const children: string[] = document?.deltaSetLike?.ROOT?.children || [];
    return children.filter((id) => {
      const node = document?.deltaSetLike?.[id];
      if (
        node?.key !== 'image' &&
        node?.key !== 'video' &&
        node?.key !== 'audio' &&
        node?.key !== 'lottie'
      ) {
        return false;
      }
      // Include generator plates while generating (same sweep as process jobs).
      return String(node.attrs?.processStatus || '') === 'running';
    });
  }, [document]);

  if (!ids.length) return null;

  return (
    <>
      {ids.map((id) => {
        const node = document.deltaSetLike[id];
        if (!node) return null;
        return (
          <ProcessNodeChrome
            key={id}
            nodeId={id}
            node={node}
            document={document}
            override={geometryOverrides?.[id]}
          />
        );
      })}
    </>
  );
}

export default memo(ImageProcessOverlay);
