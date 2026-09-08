"use client";

import { Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { profileAvatarUrl } from "@/lib/storage-urls";
import { createClient } from "@/lib/supabase/client";
import { artistName } from "@/lib/visualisations";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function AccountEditor() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const chooseAvatar = (file: File | undefined) => {
    setMessage(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setMessage("Avatar images must be 5 MB or smaller.");
      return;
    }
    setAvatarFile(file);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !profile) return;

    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    let avatarPath = profile.avatar_path;
    const bio = bioDraft ?? profile.bio ?? "";

    if (avatarFile) {
      const path = `${user.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });

      if (uploadError) {
        setMessage(uploadError.message);
        setSaving(false);
        return;
      }

      avatarPath = path;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        bio: bio.trim() || null,
        avatar_path: avatarPath,
      })
      .eq("id", user.id);

    if (error) {
      setMessage(error.message);
    } else {
      await refreshProfile();
      setAvatarFile(null);
      setBioDraft(null);
      setMessage("Profile saved.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user || !profile) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="visamp-surface rounded-2xl border p-6 text-center">
          <h1 className="text-lg font-semibold">Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Log in from the player to manage your artist profile.
          </p>
          <a href="/player" className="mt-5 inline-block text-sm hover:underline">
            Back to the player
          </a>
        </div>
      </main>
    );
  }

  const name = artistName(profile, "Account");
  const avatarUrl = previewUrl ?? profileAvatarUrl(profile);
  const bio = bioDraft ?? profile.bio ?? "";

  return (
    <main className="min-h-dvh bg-background p-6 sm:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Account</h1>
          <a href="/player" className="text-xs text-muted-foreground hover:text-foreground">
            Back to player
          </a>
        </div>

        <form onSubmit={save} className="visamp-surface space-y-6 rounded-2xl border p-6">
          <section className="flex items-center gap-5">
            <Avatar className="h-24 w-24">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={`${name}'s avatar`} />}
              <AvatarFallback className="text-2xl">{name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => chooseAvatar(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-foreground/5"
              >
                <Upload className="h-4 w-4" />
                Choose avatar
              </button>
              <p className="mt-2 text-xs text-muted-foreground">PNG, JPEG, WebP or GIF, up to 5 MB.</p>
            </div>
          </section>

          <label className="block space-y-2 text-sm">
            <span>Username</span>
            <input
              value={profile.username ?? "Not set"}
              readOnly
              className="w-full rounded-md border bg-foreground/5 px-3 py-2 text-muted-foreground"
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span>Artist bio</span>
            <textarea
              value={bio}
              maxLength={1000}
              rows={7}
              onChange={(event) => setBioDraft(event.target.value)}
              placeholder="Tell listeners about yourself and your work."
              className="w-full resize-y rounded-md border bg-transparent px-3 py-2 outline-none focus:border-foreground/40"
            />
            <span className="block text-right text-xs text-muted-foreground">{bio.length}/1000</span>
          </label>

          <div className="flex items-center justify-between gap-4">
            <p aria-live="polite" className="text-xs text-muted-foreground">{message}</p>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save profile
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
