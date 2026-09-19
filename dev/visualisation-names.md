# Visualisation names and URLs

Tracking: VIS-137. Titles are globally unique across public work and private
drafts. PostgreSQL NFKC normalization, whitespace collapse and lowercase comparison
define equality; accents remain meaningful. Display titles retain case. Titles
contain 1–120 Unicode characters; line breaks, control and bidi override characters
are rejected. Punctuation, international text and emoji remain allowed.

The migration contains the authoritative word catalogues: 64 visual terms, 256
adjectives and 256 nouns, with no duplicates within a catalogue. New drafts omit
the title and receive `Visual Adjective Noun` (4,194,304 combinations). Forks omit
the title and receive `Base — Adjective Noun`. The stored `lineage_title` prevents
suffix stacking. An intentional rename establishes a new base for later forks.
Long bases are truncated to fit the 120-character limit without losing the suffix.

A private title-claim table uses atomic unique inserts so generated collisions
retry up to 100 times. Explicit conflicting names fail with friendly feedback.
A unique expression index on visualisations remains a second integrity check.
Claims are released on rename/deletion. No availability endpoint exposes private
work or its creator. Source, counters and thumbnail-only writes bypass allocation.

Slugs are generated in PostgreSQL using unaccent, lowercase ASCII letters/digits,
hyphen separators, a 70-character stem and `visualisation` when no ASCII remains.
Different titles that produce the same stem get `-2`, `-3`, etc. UUID-shaped stems
are prefixed `vis-` to keep legacy IDs unambiguous. A private reservation table
retains all allocated addresses, including deleted works and earlier draft names.
Draft renames update the canonical slug until first publication. After publication,
renaming or unpublishing never changes it. Old draft slugs are reserved but do not
redirect; permanent canonical URLs begin with publication.

Database UUIDs remain all internal foreign keys and editor/API identifiers. Public
links, sharing, canonical metadata, the sitemap and player history use the stored
slug through `visualisationPath`. Public legacy UUID URLs redirect permanently;
private UUID URLs redirect temporarily because their draft slugs can still change.
RLS applies to both lookups, so private work stays inaccessible to other visitors.
Browser Back restores actual visited works rather than looking only in fixtures.

## Migration and compatibility

Apply only `20260919020000_visualisation_names.sql`; do not bulk-push old migrations
because hosted migration history is incomplete. The migration checks normalized
uniqueness before changing existing rows and refuses conflicts. Inventory on
2026-09-19 found 64 works, no conflicting names and no invalid controls. Existing
wording is preserved apart from normalization/whitespace cleanup. Slugs are
allocated in creation/id order. Current public works immediately lock their slug.

For the currently deployed older frontend, insert-time `Untitled` requests and
explicit fork labels also request automatic naming. Updates can still intentionally
rename a work to Untitled if available. Apply the database migration before the
new frontend; the older frontend remains compatible. Frontend release to main is
a separate owner-controlled step.

## Verification

`supabase/tests/visualisation_names.sql` is a transactional test for a disposable
migrated database; all fixtures roll back. It covers exact catalogue counts,
normalization, automatic collision retry, forks of forks, title rejection, slug
collisions, publication/rename/unpublication, deleted addresses and long bases.
The migration and assertions also passed against the hosted schema inside a single
rollback-only transaction. Web tests cover friendly errors, canonical metadata,
UUID redirects, private/missing work, URL construction and browser history.

PostgreSQL references: [string normalization](https://www.postgresql.org/docs/17/functions-string.html)
and [unaccent](https://www.postgresql.org/docs/17/unaccent.html).

Validation on 2026-09-19: migration applied individually to the hosted database
and recorded as version `20260919020000`; all 64 existing works have unique slugs.
The final focused web run passed 26 tests and the production webpack build passed.
The full suite had 188 passing tests, two pre-existing billing-link text failures,
and the pre-existing artist claiming suite import failure (`server-only`). Lint
has no errors; the existing landing image and webpack WASM warnings remain.

Browser verification with a temporary account created `Mosaic Leafy Pheasant`,
forked it twice without suffix stacking, rejected a duplicate title with visible
feedback, and cleared that feedback when editing resumed. A public UUID returned
HTTP 308 to its slug, the slug returned 200 with canonical metadata, and the sitemap
contained the slug instead of the UUID. Eight concurrent authenticated inserts of
the same normalized name yielded one success and seven unique conflicts. Attempts
to edit slug columns were denied; anonymous access to a private slug returned no
row. The temporary account, four works, thumbnails and test-only reservations were
removed afterward.
