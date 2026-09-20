# News publishing (VIS-149)

Open `/admin` → **Manage News**, or `/admin/news`. Access uses the existing
`app_admins` membership. No additional CMS, API keys or service are needed.

1. Choose **New post**, enter a title and write Markdown.
2. **Save draft** to keep work private and enable image uploads.
3. Add an image description and upload a JPG, PNG or WebP (up to 3 MB).
   The editor inserts its Markdown at the cursor. Save the post after uploading.
4. **Preview** uses the same renderer as the public page. Supported formatting
   includes headings, bold, italics, lists, quotes, code and links. HTML, scripts,
   embeds and remote images are disabled; upload images through the editor.
5. **Publish** makes the post available at `/site/news`. **Save published changes**
   updates it immediately. **Unpublish** makes it a private draft again.

Posts are ordered by their first publication date, newest first, ten per page.
Republishing retains that date. Title changes do not affect image addresses.
Unsaved content is not automatically persisted. Switching posts prompts before
losing unsaved changes; browser unload protection is also enabled. A stale save
returns a conflict rather than overwriting another administrator’s version.

## Storage and access

Apply only `supabase/migrations/20260920020000_news.sql` before deploying the web
change. It was applied individually to the linked database after rollback tests;
older hosted migration history is incomplete, so do not bulk-push migrations.

`news_posts` uses RLS: anonymous and signed-in readers can select only published
posts; direct client writes are forbidden. Authenticated admin route handlers use
the service-role client after checking membership. No public draft query exists.
The runtime News page uses an anonymous client and `connection()` and is not
prerendered or cached across requests. Content updates need no deployment.

`news-images` is a private Supabase Storage bucket with no client upload/read
policies. The API validates size/type, decodes and converts uploads to WebP,
removes metadata, and limits dimensions. Images belong to a saved post. The image
route serves bytes only when the post is published or the requester is an admin.
It uses `private, no-store`, and Next Image is unoptimized for this route so the
image optimizer cannot cache draft bytes or omit authentication cookies.
Unpublishing removes future anonymous image access; already downloaded copies
cannot be recalled. Removing image Markdown does not delete stored files. Unused
uploads can be removed manually from Storage; there is no automatic cleanup or
revision history in this small editor.

## Verification

- `supabase/tests/news.sql`: RLS reads/writes, publication constraints, timestamp
  version updates, unpublish and private bucket assertions (rollback fixtures).
- `lib/news/routes.test.ts`: admin boundaries, validation, origin checks, image
  access and stale-save conflict. `components/news/markdown.test.tsx`: formatting,
  uploaded images, HTML/script/unsafe URL and remote-image rejection.
- Full web suite: 265 tests passed. Targeted ESLint and TypeScript passed.
- Production webpack build passed (existing async-WebAssembly target warning).
  Turbopack cannot build this symlinked task worktree because dependencies are
  outside its filesystem root, so verification used the configured webpack fallback.
- Browser: draft creation, image upload/preview, anonymous draft exclusion and
  image 404, publication with loaded image, editing published content, unpublishing
  and image 404 again. Desktop/mobile layout checked. Temporary test data removed.

Renderer: [react-markdown](https://github.com/remarkjs/react-markdown), with raw HTML
skipped and image URLs restricted to the News image route. Public content is
server-rendered; the editor uses the same component for preview.
