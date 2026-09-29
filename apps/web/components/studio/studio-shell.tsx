"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Plus, Search } from "lucide-react";
import { request } from "@/lib/sets/client";
import { duration, timecode } from "@/lib/sets/model";
import type { StudioSets } from "@/lib/studio/model";
import {
  distributionTargets,
  type Distribution,
  type MasterSettings,
} from "@/lib/studio/distributions-model";
import {
  filterStudioSets,
  setStatusLabels,
  studioSetStatus,
  type SetSort,
  type SetStatus,
} from "@/lib/studio/set-library";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MasterDownloadSettings } from "./master-download-settings";

export function StudioShell() {
  const [data, setData] = useState<StudioSets | null>(null);
  const [distributions, setDistributions] = useState<Distribution[] | null>(
    null,
  );
  const [setId, setSetId] = useState<string | null>(null);
  const [distributionId, setDistributionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<SetSort>("date_desc");
  const [status, setStatus] = useState<"all" | SetStatus>("all");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const lock = useRef(false);
  const activeSetId = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MasterSettings>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      request<StudioSets>("/api/studio/sets"),
      request<{ distributions: Distribution[] }>("/api/studio/distributions"),
    ])
      .then(([sets, result]) => {
        if (active) {
          setData(sets);
          setDistributions(result.distributions);
          setError("");
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load Studio.",
          );
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const dirty = Object.entries(drafts).some(
    ([id, settings]) =>
      JSON.stringify(settings) !==
      JSON.stringify(distributions?.find((item) => item.id === id)?.settings),
  );
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a[href]") &&
        !window.confirm("Leave with unsaved distribution settings?")
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);

  const library =
    data && distributions
      ? filterStudioSets(
          data.sets,
          distributions,
          data.selections,
          search,
          status,
          order,
        )
      : [];
  // Filtering hides the active Set rather than silently pointing its distribution at another one.
  const selectedSet = library.find((set) => set.id === setId) ?? null;
  const configured =
    distributions?.filter((item) => item.setId === selectedSet?.id) ?? [];
  const selectedDistribution =
    configured.find((item) => item.id === distributionId) ?? null;

  async function addMaster() {
    if (!selectedSet || lock.current) return;
    const existing = configured.find(
      (item) => item.target === "master_download",
    );
    if (existing) {
      setDistributionId(existing.id);
      return;
    }
    lock.current = true;
    setPending("add");
    setError("");
    const sourceId = selectedSet.id;
    try {
      const { distribution } = await request<{ distribution: Distribution }>(
        "/api/studio/distributions",
        "POST",
        { setId: sourceId, target: "master_download" },
      );
      setDistributions((current) => [
        distribution,
        ...(current ?? []).filter((item) => item.id !== distribution.id),
      ]);
      if (activeSetId.current === sourceId) setDistributionId(distribution.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add distribution.",
      );
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  async function save(distribution: Distribution, settings: MasterSettings) {
    if (lock.current) return;
    lock.current = true;
    setPending(distribution.id);
    setError("");
    try {
      const result = await request<{ distribution: Distribution }>(
        `/api/studio/distributions/${distribution.id}`,
        "PUT",
        { settings, updatedAt: distribution.updatedAt },
      );
      setDistributions((current) =>
        (current ?? []).map((item) =>
          item.id === distribution.id ? result.distribution : item,
        ),
      );
      setDrafts((current) => {
        if (
          JSON.stringify(current[distribution.id]) !== JSON.stringify(settings)
        )
          return current;
        const next = { ...current };
        delete next[distribution.id];
        return next;
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save distribution.",
      );
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <div className="studio-workspace">
      {error && (
        <div role="alert" className="studio-error">
          {error}
          {!data && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setReload((value) => value + 1);
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
      <div className="studio-columns">
        <section className="studio-column" aria-label="Set library">
          <header className="studio-column-header">
            <h1>Sets</h1>
            <a href="/sets/new" className="studio-action">
              <Plus size={15} /> Create Set
            </a>
          </header>
          <div className="studio-filters">
            <label className="studio-search">
              <Search size={16} />
              <input
                aria-label="Search Sets"
                type="search"
                placeholder="Search Sets…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="studio-settings-pair">
              <label>
                Sort by
                <select
                  value={order}
                  onChange={(event) => setOrder(event.target.value as SetSort)}
                >
                  <option value="date_desc">Date · newest first</option>
                  <option value="date_asc">Date · oldest first</option>
                  <option value="name_asc">Name · A–Z</option>
                  <option value="name_desc">Name · Z–A</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as "all" | SetStatus)
                  }
                >
                  <option value="all">All statuses</option>
                  {Object.entries(setStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="studio-column-body">
            {(!data || !distributions) && !error ? (
              <p role="status" className="studio-empty">
                Loading Sets…
              </p>
            ) : null}
            {data && distributions && !library.length && (
              <p className="studio-empty">
                {data.sets.length
                  ? "No Sets match your filters."
                  : "Create a Set in Set Builder to get started."}
              </p>
            )}
            <ul className="studio-list">
              {library.map((set) => (
                <li key={set.id}>
                  <button
                    type="button"
                    className="studio-card"
                    aria-pressed={selectedSet?.id === set.id}
                    onClick={() => {
                      activeSetId.current = set.id;
                      setSetId(set.id);
                      setDistributionId(null);
                    }}
                  >
                    <strong>{set.name}</strong>
                    <span className="studio-muted">
                      {timecode(duration(set))} · Updated{" "}
                      {new Date(set.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="studio-badge">
                      {
                        setStatusLabels[
                          studioSetStatus(
                            set.id,
                            distributions!,
                            data!.selections,
                          )
                        ]
                      }
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <footer className="studio-column-footer">
            <a href="/sets">Open Set Builder</a>
            {data && (
              <span>
                {library.length} of {data.sets.length} Sets
              </span>
            )}
          </footer>
        </section>
        <section className="studio-column" aria-label="Set distributions">
          <header className="studio-column-header">
            <h2>Distributions</h2>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="studio-action"
                disabled={!selectedSet || pending !== null}
              >
                <Plus size={15} /> Add distribution <ChevronDown size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56">
                {distributionTargets.map((target) => (
                  <DropdownMenuItem
                    key={target.id}
                    disabled={!target.available}
                    onClick={
                      target.available ? () => void addMaster() : undefined
                    }
                  >
                    {target.label}
                    {!target.available && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Coming later
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {selectedSet && (
            <div className="studio-context">
              <strong>{selectedSet.name}</strong>
              <a href={`/sets/${selectedSet.id}/edit`}>
                Edit / preview in Set Builder
              </a>
            </div>
          )}
          <div className="studio-column-body">
            {!selectedSet ? (
              <p className="studio-empty">
                Select a Set to see its distributions.
              </p>
            ) : configured.length === 0 ? (
              <p className="studio-empty">
                No distributions yet. Add Master Downloads to set up a
                downloadable video.
              </p>
            ) : (
              <ul className="studio-list">
                {configured.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="studio-card"
                      aria-pressed={selectedDistribution?.id === item.id}
                      onClick={() => setDistributionId(item.id)}
                    >
                      <strong className="flex items-center gap-2">
                        <Download size={16} /> Master Downloads
                      </strong>
                      <span className="studio-muted">
                        {item.settings.resolution} · {item.settings.frameRate}{" "}
                        fps · {item.settings.format.toUpperCase()}
                      </span>
                      <span className="studio-badge">
                        Draft
                        {drafts[item.id] &&
                        JSON.stringify(drafts[item.id]) !==
                          JSON.stringify(item.settings)
                          ? " · Unsaved changes"
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pending === "add" && (
              <p role="status" className="studio-empty">
                Adding Master Downloads…
              </p>
            )}
          </div>
        </section>
        <section className="studio-column" aria-label="Distribution settings">
          <header className="studio-column-header">
            <h2>Settings</h2>
          </header>
          <div className="studio-column-body">
            {selectedSet && selectedDistribution ? (
              <MasterDownloadSettings
                distribution={selectedDistribution}
                set={selectedSet}
                settings={
                  drafts[selectedDistribution.id] ??
                  selectedDistribution.settings
                }
                dirty={
                  !!drafts[selectedDistribution.id] &&
                  JSON.stringify(drafts[selectedDistribution.id]) !==
                    JSON.stringify(selectedDistribution.settings)
                }
                saving={pending === selectedDistribution.id}
                onChange={(settings) =>
                  setDrafts((current) => ({
                    ...current,
                    [selectedDistribution.id]: settings,
                  }))
                }
                onSave={() =>
                  void save(
                    selectedDistribution,
                    drafts[selectedDistribution.id] ??
                      selectedDistribution.settings,
                  )
                }
              />
            ) : (
              <p className="studio-empty">
                Select a distribution to configure it.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
