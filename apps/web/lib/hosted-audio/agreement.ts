/**
 * The non-exclusive agreement an artist accepts to upload their own music.
 *
 * Versioned because acceptance is evidence: a licence records which text was
 * agreed to, so changing the wording later cannot silently rewrite what
 * somebody signed up to. Bump this when the terms change, and existing
 * licences keep pointing at the version they were accepted under.
 */
export const CURRENT_AGREEMENT_VERSION = "2026-09-10";

export const AGREEMENT_SUMMARY = [
  "You own or control the master and publishing rights to these recordings, or have permission from whoever does.",
  "You grant VisAmp a non-exclusive, worldwide licence to host, stream, transcode and synchronise them with visuals.",
  "You can withdraw a track at any time, and the licence ends with it.",
] as const;
