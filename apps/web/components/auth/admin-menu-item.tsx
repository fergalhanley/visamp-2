"use client";
import { useEffect, useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
export function AdminMenuItem() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/access", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(
        async (response) =>
          response.ok && (await response.json()).admin === true,
      )
      .then((allowed) => {
        if (!controller.signal.aborted) setAdmin(allowed);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return admin ? (
    <DropdownMenuItem nativeButton={false} render={<a href="/admin" />}>
      Site administration
    </DropdownMenuItem>
  ) : null;
}
