import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatSessionMessageDto } from '@/models/chatSessions';
import { apiClient, apiQuery } from '@/service/client';
import type { TaskState } from '@/components/editor/panels/agent/agentMemory';
import type { ChatUiMessage } from '@/components/editor/panels/agent/ChatTurnList';
import { getToken } from '@/utils/token';

export type ChatSessionMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contexts?: ChatUiMessage['contexts'];
  contentMarked?: string;
  thinking?: string;
  durationMs?: number;
  intent?: string;
  steps?: ChatUiMessage['steps'];
  images?: string[];
  videos?: string[];
  imageModelId?: string;
  imageModelLabel?: string;
  imageAspectRatio?: string;
  designTaskId?: string;
  canResume?: boolean;
  proposedOps?: ChatUiMessage['proposedOps'];
  proposalId?: string;
  choices?: string[];
  applyChoice?: string;
  choiceUi?: ChatUiMessage['choiceUi'];
};

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatSessionMessage[];
  taskState?: TaskState | null;
};

const MAX_CHAT_SESSIONS = 40;

type RemoteSessionDto = {
  id: string;
  title: string;
  updatedAt: number;
  taskState?: TaskState | null;
  messages?: ChatSessionMessageDto[];
};

type SessionsListPayload = { sessions?: RemoteSessionDto[] };

function titleFromMessages(messages: ChatSessionMessage[]): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  if (!first) return '新对话';
  const t = first.content.trim().replace(/\s+/g, ' ');
  return t.length > 28 ? `${t.slice(0, 28)}…` : t;
}

function upsertChatSession(sessions: ChatSession[], next: ChatSession): ChatSession[] {
  const without = sessions.filter((s) => s.id !== next.id);
  return [next, ...without]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_CHAT_SESSIONS);
}

export function formatChatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function chatUid() {
  return Math.random().toString(36).slice(2, 10);
}

function isChatLoggedIn(): boolean {
  return Boolean(getToken());
}

type PendingChatSync = {
  projectId: string;
  id: string;
  title: string;
  messages: ChatSessionMessage[];
  taskState?: TaskState | null;
  payloadJson: string;
};

function pickAskPersistFields(m: {
  designTaskId?: string | null;
  canResume?: boolean | null;
  proposedOps?: ChatUiMessage['proposedOps'] | null;
  proposalId?: string | null;
  choices?: string[] | null;
  applyChoice?: string | null;
  choiceUi?: ChatUiMessage['choiceUi'] | null;
}): Partial<ChatSessionMessage> {
  return {
    ...(m.designTaskId ? { designTaskId: m.designTaskId } : {}),
    ...(m.canResume ? { canResume: true } : {}),
    ...(m.proposedOps?.length ? { proposedOps: m.proposedOps } : {}),
    ...(m.proposalId ? { proposalId: m.proposalId } : {}),
    ...(m.choices?.length ? { choices: m.choices } : {}),
    ...(m.applyChoice ? { applyChoice: m.applyChoice } : {}),
    ...(m.choiceUi ? { choiceUi: m.choiceUi } : {}),
  };
}

function toUiMessages(session: ChatSession): ChatUiMessage[] {
  return session.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    ...(m.contexts?.length ? { contexts: m.contexts } : {}),
    ...(m.contentMarked ? { contentMarked: m.contentMarked } : {}),
    thinking: m.thinking,
    ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
    ...(m.intent ? { intent: m.intent } : {}),
    ...(m.steps?.length ? { steps: m.steps } : {}),
    ...(m.images?.length ? { images: m.images } : {}),
    ...(m.videos?.length ? { videos: m.videos } : {}),
    ...(m.imageModelId ? { imageModelId: m.imageModelId } : {}),
    ...(m.imageModelLabel ? { imageModelLabel: m.imageModelLabel } : {}),
    ...(m.imageAspectRatio ? { imageAspectRatio: m.imageAspectRatio } : {}),
    ...pickAskPersistFields(m),
  }));
}

function dtoToSession(dto: RemoteSessionDto): ChatSession {
  return {
    id: dto.id,
    title: dto.title || '新对话',
    updatedAt: dto.updatedAt || Date.now(),
    taskState: dto.taskState || null,
    messages: (dto.messages || []).map((m, i) => ({
      id: m.id || `msg_${i}`,
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content || '',
      ...(m.contexts?.length ? { contexts: m.contexts } : {}),
      ...(m.contentMarked ? { contentMarked: m.contentMarked } : {}),
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
      ...(m.intent ? { intent: m.intent } : {}),
      ...(m.steps?.length ? { steps: m.steps } : {}),
      ...(m.images?.length ? { images: m.images } : {}),
      ...(m.videos?.length ? { videos: m.videos } : {}),
      ...(m.imageModelId ? { imageModelId: m.imageModelId } : {}),
      ...(m.imageModelLabel ? { imageModelLabel: m.imageModelLabel } : {}),
      ...(m.imageAspectRatio ? { imageAspectRatio: m.imageAspectRatio } : {}),
      ...pickAskPersistFields(m),
    })),
  };
}

