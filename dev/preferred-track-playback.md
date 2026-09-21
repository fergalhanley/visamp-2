# Preferred-track playback (VIS-150)

VisAmp hosted audio is the initial source. Restoring remembered local-file names
or a SoundCloud URL does not select or autoplay that source. The suggested
SoundCloud playlist is still available when the listener chooses SoundCloud.

On `/vis` (including direct links), `/player`, `/edit`, and creator previews,
attempt the current visualisation's preferred track when no listener override,
playing audio or pending playback request exists. Active music continues when
switching visuals. Explicit choices remain protected while paused. Browser
user-gesture restrictions still apply: blocked playback retries on interaction.
Unavailable preferred tracks never prevent visual rendering.

In Per Track mode, the ended handler clears the playing state before advancing
visuals. The full player advances its visual context, then starts the new visual's
preferred track. Preview pages own their current visual and reapply its preference
without advancing an unrelated full-player session. A single-item context can
therefore replay the same preference. Without a preferred track, the existing
queue continues. Timed/manual mode retains normal audio queue progression.

A hosted track selected from the general Tracks list is a single-track override.
At Per Track completion it releases control back to visual preferences. Artist,
playlist and favourites playback are collection overrides: they keep their queues
at completion. Files, mic, SoundCloud and explicit silence remain source choices.
Browsing library tabs alone does not select a playback queue.

`musicExplicit` records whether a listener choice currently owns playback;
`selectionScope` distinguishes single track, collection and source lifetimes.
Preferred metadata requests and playback requests use generation guards so old
responses cannot overwrite newer choices. Restoration is claimed before awaiting
saved handles, avoiding duplicate startup loads.

Verification: store regressions cover startup before visual hydration, remembered
SoundCloud, active and pending audio, stale preview/metadata/playback requests,
Per Track ordering and same-visual restart, single-track release, collection and
source protection. Hook tests cover preview lifecycle and completion. Browser
checks used the existing public Sprectrohex preferred track (Outlines) in /vis,
/edit and creator previews. No schema change is needed. No production release was performed; release follows
the normal develop-to-main process.
