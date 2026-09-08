import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/auth/reset-password">) {
  const { next: requestedNext } = await searchParams;
  const next =
    typeof requestedNext === "string" &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

  return <ResetPasswordForm next={next} />;
}
