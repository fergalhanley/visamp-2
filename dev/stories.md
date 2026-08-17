# VisAmp — System & UI Design + Tech Stories

**Domain:** visamp.io
**What it is:** Community-built music visualisations. Anyone can watch; you sign up to create.
**Stack:** Next.js (App Router) on Vercel · Supabase (Postgres, Auth, Storage, Edge Functions) · Rust DSL interpreter compiled to WASM, delivered as an embeddable React component · WebGL canvas.

---

## 1. Product principles

These are load-bearing. Every story below inherits them.

1. **The visualisation is the page.** One full-viewport canvas for the whole session. Chrome floats over it. Nothing ever reflows or resizes the canvas.
2. **Chrome is earned, not given.** At rest the screen is the visualisation alone. Cursor movement reveals the chrome; idle fades it back out.
3. **The player owns the session, not the page.** Browsing swaps the visualisation into a live engine. The engine never remounts and the audio source survives every transition.
4. **VisAmp hosts no music.** Audio comes from the viewer's own microphone or their own local files. Nothing is uploaded, nothing is streamed from us.
5. **Watching is anonymous. Creating is not.** Social affordances are always visible to logged-out visitors and gate on click, never hidden.
6. **Desktop creates, mobile watches.** `/edit` is desktop-only.

---

## 2. Layout

```
┌────────────────────────────────────────────────────────────────┐
│                    ┌──────────────────────┐                    │
│                    │  Vis Title — Artist  │   ← top centre     │
│                    └──────────────────────┘     (hover expands │
│                                                  to actions)   │
│   ╱╲                                                    ╲  ╱   │
│  ╱  ╲  V glyph                              A glyph      ╲╱    │
│      (hover → browse panel                (hover → audio panel │
│       slides in from left)                 slides in from right)│
│                                                                │
│                    ┌──────────────────────┐                    │
│                    │   ⏮   ▶   ⏭          │   ← bottom centre  │
│                    │  ▓▓▓▓▓▓▓░░░░░░░░░░   │     10vh from base │
│                    │  Track name          │                    │
│                    └──────────────────────┘                    │
└────────────────────────────────────────────────────────────────┘
```

**V panel (left)** — browse. Header: VisAmp logo + wordmark, login link (→ account dropdown when signed in). Then player mode controls. Then search filter. Then tabs.

**A panel (right)** — audio. Mic toggle, then local file controls / tracklist manager.

Both panels **overlay** the canvas with a translucent, blurred backdrop. Both can be open at once. Hover opens; the panel stays open while the cursor is over it and hides when the cursor returns to the canvas.

---

## 3. Engine component contract

The Rust interpreter is built in a separate workstream. This is the seam. **Pin it before building anything that depends on it** — the editor, thumbnail capture, the code log and the audio-reactive badge all block on this interface.

```ts
<VisampCanvas
  source={string}                    // DSL source
  audioSource={AnalyserNode | null}  // null ⇒ time-driven
  playing={boolean}
  quality={'low' | 'high'}
  onCompileResult={(r: CompileResult) => void}
  onLog={(e: LogEntry) => void}
  onFpsSample={(fps: number) => void}
  ref={ref}                          // ref.compile(src) | ref.captureFrame() | ref.reset()
/>

type CompileResult = {
  ok: boolean
  diagnostics: { severity, message, line, column }[]
  usesAudio: boolean               // drives the tile badge
}
type LogEntry = { level: 'info'|'warn'|'error', message: string, line?: number }
```

Two non-negotiables: **diagnostics carry line and column** (or the editor cannot underline errors), and **`captureFrame()` returns a Blob at a fixed 1280×720** regardless of on-screen canvas size (or thumbnails inherit whatever window the author happened to have open).

---

## 4. Data model

```
profiles          id (= auth.users.id), username UNIQUE, display_name,
                  avatar_url, bio, created_at
                  + vis_count, follower_count, total_views   [trigger-maintained]

visualisations    id, owner_id, title, description, source,
                  thumb_url, thumb_pinned, uses_audio,
                  visibility ∈ {public, unlisted, private},
                  forked_from_id → visualisations ON DELETE SET NULL,
                  created_at, updated_at
                  + like_count, view_count, fork_count, comment_count

likes             (user_id, vis_id) PK, created_at
follows           (follower_id, followee_id) PK, created_at
comments          id, vis_id, author_id, body, created_at, deleted_at
playlists         id, owner_id, title, created_at
playlist_items    (playlist_id, vis_id) PK, position
vis_views         vis_id, viewer_hash, day    UNIQUE (vis_id, viewer_hash, day)
```

**Modelling decisions:**

