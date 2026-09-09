# VisAmp — Visual Assets: Technical Specification

**Status:** implemented for VIS-51 (storage, validation, access control)
**Scope:** storage, upload admission, visibility enforcement, the reference index and withdrawal for user-uploaded bitmap, vector and 3D assets
**Stack:** Next.js (Vercel) · Supabase/Postgres · Supabase Storage

---

## 1. Scope

### In scope (VIS-51)

- Accepted formats and the checks every uploaded byte passes before it is readable
- Storage layout, object keys and catalogue metadata
- Private/public enforcement, including for signed-out visitors
- The visualisation→asset reference index
- Withdrawal that takes an asset out of service everywhere at once

### Owned elsewhere — do not implement here

- **VIS-73** — rights confirmation and its wording, reuse permission, attribution, AI-asset rights, takedown grounds, replacement compatibility policy
- **VIS-52** — library discovery, selection and upload UI
- **VIS-53** — renderer loading and fork behaviour
- **VIS-55** — missing-asset warnings and the 24-hour repair window

### Decisions taken

1. **Supabase Storage, not R2.** Private assets need per-request authorisation, and RLS on `storage.objects` gives exactly that. The hosted-audio pipeline uses R2 because audio egress must bypass Vercel; assets have no such constraint.
2. **One private bucket, no public bucket.** Public assets are served through a read policy rather than a public bucket, so a withdrawal stops reads immediately instead of waiting for a CDN object to disappear.
3. **Publishing is one-way for bytes already served.** `visibility` controls discoverability for *new* references; `published_at` records that the bytes have been public and is never cleared. Unpublishing removes an asset from the library without breaking visuals that already reference it, because bytes served publicly cannot be recalled from copies already distributed.
4. **A public visual may not reference a non-public asset.** Publication is refused, naming the offending files. The alternatives were leaking private bytes or publishing work that renders broken for everyone but its author.
5. **GLB only for 3D.** A `.gltf` model normally points at sibling texture and buffer files we would have no way to store, validate or withdraw alongside it.

---

## 2. Data model

```
assets                id, owner_id → profiles ON DELETE SET NULL,
                      kind ∈ {bitmap, vector, model}, mime_type, file_name,
                      object_key UNIQUE, bytes, sha256,
                      status ∈ {uploading, ready, failed}, error,
                      visibility ∈ {public, private}, published_at,
                      withdrawn_at, withdrawn_by, replacement_asset_id,
                      created_at, updated_at

visualisation_assets  (visualisation_id, asset_id) PK
                      visualisation_id → visualisations ON DELETE CASCADE
                      asset_id         → assets        ON DELETE RESTRICT

asset_deletions       id, asset_id, bucket, object_key,
                      reason ∈ {withdrawal, owner_deleted, failed_upload},
                      attempts, last_error, completed_at, created_at
```

**Modelling decisions:**

- **`owner_id` is nullable and set null on profile delete.** A public asset outlives the account that uploaded it, because other people's visuals reference it; cascading would delete their work out from under them. Assets that were never public are enqueued for object cleanup by a `before delete` trigger on `profiles`.
- **`object_key` is bound to the asset id, not the owner.** A `CHECK` naming `owner_id` would fail on the very `UPDATE` that clears it during account deletion. The owner prefix is enforced instead by the storage insert policy.
- **The reference index is trigger-maintained.** `visualisations.source` is free text written straight to PostgREST by the editor, so no client-side save path can be trusted to keep the index honest. `sync_visualisation_assets` rebuilds it and enforces the publish rule in one trigger, so their order cannot drift.
- **`asset_id` is `ON DELETE RESTRICT`.** Assets go out of service by withdrawal, which preserves the reference so VIS-55 can find and warn the affected visuals.
- **No count or state column is client-writable.** Insert grants name only what an uploader may assert — including `id`, because `object_key` is `<owner>/<asset id>.<ext>` and is written by the same statement, so the uploader has to name the id rather than read back a default. The sole updatable column is `visibility`. In particular `object_key` and `bytes` are not updatable, so the bytes behind a public asset cannot be swapped after the fact.

