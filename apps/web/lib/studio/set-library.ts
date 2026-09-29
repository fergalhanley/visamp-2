import type { SetDocument } from "@/lib/sets/model";
import type { Distribution } from "./distributions-model";
import type { StudioSelection } from "./model";
export type SetSort = "date_desc" | "date_asc" | "name_asc" | "name_desc";
export type SetStatus = "not_selected" | "selected" | "draft";
export const setStatusLabels: Record<SetStatus, string> = {
  not_selected: "Not selected",
  selected: "Selected",
  draft: "Draft distribution",
};
export function studioSetStatus(
  id: string,
  distributions: Distribution[],
  selections: StudioSelection[],
): SetStatus {
  if (distributions.some((distribution) => distribution.setId === id))
    return "draft";
  return selections.some((selection) => selection.setId === id)
    ? "selected"
    : "not_selected";
}
export function filterStudioSets(
  sets: SetDocument[],
  distributions: Distribution[],
  selections: StudioSelection[],
  search: string,
  status: "all" | SetStatus,
  order: SetSort,
) {
  const query = search.trim().toLocaleLowerCase();
  return sets
    .filter(
      (set) =>
        (!query ||
          `${set.name} ${set.description}`
            .toLocaleLowerCase()
            .includes(query)) &&
        (status === "all" ||
          studioSetStatus(set.id, distributions, selections) === status),
    )
    .sort((a, b) => {
      const compared = order.startsWith("name")
        ? a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
            numeric: true,
          })
        : Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
      return (
        (order.endsWith("desc") ? -compared : compared) ||
        a.id.localeCompare(b.id)
      );
    });
}
