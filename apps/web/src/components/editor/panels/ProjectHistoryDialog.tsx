/**
 * Project history dialog — session undo timeline + cloud named/auto versions.
 * Logic lives in top-of-file helpers; the component only wires state + UI.
 */
import { memo, useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { HiOutlineClock, HiOutlineTrash } from 'react-icons/hi2';
import { Dialog, message } from '@/components/base';
import LoadingDots from '@/components/base/LoadingDots';
import {
  clearHistoryStacks,
  jumpHistoryBack,
  persistCurrent,
  setDocument,
} from '@/store/modules/editor';
import type { HistoryEntry } from '@/store/modules/editorHistory';
import { asHistoryEntry } from '@/store/modules/editorHistory';
import type { SceneDocument } from '@/components/rcb/sceneNode';
import {
  clearCollabUndoStack,
  collabUndo,
  isCollabActive,
} from '@/components/editor/collab/collabRuntime';
import {
  flushCurrentProjectNow,
  presentProjectRevisionConflict,
  pushProjectToCloud,
  revisionFromHttpConflict,
} from '@/components/editor/useProjectCloudSync';
import store from '@/store';
import {
  getProjectDraft,
  putProjectDraft,
} from '@/components/editor/projectDraftStore';
import { getHttpErrorMessage, getHttpStatus } from '@/service/client';
import { getToken } from '@/utils/token';
import {
  createProjectVersionApi,
  deleteProjectVersionApi,
  listProjectVersionsApi,
  restoreProjectVersionApi,
  type ProjectVersionDto,
} from '@/service/projectVersions';
import { normalizeProjectThumbnailUrls } from '@/utils/projectThumb';
import { cn } from '@/utils/classnames';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = 'session' | 'cloud';

type SessionRow = {
  key: string;
  steps: number;
  label: string;
};

type EditorDispatch = ReturnType<typeof useDispatch>;

function formatWhen(ms: number, locale: string): string {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function sessionEntryLabel(entry: HistoryEntry, indexFromNewest: number, t: TFunction): string {
  const e = asHistoryEntry(entry);
  let kind = t('editor.history.entrySnap', { defaultValue: 'Structure' });
  if (e.kind === 'nodes') {
    kind = t('editor.history.entryPatch', { defaultValue: 'Edit' });
  }
  return t('editor.history.stepsAgo', {
    defaultValue: '{{n}} steps ago · {{kind}}',
    n: indexFromNewest + 1,
    kind,
  });
}

function buildSessionRows(historyPast: HistoryEntry[], t: TFunction): SessionRow[] {
  const past = [...historyPast].reverse();
  return past.map((entry, i) => ({
    key: `s-${i}-${asHistoryEntry(entry).kind}`,
    steps: i + 1,
    label: sessionEntryLabel(entry, i, t),
  }));
}

function readDraftBaseRevision(cloudRevision: unknown): number | undefined {
  if (cloudRevision == null) return undefined;
  const n = Number(cloudRevision);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.floor(n);
}

/**
 * Scratch/case canvases skip cloud flush until claimed. Claim + upsert so
 * /versions APIs can resolve the project row.
 */
async function ensureProjectOnCloud(opts: {
  dispatch: EditorDispatch;
  projectId: string;
  projectName: string;
  document: SceneDocument;
}): Promise<boolean> {
  if (!getToken()) return false;
  opts.dispatch(persistCurrent({ keepDirty: true }));

  const draft = await getProjectDraft(opts.projectId);
  if (readDraftBaseRevision(draft?.cloudRevision) != null) {
    try {
      await flushCurrentProjectNow({ force: true });
    } catch {
      /* still have a cloud row */
    }
    return true;
  }

  const written = await pushProjectToCloud({
    id: opts.projectId,
    name: opts.projectName,
    document: opts.document,
    baseRevision: null,
  });
  if (written.status !== 'ok') return false;

  const revision = Number(written.ack.revision);
  await putProjectDraft({
    projectId: opts.projectId,
    name: opts.projectName,
    document: opts.document,
    syncedAt: Date.now(),
    cloudRevision: Number.isFinite(revision) && revision >= 1 ? revision : 1,
    baseDocument: opts.document,
  });
  return true;
}

function versionKindLabel(kind: string, t: TFunction): string {
  if (kind === 'auto') {
    return t('editor.history.kindAuto', { defaultValue: 'Auto' });
  }
  return t('editor.history.kindNamed', { defaultValue: 'Named' });
}

function versionThumbSrc(version: ProjectVersionDto): string {
  const thumbs = normalizeProjectThumbnailUrls(version.thumbnailUrl);
  return thumbs[0] || '';
}

async function loadProjectVersions(opts: {
  projectId: string;
  projectName: string;
  document: SceneDocument | null;
  dispatch: EditorDispatch;
  t: TFunction;
  setVersions: Dispatch<SetStateAction<ProjectVersionDto[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
}): Promise<void> {
  const { projectId, projectName, document, dispatch, t, setVersions, setLoading } = opts;
  setLoading(true);
  try {
    if (document) {
      const ready = await ensureProjectOnCloud({
        dispatch,
        projectId,
        projectName,
        document,
      });
      if (!ready) {
        setVersions([]);
        return;
      }
    }
    const res = await listProjectVersionsApi(projectId, { pageSize: 80 });
    if (Array.isArray(res.items)) {
      setVersions(res.items);
    } else {
      setVersions([]);
    }
  } catch (err) {
    if (getHttpStatus(err) === 404) {
      setVersions([]);
      return;
    }
    message.error(
      getHttpErrorMessage(err, t('editor.history.loadFailed', { defaultValue: 'Failed to load versions' }))
    );
  } finally {
    setLoading(false);
  }
}

async function saveNamedVersion(opts: {
  projectId: string;
  projectName: string;
  document: SceneDocument;
  nameDraft: string;
  dispatch: EditorDispatch;
  t: TFunction;
  setSavingNamed: Dispatch<SetStateAction<boolean>>;
  setNameDraft: Dispatch<SetStateAction<string>>;
  reload: () => Promise<void>;
}): Promise<void> {
  const {
    projectId,
    projectName,
    document,
    nameDraft,
    dispatch,
    t,
    setSavingNamed,
    setNameDraft,
    reload,
  } = opts;
  setSavingNamed(true);
  try {
    const ready = await ensureProjectOnCloud({
      dispatch,
      projectId,
      projectName,
      document,
    });
    if (!ready) {
      message.error(
        t('editor.history.saveFailed', {
          defaultValue: 'Could not save version — project is not on cloud yet',
        })
      );
      return;
    }
    const name = nameDraft.trim() || undefined;
    await createProjectVersionApi(projectId, {
      name,
      kind: 'named',
      document,
    });
    setNameDraft('');
    message.success(t('editor.history.saved', { defaultValue: 'Version saved' }));
    await reload();
  } catch (err) {
    message.error(
      getHttpErrorMessage(err, t('editor.history.saveFailed', { defaultValue: 'Could not save version' }))
    );
  } finally {
    setSavingNamed(false);
  }
}

function jumpSessionHistory(opts: {
  steps: number;
  collab: boolean;
  dispatch: EditorDispatch;
  t: TFunction;
}): void {
  const { steps, collab, dispatch, t } = opts;
  if (collab) {
    for (let i = 0; i < steps; i += 1) {
      if (!collabUndo()) break;
    }
  } else {
    dispatch(jumpHistoryBack(steps));
  }
  message.success(t('editor.history.jumped', { defaultValue: 'Restored session step' }));
}

function reportRestoreError(err: unknown, t: TFunction): void {
  message.error(
    getHttpErrorMessage(err, t('editor.history.restoreFailed', { defaultValue: 'Restore failed' }))
  );
}

function presentRestoreRevisionConflict(opts: {
  projectId: string;
  projectName: string;
  version: ProjectVersionDto;
  err: unknown;
  dispatch: EditorDispatch;
  t: TFunction;
  setBusyId: Dispatch<SetStateAction<string | null>>;
  reload: () => Promise<void>;
  onClose: () => void;
}): void {
  const { projectId, projectName, version, err, dispatch, t, setBusyId, reload, onClose } = opts;

  async function openConflict() {
    try {
      let serverRevision = revisionFromHttpConflict(err);
      if (serverRevision == null) {
        const draft = await getProjectDraft(projectId);
        serverRevision = readDraftBaseRevision(draft?.cloudRevision);
      }
      if (serverRevision == null || serverRevision < 1) {
        reportRestoreError(err, t);
        return;
      }
      const ed = store.getState().editor as { document: SceneDocument | null };
      presentProjectRevisionConflict({
        projectId,
        name: projectName,
        localDocument: ed.document,
        serverRevision,
        kind: 'restore',
        onResolved: async (choice) => {
          if (choice === 'dismiss') return;
          await restoreCloudVersion({
            projectId,
            projectName,
            version,
            dispatch,
            t,
            setBusyId,
            reload,
            onClose,
            skipConflictDialog: true,
          });
        },
      });
    } catch {
      reportRestoreError(err, t);
    }
  }

  openConflict();
}

async function restoreCloudVersion(opts: {
  projectId: string;
  projectName: string;
  version: ProjectVersionDto;
  dispatch: EditorDispatch;
  t: TFunction;
  setBusyId: Dispatch<SetStateAction<string | null>>;
  reload: () => Promise<void>;
  onClose: () => void;
  skipConflictDialog?: boolean;
}): Promise<void> {
  const {
    projectId,
    projectName,
    version,
    dispatch,
    t,
    setBusyId,
    reload,
    onClose,
    skipConflictDialog,
  } = opts;
  setBusyId(version.id);
  try {
    await flushCurrentProjectNow({ force: true });
    const draft = await getProjectDraft(projectId);
    const baseRevision = readDraftBaseRevision(draft?.cloudRevision);
    const res = await restoreProjectVersionApi(projectId, version.id, {
      baseRevision: baseRevision ?? null,
      createBackup: true,
    });
    const doc = res.document as SceneDocument;
    dispatch(clearHistoryStacks());
    dispatch(setDocument(doc));
    clearCollabUndoStack();

    const nextRev = Number(res.project?.revision);
    let cloudRevision: number | null = null;
    if (Number.isFinite(nextRev) && nextRev >= 1) {
      cloudRevision = nextRev;
    }
    await putProjectDraft({
      projectId,
      name: res.project?.name || projectName,
      document: doc,
      syncedAt: Date.now(),
      cloudRevision,
      baseDocument: doc,
    });
    message.success(t('editor.history.restored', { defaultValue: 'Version restored' }));
    await reload();
    onClose();
  } catch (err) {
    if (!skipConflictDialog && getHttpStatus(err) === 412) {
      presentRestoreRevisionConflict({
        projectId,
        projectName,
        version,
        err,
        dispatch,
        t,
        setBusyId,
        reload,
        onClose,
      });
      return;
    }
    reportRestoreError(err, t);
  } finally {
    setBusyId(null);
  }
}

async function deleteCloudVersion(opts: {
  projectId: string;
  version: ProjectVersionDto;
  t: TFunction;
  setBusyId: Dispatch<SetStateAction<string | null>>;
  setVersions: Dispatch<SetStateAction<ProjectVersionDto[]>>;
}): Promise<void> {
  const { projectId, version, t, setBusyId, setVersions } = opts;
  setBusyId(version.id);
  try {
    await deleteProjectVersionApi(projectId, version.id);
    setVersions((prev) => prev.filter((row) => row.id !== version.id));
    message.success(t('editor.history.deleted', { defaultValue: 'Version deleted' }));
  } catch (err) {
    message.error(
      getHttpErrorMessage(err, t('editor.history.deleteFailed', { defaultValue: 'Delete failed' }))
    );
  } finally {
    setBusyId(null);
  }
}

function HistoryTabBar(props: {
  tab: Tab;
  onSelectCloud: () => void;
  onSelectSession: () => void;
  t: TFunction;
}) {
  const { tab, onSelectCloud, onSelectSession, t } = props;
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--accent-soft)] p-1">
      <button
        type="button"
        className={cn(
          'flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition',
          tab === 'cloud' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)]'
        )}
        onClick={onSelectCloud}
      >
        {t('editor.history.tabCloud', { defaultValue: 'Saved versions' })}
      </button>
      <button
        type="button"
        className={cn(
          'flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition',
          tab === 'session' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)]'
        )}
        onClick={onSelectSession}
      >
        {t('editor.history.tabSession', { defaultValue: 'This session' })}
      </button>
    </div>
  );
}