function mapRemoteSessions(data: unknown): ChatSession[] {
  const res = data as SessionsListPayload | undefined;
  return (res?.sessions || []).map((s) =>
    dtoToSession({ ...s, taskState: s.taskState as TaskState | undefined })
  );
}

function messagesToPersisted(messages: ChatUiMessage[]): ChatSessionMessage[] {
  return messages
    .filter(
      (m) =>
        m.content ||
        m.thinking ||
        m.intent ||
        m.canResume ||
        m.designTaskId ||
        (m.proposedOps && m.proposedOps.length) ||
        m.proposalId ||
        m.choiceUi ||
        (m.contexts && m.contexts.length) ||
        (m.steps && m.steps.length) ||
        (m.images && m.images.length) ||
        (m.videos && m.videos.length)
    )
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ...(m.contexts?.length ? { contexts: m.contexts } : {}),
      ...(m.contentMarked ? { contentMarked: m.contentMarked } : {}),
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
      ...(m.intent ? { intent: m.intent } : {}),
      ...(m.steps?.length
        ? {
            steps: m.steps.map((s) => ({
              ...s,
              status: s.status === 'running' ? ('done' as const) : s.status,
            })),
          }
        : {}),
      ...(m.images?.length ? { images: m.images } : {}),
      ...(m.videos?.length ? { videos: m.videos } : {}),
      ...(m.imageModelId ? { imageModelId: m.imageModelId } : {}),
      ...(m.imageModelLabel ? { imageModelLabel: m.imageModelLabel } : {}),
      ...(m.imageAspectRatio ? { imageAspectRatio: m.imageAspectRatio } : {}),
      ...pickAskPersistFields(m),
    }));
}

function sessionPayloadJson(session: {
  id: string;
  title: string;
  messages: ChatSessionMessage[];
  taskState?: TaskState | null;
}): string {
  return JSON.stringify({
    id: session.id,
    title: session.title,
    messages: session.messages,
    taskState: session.taskState || null,
  });
}

