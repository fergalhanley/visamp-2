/**
 * VIS-51 acceptance checks for asset access control, run against a real
 * Supabase project with real user sessions — which is the only way to exercise
 * RLS, the column grants and the storage policies the way production does.
 *
 *   node --env-file=.env.local scripts/verify-asset-access.mjs --confirm
 *
 * IT WRITES TO WHATEVER PROJECT .env.local POINTS AT: three throwaway users on
 * @example.invalid, one asset, one stored object and one visualisation, all
 * removed again in the finally block. Requires SUPABASE_SERVICE_ROLE_KEY.
 * `supabase/tests/assets_access.sql` covers the same ground for a local stack.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";

if (!process.argv.includes("--confirm")) {
  console.error(
    "Refusing to run without --confirm: this creates and deletes users and rows\n" +
    "in the project .env.local points at.",
  );
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
let failed = 0;
const ok = (label, pass, detail = "") => {
  if (pass) passed++; else failed++;
  console.log(`${pass ? "ok  " : "FAIL"} — ${label}${detail ? ` :: ${detail}` : ""}`);
};

const tag = randomUUID().slice(0, 8);
const users = {};
const made = { assets: [], vis: [], objects: [], users: [] };

const png = (w, h) => {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

// Password sign-in is behind captcha on this project, so sessions are minted
// from an admin-generated link instead.
async function makeUser(role) {
  const email = `vis51-verify-${tag}-${role}@example.invalid`;
  const created = await svc.auth.admin.createUser({
    email, password: `Verify-${randomUUID()}`, email_confirm: true,
  });
  if (created.error) throw new Error(`createUser ${role}: ${created.error.message}`);
  made.users.push(created.data.user.id);

  const link = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`generateLink ${role}: ${link.error.message}`);
  const session = await createClient(url, anonKey, { auth: { persistSession: false } })
    .auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (session.error) throw new Error(`verifyOtp ${role}: ${session.error.message}`);

  // The client must hold the session itself: a global Authorization header is
  // overridden by the client's own (empty) auth state, and every request then
  // goes out as anon.
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const applied = await client.auth.setSession({
    access_token: session.data.session.access_token,
    refresh_token: session.data.session.refresh_token,
  });
  if (applied.error) throw new Error(`setSession ${role}: ${applied.error.message}`);
  const who = await client.auth.getUser();
  if (who.data.user?.id !== created.data.user.id)
    throw new Error(`session for ${role} is not the user it should be`);
  return { id: created.data.user.id, client };
}

try {
  for (const role of ["owner", "other", "admin"]) users[role] = await makeUser(role);
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  await svc.from("app_admins").insert({ user_id: users.admin.id });

  // ── Upload, exercising the insert grant and the storage policy as the user ──
  const assetId = randomUUID();
  const key = `${users.owner.id}/${assetId}.png`;
  made.assets.push(assetId);
  made.objects.push(key);
  const bytes = png(800, 600);

  const insert = await users.owner.client.from("assets").insert({
    id: assetId,
    owner_id: users.owner.id,
    kind: "bitmap",
    mime_type: "image/png",
    file_name: "logo.png",
    object_key: key,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  ok("owner can create an asset row", !insert.error, insert.error?.message);
  if (insert.error) {
    // Pending 20260909030000_asset_insert_id_grant.sql. Create the row the way
    // the server would so the rest of the access rules can still be exercised.
    console.log("     (falling back to service role so the remaining checks can run)");
    const fallback = await svc.from("assets").insert({
      id: assetId, owner_id: users.owner.id, kind: "bitmap", mime_type: "image/png",
      file_name: "logo.png", object_key: key, bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (fallback.error) throw new Error(`fallback insert: ${fallback.error.message}`);
  }

  const up = await users.owner.client.storage
    .from("assets")
    .upload(key, bytes, { contentType: "image/png" });
  ok("owner can upload the object at its own key", !up.error, up.error?.message);

  const stolen = await users.other.client.storage
    .from("assets")
    .upload(`${users.owner.id}/${randomUUID()}.png`, bytes, { contentType: "image/png" });
  ok("another user cannot write under the owner's prefix", !!stolen.error,
     stolen.error ? "refused" : "UPLOAD SUCCEEDED");

  // The server marks it ready only after inspecting the stored bytes.
  await svc.from("assets").update({ status: "ready" }).eq("id", assetId);

  // ── Validated bytes are frozen ────────────────────────────────────────────

  // The upload window is open only while the asset is `uploading`; the server
  // claims it before reading it. Without this an uploader could pass validation,
  // overwrite the object, and publish bytes nothing ever inspected.
  const swapped = await users.owner.client.storage
    .from("assets")
    .update(key, png(1, 1), { contentType: "image/png" });
  ok("validated bytes cannot be replaced", !!swapped.error,
     swapped.error ? "refused" : "REPLACE SUCCEEDED");

  // ── Private access ────────────────────────────────────────────────────────
  const otherRead = await users.other.client.from("assets").select("id").eq("id", assetId);
  ok("another user cannot read a private asset",
     !otherRead.error && (otherRead.data ?? []).length === 0,
     otherRead.error?.message ?? `rows=${otherRead.data?.length}`);

  const anonRead = await anon.from("assets").select("id").eq("id", assetId);
  ok("a signed-out visitor cannot read a private asset",
     !anonRead.error && (anonRead.data ?? []).length === 0,
     `rows=${anonRead.data?.length}`);

  const otherObject = await users.other.client.storage.from("assets").download(key);
  ok("another user cannot download a private asset's bytes", !!otherObject.error,
     otherObject.error ? "refused" : "DOWNLOAD SUCCEEDED");

  const ownerRead = await users.owner.client.from("assets").select("id").eq("id", assetId);
  ok("the uploader can read their own private asset", (ownerRead.data ?? []).length === 1);

  // ── Column grants ─────────────────────────────────────────────────────────
  const swap = await users.owner.client
    .from("assets").update({ object_key: `${users.owner.id}/x.png` }).eq("id", assetId);
  ok("an owner cannot swap the bytes behind an asset", !!swap.error,
     swap.error ? "refused" : "UPDATE SUCCEEDED");

  // ── Publishing ────────────────────────────────────────────────────────────
  const publish = await users.owner.client
    .from("assets").update({ visibility: "public" }).eq("id", assetId)
    .select("published_at").maybeSingle();
  ok("publishing stamps published_at",
     !publish.error && !!publish.data?.published_at, publish.error?.message);

  const otherPublic = await users.other.client.from("assets").select("id").eq("id", assetId);
  ok("a public asset is readable by another user", (otherPublic.data ?? []).length === 1);

  const publicObject = await users.other.client.storage.from("assets").download(key);
  ok("a public asset's bytes are downloadable by another user", !publicObject.error,
     publicObject.error?.message);

  await users.owner.client.from("assets").update({ visibility: "private" }).eq("id", assetId);
  const afterUnpublish = await users.other.client.from("assets").select("id").eq("id", assetId);
  ok("unpublishing keeps an already-public asset readable",
     (afterUnpublish.data ?? []).length === 1);
  const discoverable = await users.other.client
    .from("assets").select("id").eq("id", assetId).eq("visibility", "public");
  ok("unpublishing removes it from library discovery",
     (discoverable.data ?? []).length === 0);
  await users.owner.client.from("assets").update({ visibility: "public" }).eq("id", assetId);

  // ── Reference index and the publish rule ──────────────────────────────────
  // `id` is absent from the visualisations insert grant too, so the id is read
  // back rather than chosen — the same way the editor saves.
  const visInsert = await users.owner.client.from("visualisations").insert({
    owner_id: users.owner.id,
    title: "VIS-51 verification",
    source: `render { draw::image(asset::bitmap("${assetId}")) }`,
  }).select("id").maybeSingle();
  ok("owner can save a visual citing an asset", !visInsert.error, visInsert.error?.message);
  const visId = visInsert.data?.id;
  if (!visId) throw new Error("no visualisation to continue with");
  made.vis.push(visId);

  const index = await svc.from("visualisation_assets")
    .select("asset_id").eq("visualisation_id", visId);
  ok("saving a visual indexes the assets its source cites",
     (index.data ?? []).length === 1 && index.data[0].asset_id === assetId,
     JSON.stringify(index.data));

  const goPublic = await users.owner.client
    .from("visualisations").update({ visibility: "public" }).eq("id", visId);
  ok("a visual referencing a public asset can be published", !goPublic.error,
     goPublic.error?.message);

  // A second asset that has never been public must block publication.
  const privateId = randomUUID();
  const privateKey = `${users.owner.id}/${privateId}.png`;
  made.assets.push(privateId);
  await svc.from("assets").insert({
    id: privateId, owner_id: users.owner.id, kind: "bitmap", mime_type: "image/png",
    file_name: "secret.png", object_key: privateKey, bytes: 24,
    sha256: createHash("sha256").update(png(1, 1)).digest("hex"), status: "ready",
  });
  const leak = await users.owner.client.from("visualisations")
    .update({ source: `render { draw::image(asset::bitmap("${privateId}")) }` })
    .eq("id", visId);
  ok("a public visual cannot reference a private asset", !!leak.error,
     leak.error ? leak.error.message.slice(0, 70) : "UPDATE SUCCEEDED");

  // ── Owner deletion takes the bytes with it ────────────────────────────────

  const scratchId = randomUUID();
  const scratchKey = `${users.owner.id}/${scratchId}.png`;
  made.assets.push(scratchId);
  await svc.from("assets").insert({
    id: scratchId, owner_id: users.owner.id, kind: "bitmap", mime_type: "image/png",
    file_name: "scratch.png", object_key: scratchKey, bytes: 24,
    sha256: createHash("sha256").update(png(1, 1)).digest("hex"), status: "ready",
  });

  const directDelete = await users.owner.client
    .from("assets").delete().eq("id", scratchId).select("id");
  ok("a row delete cannot bypass the cleanup outbox",
     !!directDelete.error || (directDelete.data ?? []).length === 0,
     directDelete.error ? "refused" : `rows=${directDelete.data?.length}`);

  const owned = await users.owner.client.rpc("delete_own_asset", { p_asset_id: scratchId });
  ok("the owner can delete an asset that was never public", !owned.error, owned.error?.message);

  const goneRow = await svc.from("assets").select("id").eq("id", scratchId);
  ok("deletion removes the row", (goneRow.data ?? []).length === 0);
  const queued = await svc.from("asset_deletions")
    .select("id,reason").eq("object_key", scratchKey).is("completed_at", null);
  ok("deletion enqueues the object, and the job outlives the row",
     (queued.data ?? []).length === 1 && queued.data[0].reason === "owner_deleted",
     JSON.stringify(queued.data));

  // ── Withdrawal ────────────────────────────────────────────────────────────
  const byUser = await users.other.client.rpc("withdraw_asset", {
    p_asset_id: assetId, p_actor_id: users.other.id, p_replacement_asset_id: null,
  });
  ok("a signed-in non-admin cannot call withdraw_asset", !!byUser.error,
     byUser.error ? "refused" : "RPC SUCCEEDED");

  const byNonAdmin = await svc.rpc("withdraw_asset", {
    p_asset_id: assetId, p_actor_id: users.other.id, p_replacement_asset_id: null,
  });
  ok("withdraw_asset refuses a non-admin actor", !!byNonAdmin.error,
     byNonAdmin.error ? byNonAdmin.error.message.slice(0, 60) : "RPC SUCCEEDED");

  const withdraw = await svc.rpc("withdraw_asset", {
    p_asset_id: assetId, p_actor_id: users.admin.id, p_replacement_asset_id: null,
  });
  ok("an admin can withdraw the asset", !withdraw.error, withdraw.error?.message);

  const goneForOther = await users.other.client.from("assets").select("id").eq("id", assetId);
  ok("a withdrawn asset is unreadable where it was already referenced",
     (goneForOther.data ?? []).length === 0);
  const state = await svc.from("assets")
    .select("status,published_at,withdrawn_at,visibility").eq("id", assetId).maybeSingle();
  ok("a withdrawn asset is fully withdrawn in the database",
     state.data?.withdrawn_at !== null && state.data?.visibility === "private",
     JSON.stringify(state.data));

  const goneAnon = await anon.storage.from("assets").download(key);
  ok("a withdrawn asset's bytes are not downloadable signed-out", !!goneAnon.error,
     goneAnon.error ? "refused" : "DOWNLOAD SUCCEEDED");

  // A viewer who never fetched the object is the honest test of the storage
  // policy. Someone who downloaded it while it was public may still be served a
  // cached copy, and already holds the bytes regardless — which is exactly why
  // publishing is treated as one-way.
  const cold = await makeUser("cold");
  const coldRow = await cold.client.from("assets").select("id").eq("id", assetId);
  ok("a viewer who never saw the asset cannot read it after withdrawal",
     (coldRow.data ?? []).length === 0);
  const coldObject = await cold.client.storage.from("assets").download(key);
  ok("a viewer who never fetched the object cannot download it after withdrawal",
     !!coldObject.error, coldObject.error ? "refused" : "DOWNLOAD SUCCEEDED");

  const outbox = await svc.from("asset_deletions")
    .select("id,reason").eq("asset_id", assetId).is("completed_at", null);
  ok("withdrawal enqueues the object for removal",
     (outbox.data ?? []).length === 1 && outbox.data[0].reason === "withdrawal");

  const preserved = await svc.from("visualisation_assets").select("visualisation_id")
    .eq("asset_id", assetId);
  ok("withdrawal preserves the reference so affected visuals can be found",
     (preserved.data ?? []).length === 1);
} catch (error) {
  failed++;
  console.log(`FAIL — threw :: ${error.message}`);
} finally {
  // Order matters: visualisations cascade the index rows, the outbox references
  // assets, and assets are ON DELETE RESTRICT from the index.
  for (const id of made.vis) await svc.from("visualisations").delete().eq("id", id);
  await svc.from("asset_deletions").delete().is("asset_id", null);
  for (const id of made.assets) {
    await svc.from("asset_deletions").delete().eq("asset_id", id);
    await svc.from("visualisation_assets").delete().eq("asset_id", id);
    await svc.from("assets").delete().eq("id", id);
  }
  if (made.objects.length) await svc.storage.from("assets").remove(made.objects);
  for (const id of made.users) {
    await svc.from("app_admins").delete().eq("user_id", id);
    const gone = await svc.auth.admin.deleteUser(id);
    if (gone.error) console.log(`cleanup FAILED for user ${id}: ${gone.error.message}`);
  }
  const leftAssets = await svc.from("assets").select("id", { count: "exact", head: true });
  const leftVis = await svc.from("visualisation_assets").select("*", { count: "exact", head: true });
  const leftOutbox = await svc.from("asset_deletions").select("*", { count: "exact", head: true });
  console.log(`\ncleanup — assets=${leftAssets.count} visualisation_assets=${leftVis.count} asset_deletions=${leftOutbox.count}`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