function CloudVersionRow(props: {
  version: ProjectVersionDto;
  busy: boolean;
  locale: string;
  t: TFunction;
  onRestore: (version: ProjectVersionDto) => void;
  onDelete: (version: ProjectVersionDto) => void;
}) {
  const { version, busy, locale, t, onRestore, onDelete } = props;
  const thumb = versionThumbSrc(version);
  const title = version.name || t('editor.history.unnamed', { defaultValue: 'Version' });
  const meta = `${versionKindLabel(version.kind, t)} · ${formatWhen(version.createdAt, locale)}${
    version.sourceRevision ? ` · r${version.sourceRevision}` : ''
  }`;

  function handleRestore() {
    onRestore(version);
  }

  function handleDelete() {
    onDelete(version);
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--accent-soft)]">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
            <HiOutlineClock className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-[var(--ink)]">{title}</div>
        <div className="truncate text-[11px] text-[var(--muted)]">{meta}</div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={handleRestore}
        className="h-8 shrink-0 rounded-lg px-2.5 text-[12px] font-medium text-[var(--ink)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        {busy ? <LoadingDots /> : t('editor.history.restore', { defaultValue: 'Restore' })}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={t('editor.history.delete', { defaultValue: 'Delete' })}
        onClick={handleDelete}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-50"
      >
        <HiOutlineTrash className="h-4 w-4" />
      </button>
    </li>
  );
}

