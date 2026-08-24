/**
 * A comment body: plain text, with bare URLs turned into links (E5.8).
 *
 * The text is rendered as text — React escapes it — so this never interprets
 * markup, and there is deliberately no markdown. Links carry `nofollow` and
 * `noopener` because a comment box that hands out followed links to anyone
 * with an account is a spam magnet.
 */

// Deliberately conservative: a run starting http(s):// up to the first space,
// with trailing punctuation left out so "see https://x.com." does not link the
// full stop.
const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]}])/g;

export function CommentBody({ body }: { body: string }) {
  const parts = body.split(URL_PATTERN);

  return (
    <p className="whitespace-pre-wrap break-words text-xs text-foreground/90">
      {parts.map((part, index) =>
        // split() with a capturing group puts the matches at the odd indices.
        index % 2 === 1 ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
