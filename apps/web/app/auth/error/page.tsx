import Link from "next/link";

export default async function AuthErrorPage({
  searchParams,
}: PageProps<"/auth/error">) {
  const { reason } = await searchParams;

  return (
    <main className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="visamp-surface w-full max-w-sm rounded-2xl border p-6 text-center">
        <h1 className="text-base font-semibold">Sign-in failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {typeof reason === "string" && reason
            ? reason
            : "That sign-in link is no longer valid."}
        </p>
        <Link
          href="/"
          className="mt-5 inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to the player
        </Link>
      </div>
    </main>
  );
}
