# Editor document freshness (VIS-133)

`/edit/[id]` passes only the visualisation ID to `EditorDocument`. Each mount
fetches `/api/editor/[id]` with `cache: no-store` before mounting `EditorShell`,
CodeMirror or the preview. The API also returns `Cache-Control: private, no-store`
and reads through the authenticated Supabase client/RLS. Editing permission is
computed from the verified user and returned owner; missing/inaccessible documents
retain the existing empty-editor behaviour.

Do not put mutable source back into cached page props. Calling `router.refresh()`
after direct browser writes alone did not resolve the reported browser-history
failure. CodeMirror and the preview both initialise from the entry document, so
freshness must be established before either mounts. Read failures show a retry
screen, never an editable fallback containing old source. Responses for an old ID
or an unmounted entry are discarded.

A browser BFCache restore may resume the entire heap without remounting React.
`pageshow` with `persisted=true` therefore reloads the document: this reruns the
fresh read and gives the singleton WASM renderer a fresh host. Keep native full-page
links when crossing editor/player boundaries; a client-only remount cannot safely
rebind the existing singleton renderer. Ordinary route refreshes while typing do
not re-fetch or replace the editor buffer.

Verification: API tests cover ownership, no-store and failed reads; entry tests
cover remount freshness, retry and stale-response rejection. Browser verification
uses the real `/edit/[id]`, CodeMirror and renderer with isolated API fixtures:
edit/save, follow Upload Music, Back, inspect source and rendered scene. Dispatching
a persisted `pageshow` verifies the fresh-document path separately. Browser fixtures
do not write real user visualisations.
