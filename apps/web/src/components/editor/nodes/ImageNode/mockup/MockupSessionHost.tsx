import { lazy, Suspense, type ReactNode } from 'react';
import type { SceneDocument } from '@/components/rcb/sceneNode';

const NullHost = () => null;

const PrivateMockupSessionHost = lazy(() =>
  import(/* @vite-ignore */ '@/private/mockup/MockupSessionHost')
    .then((m) => ({ default: m.default }))
    .catch(() => ({ default: NullHost }))
);

/**
 * OSS entry: lazy-loads closed-source UI from src/private/mockup (not on GitHub).
 */
function MockupSessionHost({ document }: { document: SceneDocument }): ReactNode {
  return (
    <Suspense fallback={null}>
      <PrivateMockupSessionHost document={document} />
    </Suspense>
  );
}

export default MockupSessionHost;