- **One heart.** Favourite and like are the same row. The Favourites section is a query over `likes`; the Liked playlist is *virtual*, not a `playlists` row — it can't be renamed, deleted or reordered.
- **Counters are denormalised and trigger-maintained.** Artist tiles need aggregate views across all of an artist's work; computing that live on every panel render doesn't scale. **No count column is ever client-writable.**
- **Views go through an Edge Function**, never a client insert. It derives `viewer_hash` from a salted anonymous id + IP; the unique index does 24h dedupe for free. Client-side inserts make your primary ranking signal forgeable with a `for` loop.
- **Unlisted is not an RLS feature.** RLS cannot distinguish "has the link" from "guessed the id". Read policy is `visibility IN ('public','unlisted') OR owner_id = auth.uid()`, and **browse queries filter to `public` explicitly**. Relying on RLS alone will surface unlisted work in the panel.
- **Fork is an INSERT, never an UPDATE.** `UPDATE/DELETE USING owner_id = auth.uid()` is the entire enforcement of "can't save over another's art". `forked_from_id` is not user-editable, which makes attribution non-removable.

---

## 5. Epics & stories

Seven epics (grew by one — profiles/permalinks earned separation from social). **E1 first**, since E5, E6 and parts of E3 block on it.

### E1 — Engine wrapper

| # | Story | Acceptance |
|---|---|---|
| E1.1 | `<VisampCanvas>` React wrapper around the WASM interpreter | Mounts, compiles source, renders to WebGL, fills its container |
| E1.2 | Hot-swap source without remount | Changing `source` recompiles and swaps; elapsed time and audio binding are preserved, no black frame |
| E1.3 | Compile diagnostics surfaced | `onCompileResult` fires with `ok`, `diagnostics[]` (line + column), `usesAudio` |
| E1.4 | Runtime log stream | `onLog` emits info/warn/error with optional line reference |
| E1.5 | Fixed-resolution frame capture | `ref.captureFrame()` resolves a 1280×720 Blob regardless of display size |
| E1.6 | Audio ingestion | Accepts an `AnalyserNode`; renders time-driven when `audioSource` is null |
| E1.7 | Graceful no-WebGL state | Missing/failed WebGL context shows a poster fallback rather than a blank canvas |

### E2 — Shell & player chrome

| # | Story | Acceptance |
|---|---|---|
| E2.1 | Full-viewport canvas shell | Engine sits above the router; navigation never remounts it |
| E2.2 | Idle chrome fade | Cursor movement reveals chrome; idle (~3s) fades it out; a hovered panel never fades |
| E2.3 | V and A glyphs | Faded glyphs at left and right edges, always faintly visible as affordances |
| E2.4 | Panel reveal | Hovering near a glyph slides the panel in as an **overlay** (translucent + blur); it stays open while the cursor is over it and hides on return to canvas |
| E2.4a | Focus exception | A panel whose text input holds focus does **not** close on mouse-leave (protects search entry and comment drafts) |
| E2.5 | Both panels concurrent | V and A can be open simultaneously; canvas dimensions never change |
| E2.6 | Now-playing title | Top-centre `Vis Title — Artist Name`; title → `/vis/<id>`, artist → `/artist/<username>` |
| E2.7 | Title hover actions | Hover expands a second line: ♥ likes · 💬 comments · ⑂ forks · ↗ share. Fork reads "Open in editor" when the viewer owns it |
| E2.8 | Landing poster | SSR shell with logo, title and play button over a static poster; WASM boots behind it and crossfades in on click |
| E2.9 | Cold-link play gate | Arriving at `/vis/<id>` from an external link shows title + play button; the click is the gesture that starts audio and render |
| E2.10 | Swap-in-place navigation | Selecting a visualisation swaps source into the live engine and pushes `/vis/<id>` via History API — no remount, audio source preserved |
| E2.11 | Mobile viewer | Tap-to-reveal replaces hover; panels become bottom sheets with drag handles; `/edit` shows a desktop-required state |

### E3 — V panel (browse)

| # | Story | Acceptance |
|---|---|---|
| E3.1 | Panel header | VisAmp logo + wordmark; login link right-aligned, becoming an account dropdown when signed in |
| E3.2 | Player mode controls | Directly under the header: mode = `track-audio` \| `time-interval` \| `manual`; interval picker (10s/20s/30s/1m/2m/5m/10m) enabled only in time-interval; shuffle toggles for tracks and for visualisations |
| E3.3 | Mode indicator in transport | A compact mode marker in the transport bar, since in `track-audio` mode next/prev also change the visualisation |
| E3.4 | Search filter | Text input filters whichever list is displayed below |
| E3.5 | Tabs | Visualisations · Artists · (signed in) `<username>` |
| E3.6 | Visualisation tile | 16:9 thumb, title, artist beneath; audio-reactive badge right-aligned to the artist name — **static, tooltip only, no expansion**; fixed height |
| E3.7 | Artist tile | Avatar left; name, artwork count, total views |
| E3.8 | User tab | Expandable sections: Visualisations · Favourites · Playlists (Liked appears first and is undeletable) |
| E3.9 | Virtualised lists | Fixed-height rows; smooth at 1000+ items |
| E3.10 | Playlist context | Selecting a tile sets the playing context; mode + shuffle advance within that context |