---

## 3. Upload admission

Bytes are admitted in two steps, because the client controls everything until the server has seen the stored object.

```
POST /api/assets            metadata only — extension, size, checksum
   → row created (status = uploading), object key returned
client uploads to Supabase Storage under the storage insert policy
POST /api/assets/:id/complete
   → claims the asset (uploading → validating), which freezes the object
   → downloads it, verifies it, marks it ready or failed
```

Nothing reads an asset that is not `ready`, and nothing may be published that is not `ready`, so an uninspected object is never visible to anyone but its owner.

**The object is frozen before it is read, not after it is approved.** Storage writes are permitted only while the status is `uploading`, and the claim to `validating` is a conditional update, so it is atomic against a second caller. An earlier version allowed writes for as long as the asset had never been public, which let an uploader pass validation, overwrite the object and then publish bytes nothing had ever inspected. Once an asset is `ready` its bytes never change again.

| Kind | Extensions | Size limit | Content checks |
|---|---|---|---|
| bitmap | png, jpg, jpeg, webp | 20 MB | container identified from its own bytes, must match the extension; dimensions read from the header; ≤ 8192×8192 pixels |
| vector | svg | 2 MB | must be valid UTF-8 containing `<svg>`; refused for scripts, event handlers, `javascript:` URLs, entity declarations, `foreignObject`/embedded media, external references and CSS imports |
| model | glb | 60 MB | glTF 2.0 container, declared length matches the object, chunks aligned and in bounds; every `buffers[]`/`images[]` URI absent or `data:` |

SVG is **rejected, not sanitised**: we store the original bytes, and a sanitiser that silently alters artwork is both harder to trust and harder to explain to the person who uploaded it.

It is also an **allowlist over a tokenizer, not a search for bad substrings**. Pattern matching over raw text let several things through: `<s:script>` is not `<script`, `&#104;ttps://…` is not `https://`, `../x.png` is not `scheme://x`, and `url(//host/x)` has no scheme at all. The parser walks elements and attributes, compares local names with the namespace prefix stripped, decodes character and entity references before judging any URL, and refuses anything it does not positively recognise — so an unfamiliar construct is a rejected file rather than an admitted one. Animation elements are refused outright because they can rewrite an attribute after load, which would defeat every other check.

Bitmap admission walks the whole container rather than the header: a PNG needs IHDR, at least one IDAT and a closing IEND with nothing after it; a JPEG needs its end-of-image marker; a WebP's RIFF length must match the file. A header alone has dimensions but no picture, and would otherwise be admitted, marked ready, and then fail to render for everyone who opened it.

Quotas are 300 assets and 1 GB per account, enforced by an advisory-locked trigger because PostgREST will happily accept concurrent inserts that each pass a naive count check.

---

## 4. Access rules

The read policy is the whole of private/public enforcement:

```sql
owner_id = auth.uid()
or (status = 'ready' and published_at is not null and withdrawn_at is null)
```

- Library discovery **must** filter `visibility = 'public'` explicitly. The policy deliberately keeps unpublished-but-once-public assets readable so existing references survive; that is not the same as offering them for new use. This is the same trap the `unlisted` visibility had (see `20260824090000_drop_unlisted_visibility.sql`).
- The identical condition is repeated as a `storage.objects` select policy, granted to `anon` as well as `authenticated`, so signed-out visitors can load public assets and nothing else.
- Objects are mutable only while the asset has never been public. Replacing the bytes under a published asset would defeat every check made at upload time.

---

## 5. Referencing assets from the DSL

The citation form the index recognises, in both spellings the grammar allows:

```
asset::bitmap("<uuid>")
asset::model(id: "<uuid>")
```

