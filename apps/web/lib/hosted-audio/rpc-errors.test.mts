/** Run: pnpm test:rpc-errors */
import assert from "node:assert/strict";
import test from "node:test";

import { readableRpcError } from "./rpc-errors.ts";

test("wording we raised on purpose reaches the person", () => {
  assert.equal(
    readableRpcError({ code: "23505", message: "You already have an artist profile." }),
    "You already have an artist profile.",
  );
  assert.equal(
    readableRpcError({ code: "42501", message: "This artist is not linked to your account." }),
    "This artist is not linked to your account.",
  );
});

test("a missing function does not", () => {
  // The exact failure an unapplied migration produces.
  assert.equal(
    readableRpcError({
      code: "PGRST202",
      message:
        "Could not find the function public.accept_self_upload_agreement(p_artist_id, p_user_agent, p_user_id, p_version) in the schema cache",
    }),
    null,
  );
});

test("nor does anything else the database says", () => {
  assert.equal(readableRpcError({ code: "42703", message: "column licences.x does not exist" }), null);
  assert.equal(readableRpcError({ code: "57014", message: "canceling statement due to statement timeout" }), null);
  assert.equal(readableRpcError({ message: "connection refused" }), null);
});
