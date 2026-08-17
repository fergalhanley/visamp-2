"use client";

import { LogOut, User as UserIcon, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { UsernameClaimDialog } from "@/components/auth/username-claim-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * E3.1 — the panel header's login link, which becomes an account dropdown once
 * signed in.
 */
export function AccountMenu() {
  const { user, profile, loading, needsUsername, signOut } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [claimRequested, setClaimRequested] = useState(false);
  const [claimDismissed, setClaimDismissed] = useState(false);

  // E5.3 — prompts itself the first time someone arrives without a username,
  // then stays shut if they dismiss it. Derived rather than an effect, so
  // there is no render pass where the dialog is briefly in the wrong state.
  // Claiming a name flips `needsUsername` false, which closes it on its own.
  const claimOpen = claimRequested || (needsUsername && !claimDismissed);

  const setClaimOpen = (open: boolean) => {
    setClaimRequested(open);
    if (!open) setClaimDismissed(true);
  };

  if (loading) {
    return <span className="h-5 w-12 animate-pulse rounded bg-foreground/10" />;
  }

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSignInOpen(true)}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Log in
        </button>
        <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      </>
    );
  }

  const name = profile?.username ?? profile?.display_name ?? user.email ?? "Account";
  const initial = name.charAt(0).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground">
          <Avatar className="h-6 w-6">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
          </Avatar>
          <span className="max-w-24 truncate">{name}</span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Base UI composes via `render`, not Radix's `asChild`. */}
          {profile?.username ? (
            <DropdownMenuItem
              nativeButton={false}
              render={<Link href={`/artist/${profile.username}`} />}
            >
              <UserIcon className="h-3.5 w-3.5" />
              Your profile
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setClaimOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Choose a username
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UsernameClaimDialog open={claimOpen} onOpenChange={setClaimOpen} />
    </>
  );
}
