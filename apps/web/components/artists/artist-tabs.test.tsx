import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ArtistTabs } from "./artist-tabs";
afterEach(cleanup);
it("switches between tracks and visualisations without an About tab", () => {
  render(<ArtistTabs tracks={<p>Playable tracks</p>} visualisations={<p>Visualisations using this music</p>} />);
  expect(screen.getByRole("tabpanel").textContent).toBe("Playable tracks");
  fireEvent.click(screen.getByRole("tab", { name: "Visualisations" }));
  expect(screen.getByRole("tabpanel").textContent).toBe("Visualisations using this music");
  expect(screen.queryByRole("tab", { name: "About" })).toBeNull();
});
