# New visualisation starter prompts (VIS-140)

The successful POST `/edit` redirect includes a transient `#starter-prompt` marker.
After the editor loads the saved row (including its generated title), it selects
one of ten templates in `lib/editor/starter-prompts.ts`, inserts the title literally,
and initializes the editable prompt. Every template allows 2D or 3D and asks for
audio-reactive movement, color, or both. It never submits a generation automatically.

The marker is removed with the Next-integrated History API after a successful
load. Failed loads retain it for retry. Existing/forked documents use their normal
unmarked URLs; reopening does not repopulate the prompt. The initial value is set
once, so later title changes or rerenders cannot overwrite edits or undo clearing.
This suggestion is transient editor state, not saved visualisation content.

Clear Prompt is an accessible text-style button immediately after Generate.
It works without credits and is disabled for empty prompts, read-only documents,
and in-flight generation. There is no database migration or additional API call.