function SessionHistoryRow(props: {
  row: SessionRow;
  t: TFunction;
  onJump: (steps: number) => void;
}) {
  const { row, t, onJump } = props;

  function handleJump() {
    onJump(row.steps);
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleJump}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
      >
        <span className="min-w-0 truncate">{row.label}</span>
        <span className="shrink-0 text-[12px] text-[var(--muted)]">
          {t('editor.history.jump', { defaultValue: 'Jump' })}
        </span>
      </button>
    </li>
  );
}

function CloudHistoryPanel(props: {
  nameDraft: string;
  savingNamed: boolean;
  canSave: boolean;
  loading: boolean;
  versions: ProjectVersionDto[];
  busyId: string | null;
  locale: string;
  t: TFunction;
  onNameDraftChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSaveNamed: () => void;
  onRestore: (version: ProjectVersionDto) => void;
  onDelete: (version: ProjectVersionDto) => void;
}) {
  const {
    nameDraft,
    savingNamed,
    canSave,
    loading,
    versions,
    busyId,
    locale,
    t,
    onNameDraftChange,
    onSaveNamed,
    onRestore,
    onDelete,
  } = props;

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex justify-center py-10">
        <LoadingDots />
      </div>
    );
  } else if (versions.length === 0) {
    body = (
      <p className="py-8 text-center text-[13px] text-[var(--muted)]">
        {t('editor.history.emptyCloud', { defaultValue: 'No saved versions yet' })}
      </p>
    );
  } else {
    body = (
      <ul className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
        {versions.map((version) => (
          <CloudVersionRow
            key={version.id}
            version={version}
            busy={busyId === version.id}
            locale={locale}
            t={t}
            onRestore={onRestore}
            onDelete={onDelete}
          />
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          value={nameDraft}
          onChange={onNameDraftChange}
          placeholder={t('editor.history.namePlaceholder', { defaultValue: 'Version name (optional)' })}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
          maxLength={120}
        />
        <button
          type="button"
          disabled={savingNamed || !canSave}
          onClick={onSaveNamed}
          aria-busy={savingNamed || undefined}
          className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--surface)] disabled:opacity-50"
        >
          {savingNamed
            ? t('editor.history.saving', { defaultValue: 'Saving…' })
            : t('editor.history.saveNamed', { defaultValue: 'Save version' })}
        </button>
      </div>
      <p className="text-[12px] text-[var(--muted)]">
        {t('editor.history.cloudHint', {
          defaultValue:
            'Named versions keep a full snapshot. Auto saves appear when you restore or after cloud sync.',
        })}
      </p>
      {body}
    </>
  );
}

function sessionHintText(collab: boolean, t: TFunction): string {
  if (collab) {
    return t('editor.history.sessionCollabHint', {
      defaultValue: 'Collaboration uses the room undo stack; cloud versions still restore.',
    });
  }
  return t('editor.history.sessionHint', {
    defaultValue: 'Session history is local only and clears on refresh.',
  });
}

function SessionHistoryPanel(props: {
  collab: boolean;
  sessionRows: SessionRow[];
  t: TFunction;
  onJump: (steps: number) => void;
}) {
  const { collab, sessionRows, t, onJump } = props;

  let body: ReactNode;
  if (collab) {
    body = (
      <p className="py-6 text-center text-[13px] text-[var(--muted)]">
        {t('editor.history.sessionCollabEmpty', {
          defaultValue: 'Use Ctrl/Cmd+Z on the canvas, or restore a cloud version below.',
        })}
      </p>
    );
  } else if (sessionRows.length === 0) {
    body = (
      <p className="py-8 text-center text-[13px] text-[var(--muted)]">
        {t('editor.history.emptySession', { defaultValue: 'No edits in this session yet' })}
      </p>
    );
  } else {
    body = (
      <ul className="max-h-[min(52vh,420px)] space-y-1.5 overflow-y-auto pr-1">
        {sessionRows.map((row) => (
          <SessionHistoryRow key={row.key} row={row} t={t} onJump={onJump} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <p className="text-[12px] text-[var(--muted)]">{sessionHintText(collab, t)}</p>
      {body}
    </>
  );
}

function selectProjectId(s: { editor: { currentId: string | null } }): string | null {
  return s.editor.currentId;
}

function selectProjectName(s: {
  editor: { currentId: string | null; templates: Array<{ id: string; name: string }> };
}): string {
  const id = s.editor.currentId;
  return s.editor.templates.find((x) => x.id === id)?.name || 'Untitled';
}

function selectHistoryPast(s: { editor: { historyPast: HistoryEntry[] } }): HistoryEntry[] {
  return s.editor.historyPast || [];
}

function selectDocument(s: { editor: { document: SceneDocument | null } }): SceneDocument | null {
  return s.editor.document;
}

function ProjectHistoryDialog({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const projectId = useSelector(selectProjectId);
  const projectName = useSelector(selectProjectName);
  const historyPast = useSelector(selectHistoryPast);
  const document = useSelector(selectDocument);

  const [tab, setTab] = useState<Tab>('cloud');
  const [versions, setVersions] = useState<ProjectVersionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingNamed, setSavingNamed] = useState(false);
  const collab = isCollabActive();

  const sessionRows = useMemo(() => buildSessionRows(historyPast, t), [historyPast, t]);

  useEffect(() => {
    if (!open || !projectId) return;
    setTab('cloud');
    setNameDraft('');
    async function bootVersions() {
      await loadProjectVersions({
        projectId,
        projectName,
        document,
        dispatch,
        t,
        setVersions,
        setLoading,
      });
    }
    bootVersions();
  }, [open, projectId, projectName, document, dispatch, t]);

  async function reloadVersions() {
    if (!projectId || !open) return;
    await loadProjectVersions({
      projectId,
      projectName,
      document,
      dispatch,
      t,
      setVersions,
      setLoading,
    });
  }

  function selectCloudTab() {
    setTab('cloud');
  }

  function selectSessionTab() {
    setTab('session');
  }

  function onNameDraftChange(e: ChangeEvent<HTMLInputElement>) {
    setNameDraft(e.target.value);
  }

  async function handleSaveNamed() {
    if (!projectId || !document) return;
    await saveNamedVersion({
      projectId,
      projectName,
      document,
      nameDraft,
      dispatch,
      t,
      setSavingNamed,
      setNameDraft,
      reload: reloadVersions,
    });
  }

  function handleJumpSession(steps: number) {
    jumpSessionHistory({ steps, collab, dispatch, t });
  }

  async function handleRestore(version: ProjectVersionDto) {
    if (!projectId) return;
    await restoreCloudVersion({
      projectId,
      projectName,
      version,
      dispatch,
      t,
      setBusyId,
      reload: reloadVersions,
      onClose,
    });
  }

  async function handleDelete(version: ProjectVersionDto) {
    if (!projectId) return;
    await deleteCloudVersion({
      projectId,
      version,
      t,
      setBusyId,
      setVersions,
    });
  }

  const canSave = Boolean(document && projectId);

  return (
    <Dialog
      show={open}
      onClose={onClose}
      title={t('editor.history.title', { defaultValue: 'History' })}
      width={560}
      className="!max-w-[min(560px,94vw)]"
    >
      <div className="flex flex-col gap-3">
        <HistoryTabBar
          tab={tab}
          onSelectCloud={selectCloudTab}
          onSelectSession={selectSessionTab}
          t={t}
        />
        {tab === 'cloud' ? (
          <CloudHistoryPanel
            nameDraft={nameDraft}
            savingNamed={savingNamed}
            canSave={canSave}
            loading={loading}
            versions={versions}
            busyId={busyId}
            locale={i18n.language}
            t={t}
            onNameDraftChange={onNameDraftChange}
            onSaveNamed={handleSaveNamed}
            onRestore={handleRestore}
            onDelete={handleDelete}
          />
        ) : (
          <SessionHistoryPanel
            collab={collab}
            sessionRows={sessionRows}
            t={t}
            onJump={handleJumpSession}
          />
        )}
      </div>
    </Dialog>
  );
}

export default memo(ProjectHistoryDialog);
