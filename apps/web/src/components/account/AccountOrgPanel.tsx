import { useEffect, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiQuery, getHttpStatus } from '@/service/client';
import { Button, message } from '@/components/base';
import { cn } from '@/utils/classnames';

const PREFERRED_ORG_KEY = 'recombyn.preferredOrgId';

export function readPreferredOrgId(): string | null {
  try {
    const v = localStorage.getItem(PREFERRED_ORG_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

function writePreferredOrgId(orgId: string | null) {
  try {
    if (!orgId) localStorage.removeItem(PREFERRED_ORG_KEY);
    else localStorage.setItem(PREFERRED_ORG_KEY, orgId);
  } catch {
    /* ignore */
  }
}

type OrgRow = {
  id: string;
  name: string;
  role?: string;
};

type MemberRow = {
  org_id?: string;
  user_id: string;
  role: string;
};

function roleLabel(role: string | undefined, t: (k: string) => string): string {
  const r = (role || '').toLowerCase();
  if (r === 'owner') return t('account.orgRoleOwner');
  if (r === 'admin') return t('account.orgRoleAdmin');
  return t('account.orgRoleMember');
}

function canInvite(role: string | undefined): boolean {
  const r = (role || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

/** Team orgs — create, prefer for new projects, invite by email. */
function AccountOrgPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [preferredId, setPreferredId] = useState<string | null>(() => readPreferredOrgId());

  const orgsQuery = useQuery({
    ...apiQuery.orgsListMyOrgs.queryOptions({}),
  });

  const orgs: OrgRow[] = (() => {
    const data = orgsQuery.data as { orgs?: OrgRow[] } | undefined;
    return Array.isArray(data?.orgs) ? data.orgs : [];
  })();

  useEffect(() => {
    if (!selectedId && orgs.length > 0) setSelectedId(orgs[0].id);
    if (selectedId && orgs.length > 0 && !orgs.some((o) => o.id === selectedId)) {
      setSelectedId(orgs[0]?.id ?? null);
    }
  }, [orgs, selectedId]);

  const selected = orgs.find((o) => o.id === selectedId) || null;

  const membersQuery = useQuery({
    ...apiQuery.orgsListMembers.queryOptions({
      input: { params: { org_id: selectedId || '' } },
      enabled: Boolean(selectedId),
    }),
  });

  const members: MemberRow[] = (() => {
    const data = membersQuery.data as { members?: MemberRow[] } | undefined;
    return Array.isArray(data?.members) ? data.members : [];
  })();

  const createMut = useMutation({
    mutationFn: async (orgName: string) =>
      apiClient.orgsCreateOrg({ body: { name: orgName } }) as Promise<{
        org?: OrgRow;
      }>,
    onSuccess: async (res) => {
      message.success(t('account.orgCreated'));
      setName('');
      await qc.invalidateQueries({ queryKey: apiQuery.orgsListMyOrgs.key() });
      const id = res?.org?.id;
      if (id) setSelectedId(id);
    },
    onError: () => message.error(t('account.orgCreateFailed')),
  });

  const inviteMut = useMutation({
    mutationFn: async (opts: { orgId: string; email: string }) =>
      apiClient.orgsInviteMember({
        params: { org_id: opts.orgId },
        body: { email: opts.email, role: 'member' },
      }),
    onSuccess: async () => {
      message.success(t('account.orgInviteOk'));
      setInviteEmail('');
      if (selectedId) {
        await qc.invalidateQueries({ queryKey: apiQuery.orgsListMembers.key() });
      }
    },
    onError: (err) => {
      const status = getHttpStatus(err);
      if (status === 404) message.error(t('account.orgInviteUserMissing'));
      else if (status === 403) message.error(t('account.orgInviteForbidden'));
      else message.error(t('account.orgInviteFailed'));
    },
  });

  const onCreate = () => {
    const n = name.trim();
    if (!n) {
      message.warning(t('account.orgNameRequired'));
      return;
    }
    createMut.mutate(n);
  };

  const onInvite = () => {
    if (!selectedId) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      message.warning(t('account.orgInviteEmailInvalid'));
      return;
    }
    inviteMut.mutate({ orgId: selectedId, email });
  };

  const onTogglePreferred = (orgId: string) => {
    const next = preferredId === orgId ? null : orgId;
    writePreferredOrgId(next);
    setPreferredId(next);
    message.success(
      next ? t('account.orgPreferredOn') : t('account.orgPreferredOff')
    );
  };

  const inputClass = cn(
    'h-10 w-full rounded-lg border-0 bg-[var(--account-main)] px-3 text-[14px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)]',
    'placeholder:text-[var(--muted)] focus:ring-[var(--ink)]/25 disabled:opacity-60'
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
        <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
          {t('account.orgCreateTitle')}
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
          {t('account.orgCreateHint')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
            maxLength={120}
            disabled={createMut.isPending}
            className={cn(inputClass, 'max-w-md flex-1')}
            placeholder={t('account.orgNamePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate();
            }}
          />
          <Button
            type="primary"
            shape="round"
            loading={createMut.isPending}
            disabled={createMut.isPending}
            onClick={onCreate}
          >
            {t('account.orgCreateAction')}
          </Button>
        </div>
      </section>

      <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
        <h2 className="mb-4 text-[15px] font-semibold text-[var(--ink)]">
          {t('account.orgListTitle')}
        </h2>
        {orgsQuery.isPending ? (
          <p className="text-[13px] text-[var(--muted)]">{t('common.loading')}</p>
        ) : orgs.length === 0 ? (
          <p className="text-[13px] text-[var(--muted)]">{t('account.orgEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {orgs.map((org) => {
              const active = org.id === selectedId;
              const preferred = org.id === preferredId;
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(org.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition',
                      active
                        ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--line)]'
                        : 'hover:bg-[var(--account-main)]'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-[var(--ink)]">
                        {org.name}
                        {preferred ? (
                          <span className="ml-2 text-[11px] font-normal text-[var(--muted)]">
                            {t('account.orgPreferredBadge')}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[12px] text-[var(--muted)]">
                        {roleLabel(org.role, t)}
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePreferred(org.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onTogglePreferred(org.id);
                        }
                      }}
                      className={cn(
                        'shrink-0 rounded-md px-2 py-1 text-[12px]',
                        preferred
                          ? 'bg-[var(--ink)] text-[var(--surface)]'
                          : 'bg-[var(--account-main)] text-[var(--muted)] ring-1 ring-[var(--line)]'
                      )}
                    >
                      {preferred
                        ? t('account.orgPreferredUnset')
                        : t('account.orgPreferredSet')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected ? (
        <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
          <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
            {t('account.orgMembersTitle', { name: selected.name })}
          </h2>
          <p className="mb-4 text-[13px] text-[var(--muted)]">
            {t('account.orgMembersHint')}
          </p>

          {membersQuery.isPending ? (
            <p className="mb-4 text-[13px] text-[var(--muted)]">{t('common.loading')}</p>
          ) : (
            <ul className="mb-5 space-y-1.5">
              {members.map((m) => (
                <li
                  key={`${m.user_id}-${m.role}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-[var(--account-main)] px-3 py-2 text-[13px]"
                >
                  <span className="min-w-0 truncate font-mono text-[var(--ink)]">
                    {m.user_id}
                  </span>
                  <span className="shrink-0 text-[var(--muted)]">
                    {roleLabel(m.role, t)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canInvite(selected.role) ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value.slice(0, 320))}
                disabled={inviteMut.isPending}
                className={cn(inputClass, 'max-w-md flex-1')}
                placeholder={t('account.orgInvitePlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onInvite();
                }}
              />
              <Button
                type="primary"
                shape="round"
                loading={inviteMut.isPending}
                disabled={inviteMut.isPending}
                onClick={onInvite}
              >
                {t('account.orgInviteAction')}
              </Button>
            </div>
          ) : (
            <p className="border-t border-[var(--line)] pt-4 text-[13px] text-[var(--muted)]">
              {t('account.orgInviteNeedAdmin')}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default memo(AccountOrgPanel);
