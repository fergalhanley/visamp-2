"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- full navigation releases player resources */
import { useEffect, useRef, useState } from "react";
import { barButton, barButtonGreen } from "@/components/chrome/bar-button";
import { TopBar } from "@/components/chrome/top-bar";
import { request, resolveSet } from "@/lib/sets/client";
import {
  type SetDocument,
  duration,
  timecode,
  validate,
} from "@/lib/sets/model";
import { track } from "@/lib/analytics/client";
export function SetList({ create = false }: { create?: boolean }) {
  const [sets, setSets] = useState<SetDocument[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    void (async () => {
      for (const set of sets) {
        try {
          const resolved = await resolveSet(set);
          if (active)
            setReadiness((old) => ({
              ...old,
              [set.id]: !validate(set, resolved.unavailable).some(
                (i) => i.severity === "error",
              ),
            }));
        } catch {
          if (active) setReadiness((old) => ({ ...old, [set.id]: false }));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [sets]);
  const creating = useRef<Promise<SetDocument> | null>(null);
  useEffect(() => {
    if (create) {
      creating.current ??= request<SetDocument>("/api/sets", "POST", {});
      void creating.current
        .then((s) => {
          track("set_created");
          location.replace(`/sets/${s.id}/edit`);
        })
        .catch((e) => setError(e.message));
    } else
      void request<{ sets: SetDocument[] }>("/api/sets")
        .then((d) => setSets(d.sets))
        .catch((e) => setError(e.message));
  }, [create]);
  async function action(s: SetDocument, type: "duplicate" | "delete" | "vj") {
    setBusy(true);
    setError("");
    try {
      if (type === "delete") {
        if (!confirm(`Delete “${s.name}”? This cannot be undone.`)) return;
        await request(`/api/sets/${s.id}`, "DELETE");
        setSets((old) => old.filter((v) => v.id !== s.id));
      } else if (type === "duplicate") {
        const copy = await request<SetDocument>("/api/sets", "POST", {
          duplicateId: s.id,
        });
        setSets((old) => [copy, ...old]);
      } else {
        const resolved = await resolveSet(s);
        const issues = validate(s, resolved.unavailable);
        if (issues.some((i) => i.severity === "error")) {
          setError(issues.map((i) => i.message).join(" "));
          return;
        }
        if (
          issues.length &&
          !confirm(issues.map((i) => i.message).join("\n") + "\nOpen VJ Mode?")
        )
          return;
        location.assign(`/vj-mode?set=${s.id}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sets-app">
      <TopBar
        position="static"
        actions={
          <a className={`${barButton} ${barButtonGreen}`} href="/sets/new">
            New Set
          </a>
        }
      />
      <main className="sets-list">
        <header>
          <div>
            <small>YOUR PROGRAMMES</small>
            <h1>My sets</h1>
          </div>
        </header>
        {error && <p role="alert">{error}</p>}
        {create ? (
          <p>Creating set…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Duration</th>
                <th>Last edited</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{timecode(duration(s))}</td>
                  <td>{new Date(s.updatedAt).toLocaleString()}</td>
                  <td>
                    {readiness[s.id] === undefined
                      ? "Checking…"
                      : readiness[s.id]
                        ? "Ready"
                        : "Draft"}
                  </td>
                  <td>
                    <a href={`/sets/${s.id}/edit`}>Edit</a>
                    <button
                      disabled={busy}
                      onClick={() => void action(s, "vj")}
                    >
                      Open in VJ Mode
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void action(s, "duplicate")}
                    >
                      Duplicate
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void action(s, "delete")}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!create && !sets.length && !error && (
          <p>Create a set to arrange music and visualisations.</p>
        )}
      </main>
    </div>
  );
}
