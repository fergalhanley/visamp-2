import { expect, it } from "vitest";
import { visualisationSaveError } from "./title";
it("explains database title collisions without disguising unrelated failures", () => {
  expect(visualisationSaveError({ code: "23505", message: 'duplicate key violates "visualisations_title_key_unique"' })).toBe("That title is already taken. Choose another name.");
  expect(visualisationSaveError({ message: "Connection lost" })).toBe("Connection lost");
});
