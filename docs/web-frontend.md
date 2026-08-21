# Web frontend data layer

You load server state in `apps/web` through **OpenAPI → OpenAPILink → TanStack Query** (`apiQuery`). HTTP is still FastAPI — the browser does not talk to the database.

## Packages / entry

| Piece | Path |
|-------|------|
| Generated oRPC contract | `packages/contracts` (`npm run gen:contracts`) |
| Client + `apiQuery` | `apps/web/src/service/client.ts` |
| Domain helpers | `apps/web/src/service/*.ts` (projects, wallet, auth, `projectVersions`, …) |
| Query provider | `apps/web/src/main.tsx` (`QueryClientProvider`) |
| URL state (nuqs) | `NuqsAdapter` in `apps/web/src/router/index.tsx` |

HTTP transport is **ky** via OpenAPILink (not axios). Errors: `getHttpStatus` / `getHttpErrorMessage` in `client.ts`.

## Reads: `useQuery(apiQuery…)`

List / Me / Skills / Inspiration / wallet snapshot use TanStack Query against `apiQuery.*`:

```ts
useInfiniteQuery({
  ...apiQuery.projectsListMyProjects.infiniteOptions({
    input: (pageParam: number) => ({ query: { page: pageParam, pageSize: 20 } }),
    initialPageParam: 1,
    getNextPageParam: (last) => /* … */,
  }),
  enabled: authed,
});
```

**Source of truth for lists is Query cache**, not a Redux library mirror. On fetch error, home projects render empty (same idea as Me published: do not keep showing stale cards). Logout / 401 clears project + wallet query caches.

Vite: include `nuqs` and `nuqs/adapters/react-router/v6` in `optimizeDeps.include` so the adapter prebundles (missing prebundle previously 504’d and blanked the app).

## Writes: mutations

Prefer:

```ts
useMutation(apiQuery.walletWalletRedeem.mutationOptions({ onSuccess: … }));
// mutateAsync({ body: { code } })
```

Dual-path calls (like / unlike) use `apiQuery.meMeLike.call` / `meMeUnlike.call` inside a custom `mutationFn`. Multipart upload/import may still use `request` (ky) intentionally.

## Project cloud sync + version history

| Piece | Path |
|-------|------|
| Autosave / revision lock / conflict UI | `apps/web/src/components/editor/useProjectCloudSync.tsx` |
| History dialog (session undo + cloud named/auto) | `apps/web/src/components/editor/panels/ProjectHistoryDialog.tsx` |
| HTTP helpers | `apps/web/src/service/projectVersions.ts` |

- Cloud sync keeps `baseRevision` and surfaces **412** via `presentProjectRevisionConflict` (adopt remote vs overwrite).
- Named versions: user “Save version”. Auto versions: milestones from cloud sync (capped on the API).
- Restore loads the snapshot document, optionally backs up the live doc first (`createBackup`), then upserts with the same revision conflict path.

API contract: [api.md — Project version history](./api.md#project-version-history).

## Image selection toolbar icons

Edit tools share `TOOL_ICON` / `TOOL_STROKE` in `imageToolbarShared.tsx`. Upscale uses `BsBadgeHd`; remove-background uses the shared stroke `ImageRemoveBgIcon` so weight matches Eraser / Mark / HiOutline* neighbors.

## URL state (nuqs)

Adapter: `nuqs/adapters/react-router/v6` inside `BrowserRouter`.

| Param | Surface | Default (cleared from URL) |
|-------|---------|----------------------------|
| `nav` | Home sidebar | `home` |
| `q` | Home project search (wired for URL) | `''` |
| `meTab` | Me: published / liked / assets | `published` |
| `category` | Inspiration feed filter | `all` |
| `tab` | `/account` settings | `profile` |

## Home → editor handoff

Prompt / attachments are **not** put in the URL.

1. Home builds `HomeAgentBoot` (`utils/homeAgentBoot.ts`)
2. `useGoEditor` opens `/editor?createNew=1&fromHomeAgent=1` (login may wrap `?from=`)
3. Boot JSON lives in **`sessionStorage`** (`recombyn-home-agent-boot`); new tab: seed that tab’s storage then navigate
4. `EditorPage` / `AgentDock` `peekHomeAgentBoot` → fill composer; then `clearHomeAgentBoot`

## Redux still owns

Editor **document**, selection, tools, camera-ish UI — local canvas SoT. Do not mirror full project lists into Redux for home/mine.

## Related

- [canvas-architecture.md](./canvas-architecture.md) — paint / Path2D / LOD
- [scene-json-spec.md](./scene-json-spec.md) — persisted document JSON
- [self-hosting.md](./self-hosting.md) — deploy + collab WSS
- [quality-gates.md](./quality-gates.md) — lint / a11y hard gate
