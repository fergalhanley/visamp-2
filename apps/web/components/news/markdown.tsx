import Image from "next/image";
import Markdown, { defaultUrlTransform } from "react-markdown";

/** Same renderer for admin preview and public posts. Raw HTML/embeds never run. */
export function NewsMarkdown({ body }: { body: string }) {
  return (
    <div className="space-y-5 break-words leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_h2]:text-2xl [&_h2]:text-foreground [&_h3]:text-xl [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_strong]:text-foreground">
      <Markdown
        skipHtml
        urlTransform={(url, key) => {
          if (key === "src")
            return /^\/api\/news\/images\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(
              url,
            )
              ? url
              : "";
          return defaultUrlTransform(url);
        }}
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          img: ({ src, alt }) =>
            typeof src === "string" && src ? (
              <Image
                src={src}
                alt={alt ?? ""}
                width={2000}
                height={2000}
                unoptimized
                className="my-5 h-auto max-h-[640px] w-auto max-w-full rounded-xl"
              />
            ) : null,
          a: ({ href, children }) => (
            <a href={href} rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