`public.visualisation_asset_references(source)` is authoritative. `lib/assets/references.ts` is a deliberate duplicate so the editor can show dependencies without a round trip; the two are held to the same cases by `scripts/asset-rules.test.mjs`. **The engine-side builtins do not exist yet — they belong to VIS-53.** Until then the index will simply find no citations in real sources.

---

## 6. Withdrawal

`withdraw_asset(asset_id, actor_id, replacement_asset_id)` is the only route. It re-checks `app_admins` itself, so the rule holds even if a caller forgets it, and it is granted to `service_role` only.

Withdrawal stamps `withdrawn_at`, drops the asset from discovery, records an optional replacement (which must be a readable public asset of the same kind), and enqueues the object for deletion. The read policy stops matching immediately, so every visual referencing the asset loses access on next load — this is what "removal applies everywhere" means in practice. The reference index is preserved so VIS-55 can identify and warn the affected visuals.

## 6a. Deleting an asset you own

An asset that has never been public can be deleted by its owner, through `delete_own_asset` and only through it — the direct `DELETE` grant is revoked. Deleting the row on its own would strand the bytes: the row is the only record of what to clean up, and the storage-delete policy authorises against it, so once it is gone nothing can authorise the removal. The function enqueues the object and deletes the row in one transaction. `asset_deletions.asset_id` is nullable and `ON DELETE SET NULL` precisely so the cleanup job outlives the row it came from; `bucket` and `object_key` are all the worker needs.

An asset that has been public is not deletable at all. Those go out of service by withdrawal, which keeps the reference rows VIS-55 depends on.

## 6b. Draining the outbox

Object deletion is an outbox (`asset_deletions`, drained by `processAssetDeletions`) for the same reason as the audio pipeline: storage deletes cannot join the transaction that decided them.

Withdrawal drains its own object opportunistically, but that is not enough on its own: failed uploads, owner deletions, and any withdrawal whose delete errored are only ever cleared by draining the whole outbox. `POST /api/admin/asset-deletions` does that, authorised by `CRON_SECRET` or an admin session, mirroring `/api/admin/audio-deletions`. **It needs to be scheduled** — without a periodic call those jobs sit pending forever and the bytes are paid for indefinitely. Jobs that have failed ten times are skipped so one bad object cannot block the queue behind it.

**Caveat, measured against the live project:** a viewer who had already downloaded the object while it was public can continue to be served a cached copy by the storage CDN after withdrawal, even though the read policy now refuses them. A viewer who never fetched it is refused immediately, and so is a signed-out visitor. Withdrawal therefore stops access, not distribution — the same reason publication is treated as one-way. Draining the deletion outbox promptly is what actually removes the object.

---

## 7. Verifying it

`apps/web/scripts/verify-asset-access.mjs` runs the acceptance checks against a real project with real user sessions, which is the only way to exercise RLS, the column grants and the storage policies as production does:

```
cd apps/web && node --env-file=.env.local scripts/verify-asset-access.mjs --confirm
```

It creates three throwaway users, an asset, an object and a visualisation, and removes them all again. All 27 checks pass.

`supabase/tests/assets_access.sql` covers the access rules against a local stack, where role switching can be done directly rather than through real sessions:

```
supabase db start
docker exec -i supabase_db_visamp-2 psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -q < supabase/tests/assets_access.sql
```

All 15 assertions pass, inside a transaction that is rolled back. Note that `supabase db query -f` cannot run it — it sends the file as one prepared statement and rejects multiple commands.

Two things this caught that unit tests could not: the insert grant on `assets` omitted `id`, which broke the entire upload path (fixed in `20260909030000_asset_insert_id_grant.sql`), and the CDN behaviour described above.

`supabase db advisors --linked --type security` reports no findings against any object added here: every `SECURITY DEFINER` function in this migration is revoked from `anon` and `authenticated`, and the only function exposed to them, `visualisation_asset_references`, is `SECURITY INVOKER` over text the caller supplied.
