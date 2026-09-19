// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/analytics/server", () => ({ serverEvent: vi.fn(async () => {}) }));
const m=vi.hoisted(()=>({rpc:vi.fn(), identity:vi.fn()}));
vi.mock("@/lib/hosted-audio/uploads",()=>({sameOrigin:()=>{},uploadIdentity:m.identity,uploadError:()=>Response.json({error:"Unavailable"},{status:503})}));
import { POST } from "@/app/api/uploads/artist/route";
function request(name: unknown){return new Request("http://localhost/api/uploads/artist",{method:"POST",body:JSON.stringify({name})});}
beforeEach(()=>{vi.clearAllMocks();m.identity.mockResolvedValue({db:{rpc:m.rpc},userId:"owner"});});
it("returns a safe conflict payload pointing to the existing artist",async()=>{
 m.rpc.mockResolvedValue({data:null,error:{code:"23505",message:"This artist name has already been claimed.",details:JSON.stringify({name:"First Act",slug:"first-act"})}});
 const response=await POST(request("FIRST ACT"));
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({error:"This artist name has already been claimed.",code:"artist_name_claimed",artist:{name:"First Act",slug:"first-act"}});
});
it("allows multiple claims for the authenticated user",async()=>{
 m.rpc.mockResolvedValue({data:{id:"second",name:"Second Act",slug:"second-act"},error:null});
 const response=await POST(request("Second Act"));
 expect(response.status).toBe(200);
 expect(m.rpc).toHaveBeenCalledExactlyOnceWith("claim_music_artist",{p_user_id:"owner",p_name:"Second Act"});
});
it("rejects invalid names before the claim RPC",async()=>{
 expect((await POST(request(" "))).status).toBe(400);
 expect(m.rpc).not.toHaveBeenCalled();
});
it("does not expose raw SQL details for malformed conflicts",async()=>{
 m.rpc.mockResolvedValue({error:{code:"23505",message:"This artist name has already been claimed.",details:"private SQL detail"}});
 const response=await POST(request("Taken"));
 expect(await response.json()).toEqual({error:"This artist name has already been claimed."});
});