/** Agent chat — in-memory + API when logged in. No localStorage session dumps. */
export function useChatSessions(documentId: string | null | undefined) {
  const scope = (documentId || '').trim() || '__none__';
  const queryClient = useQueryClient();
  const [apiEnabled, setApiEnabled] = useState(() => isChatLoggedIn());
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState(() => chatUid());
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [taskState, setTaskState] = useState<TaskState | null>(null);
  const [pendingLongSuggestions, setPendingLongSuggestions] = useState<
    Array<{ kind: string; text: string }>
  >([]);
  const sessionsRef = useRef<ChatSession[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncRef = useRef<PendingChatSync | null>(null);
  const lastSyncedJson = useRef<string>('');
  const apiDisabledRef = useRef(false);
  /** Scope that already opened its first remote (or empty) session. */
  const openedScopeRef = useRef<string | null>(null);

  const sessionsQueryKey = apiQuery.chatSessionsGetSessions.queryKey({
    input: { query: { projectId: scope || '__none__' } },
  });

  const sessionsQuery = useQuery({
    ...apiQuery.chatSessionsGetSessions.queryOptions({
      input: { query: { projectId: scope || '__none__' } },
      enabled: apiEnabled,
    }),
    staleTime: 60_000,
  });

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const putSessionMutation = useMutation({
    mutationFn: async (pending: PendingChatSync) => {
      await apiClient.chatSessionsPutSession({
        body: {
          projectId: pending.projectId || '__none__',
          id: pending.id,
          title: pending.title,
          messages: pending.messages,
          ...(pending.taskState != null ? { taskState: pending.taskState } : {}),
        },
      });
      return pending;
    },
    onSuccess: (pending) => {
      lastSyncedJson.current = pending.payloadJson;
    },
    onError: (_err, pending) => {
      if (!pendingSyncRef.current) pendingSyncRef.current = pending;
    },
  });
  const putSessionMutateRef = useRef(putSessionMutation.mutate);
  putSessionMutateRef.current = putSessionMutation.mutate;

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.chatSessionsRemoveSession({
        params: { session_id: id },
      });
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData(sessionsQueryKey, (old: unknown) => {
        const prev = old as SessionsListPayload | undefined;
        if (!prev?.sessions) return old;
        return {
          ...prev,
          sessions: prev.sessions.filter((s) => s.id !== id),
        };
      });
    },
  });
  const deleteSessionMutateRef = useRef(deleteSessionMutation.mutate);
  deleteSessionMutateRef.current = deleteSessionMutation.mutate;

  const refetchSessionsRef = useRef(sessionsQuery.refetch);
  refetchSessionsRef.current = sessionsQuery.refetch;

  const flushPendingSync = useCallback(() => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    const pending = pendingSyncRef.current;
    if (!pending || !apiEnabled || apiDisabledRef.current) return;
    if (pending.payloadJson === lastSyncedJson.current) return;
    pendingSyncRef.current = null;
    putSessionMutateRef.current(pending);
  }, [apiEnabled]);

  useEffect(() => {
    flushPendingSync();
    openedScopeRef.current = null;
    setReadyScope(null);
    setSessions([]);
    setSessionId(chatUid());
    setMessages([]);
    setTaskState(null);
    lastSyncedJson.current = '';
    if (!apiEnabled) {
      setReadyScope(scope);
      openedScopeRef.current = scope;
    }
  }, [scope, apiEnabled, flushPendingSync]);

  useEffect(() => {
    if (!apiEnabled) return;

    if (sessionsQuery.isError) {
      if (openedScopeRef.current !== scope) {
        setSessionId(chatUid());
        setMessages([]);
        setTaskState(null);
        openedScopeRef.current = scope;
        setReadyScope(scope);
      }
      return;
    }

    if (sessionsQuery.isPending && !sessionsQuery.data) return;

    const remote = mapRemoteSessions(sessionsQuery.data);
    setSessions(remote);

    if (openedScopeRef.current === scope) return;

    if (remote[0]) {
      setSessionId(remote[0].id);
      setMessages(toUiMessages(remote[0]));
      setTaskState(remote[0].taskState || null);
      lastSyncedJson.current = sessionPayloadJson(remote[0]);
    } else {
      setSessionId(chatUid());
      setMessages([]);
      setTaskState(null);
      lastSyncedJson.current = '';
    }
    openedScopeRef.current = scope;
    setReadyScope(scope);
  }, [
    apiEnabled,
    scope,
    sessionsQuery.data,
    sessionsQuery.isError,
    sessionsQuery.isPending,
  ]);

  useEffect(() => {
    const onUnauthorized = () => {
      apiDisabledRef.current = true;
      setApiEnabled(false);
    };
    window.addEventListener('recombine:auth-unauthorized', onUnauthorized);
    return () => window.removeEventListener('recombine:auth-unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    const onHide = () => flushPendingSync();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingSync();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flushPendingSync();
    };
  }, [flushPendingSync]);

  useEffect(() => {
    if (readyScope !== scope) return;
    if (messages.some((m) => m.streaming)) return;

    const persistedMsgs = messagesToPersisted(messages);
    if (persistedMsgs.length === 0 && !taskState) return;

    const persisted: ChatSession = {
      id: sessionId,
      title: titleFromMessages(persistedMsgs),
      updatedAt: Date.now(),
      messages: persistedMsgs,
      taskState,
    };
    setSessions((prev) => {
      const next = upsertChatSession(prev, persisted);
      queryClient.setQueryData(sessionsQueryKey, (old: unknown) => {
        const prevPayload = old as SessionsListPayload | undefined;
        return {
          ...(prevPayload && typeof prevPayload === 'object' ? prevPayload : {}),
          sessions: next.map((s) => ({
            id: s.id,
            title: s.title,
            updatedAt: s.updatedAt,
            taskState: s.taskState || null,
            messages: s.messages,
          })),
        };
      });
      return next;
    });

    if (!apiEnabled || apiDisabledRef.current) return;

    const payloadJson = sessionPayloadJson(persisted);
    if (payloadJson === lastSyncedJson.current) return;
    pendingSyncRef.current = {
      projectId: scope,
      id: persisted.id,
      title: persisted.title,
      messages: persisted.messages,
      taskState,
      payloadJson,
    };
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      flushPendingSync();
    }, 600);

    return () => {
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
        syncTimer.current = null;
      }
    };
  }, [
    messages,
    sessionId,
    scope,
    readyScope,
    flushPendingSync,
    taskState,
    apiEnabled,
    queryClient,
    sessionsQueryKey,
  ]);

  const startNewChat = useCallback(() => {
    flushPendingSync();
    const id = chatUid();
    setSessionId(id);
    setMessages([]);
    setTaskState(null);
    lastSyncedJson.current = '';
  }, [flushPendingSync]);

  const openSession = useCallback(
    (id: string) => {
      flushPendingSync();
      const found = sessionsRef.current.find((sess) => sess.id === id);
      if (!found) return;
      setSessionId(found.id);
      setMessages(toUiMessages(found));
      setTaskState(found.taskState || null);
      lastSyncedJson.current = sessionPayloadJson(found);
    },
    [flushPendingSync]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((sess) => sess.id !== id));
      if (apiEnabled && !apiDisabledRef.current) {
        deleteSessionMutateRef.current(id);
      }
      if (id === sessionId) {
        const nid = chatUid();
        setSessionId(nid);
        setMessages([]);
        setTaskState(null);
        lastSyncedJson.current = '';
      }
    },
    [sessionId, apiEnabled]
  );

  /** Re-fetch session list (history panel open). Keeps the active turn in place. */
  const refreshSessions = useCallback(async () => {
    flushPendingSync();
    if (!apiEnabled || apiDisabledRef.current) return;
    await refetchSessionsRef.current();
  }, [flushPendingSync, apiEnabled]);

  const chatTitle =
    messages.length === 0 ? '新对话' : titleFromMessages(messages as ChatSessionMessage[]);

  return {
    sessions,
    sessionId,
    messages,
    setMessages,
    chatTitle,
    startNewChat,
    openSession,
    deleteSession,
    refreshSessions,
    formatChatTime,
    newMessageId: chatUid,
    taskState,
    setTaskState,
    pendingLongSuggestions,
    setPendingLongSuggestions,
  };
}