### E4 — A panel (audio)

| # | Story | Acceptance |
|---|---|---|
| E4.1 | Mic toggle | Requests permission **only** on explicit click, never on load; shows an input level meter when live |
| E4.2 | Mic guidance | Inline hint covering the headphones case (no speaker output ⇒ no reaction) |
| E4.3 | Local file picker | Add files to the tracklist; format support surfaced clearly |
| E4.4 | Tracklist manager | Reorder, remove, clear; current track highlighted |
| E4.5 | File persistence | Persist handles via File System Access API where supported; elsewhere persist names + order and prompt to re-add. Popup recommends Chromium when it isn't detected |
| E4.6 | Transport | Bottom centre, 10vh from base: prev · play/pause · next; scrub bar below; track name below that |
| E4.7 | Silent default | `Silent` (time-driven) is the default source; every visualisation must run without audio |
| E4.8 | Source is session-scoped | The chosen source persists across visualisation changes for the whole session |

### E5 — Auth & social

| # | Story | Acceptance |
|---|---|---|
| E5.1 | Supabase auth | Google, Facebook, email |
| E5.2 | Captcha | Turnstile on email signup and password reset; login only after repeated failures |
| E5.3 | Username claim | Unique username at first sign-in; drives `/artist/<username>` |
| E5.4 | Gate-on-click | Heart, follow and comment are visible when logged out; clicking opens auth and the intent replays after the OAuth round trip |
| E5.5 | Like | Toggles a `likes` row; count updates optimistically |
| E5.6 | Follow | Toggles a `follows` row from artist tile, profile and title cluster |
| E5.7 | Comments panel | Comment count pushes a comments view **into the V panel stack** with a back arrow; the list beneath is preserved |
| E5.8 | Comment behaviour | Flat, newest first, plaintext with autolinking; anonymous read, authenticated write; rate-limited |
| E5.9 | Moderation | Report any comment; vis owner can delete comments on their own work; soft delete |
| E5.10 | Playlists | Create, rename, delete, add/remove, reorder. Liked is virtual and immutable |
| E5.11 | View counting | Edge Function fires after 5s of active render; deduped per (vis, viewer, day); excludes the landing logo and self-views |

### E6 — Editor (`/edit/<vis id>`)

| # | Story | Acceptance |
|---|---|---|
| E6.1 | Page frame | Thin top menubar with logo and room for future links |
| E6.2 | Split layout | Left ~30% editor, right ~70% preview + log; the divider is drag-resizable and the ratio persists |
| E6.3 | Preview sizing | Preview holds 16:9 sized to fit its column; the log occupies all remaining height below it |
| E6.4 | Code editor | DSL syntax highlighting; error squiggles positioned from diagnostic line/column |
| E6.5 | Live render | Debounced (~200ms) recompile and hot-swap; a failed compile keeps the last good render on screen |
| E6.6 | Code log | Streams `onLog` entries; collapsible; auto-opens on error; clickable line references jump the cursor |
| E6.7 | Local drafts | Every keystroke autosaves to IndexedDB keyed by vis id, valid or not; drafts recovered on return |
| E6.8 | Save gate | Save is enabled only on a successful compile result |
| E6.9 | Server validation | Save calls an Edge Function running the same parser; malformed source is rejected regardless of client state |
| E6.10 | Thumbnail capture | "Capture frame" pins the current frame as the thumb; otherwise a frame is captured automatically on save |
| E6.11 | Fork | Fork from any visualisation including other artists'; creates a copy owned by the forker with `forked_from_id` set; likes/views/forks do not carry over |
| E6.12 | Ownership | Editing your own work saves in place and goes live immediately, regenerating the thumb unless one is pinned; another artist's work is read-only and offers Fork |
| E6.13 | Metadata | Title, description, visibility (public/unlisted exposed in MVP) |
| E6.14 | Audio in editor | The same audio source and transport are available while editing |

### E7 — Profiles & permalinks

| # | Story | Acceptance |
|---|---|---|
| E7.1 | `/artist/<username>` | Avatar, name, bio, counts, follow button, grid of public work |
| E7.2 | `/account` | Profile editing, avatar upload, following / followers lists, own visualisations |
| E7.3 | `/vis/<id>` SSR | Server-rendered title, artist, description and poster; hydrates into the live engine |
| E7.4 | OG cards | Open Graph and Twitter card metadata using the stored thumbnail so shared links unfurl |
| E7.5 | Crawlable shell | Real HTML behind the canvas on landing and permalink routes; sitemap covering public work |
| E7.6 | Visibility handling | Private returns 404 to non-owners; unlisted is reachable by link but excluded from all browse queries and the sitemap |

---

## 6. Deliberately out of scope for MVP

AI generation (prompt-to-DSL, planned as an editor mode later) · hosted music of any kind · the local Windows/Mac audio bridge app · performance flagging of heavy scripts · threaded comments · animated tile previews · version history (fork is a copy, not version control) · mobile editing.
