import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClaimArtistForm } from "./claim-artist-form";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("adds an artist and returns it for selection", async () => {
 const artist={id:"second",name:"Second Act",slug:"second-act"};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({artist})));
 const claimed=vi.fn();
 render(<ClaimArtistForm onClaimed={claimed} onCancel={vi.fn()} />);
 fireEvent.change(screen.getByLabelText("Artist name"),{target:{value:"Second Act"}});
 fireEvent.click(screen.getByRole("button",{name:"Create artist profile"}));
 await vi.waitFor(()=>expect(claimed).toHaveBeenCalledExactlyOnceWith(artist));
});
it("shows a claimed-name popup linking to the artist without losing the typed name", async () => {
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({code:"artist_name_claimed",error:"Claimed",artist:{name:"First Act",slug:"first-act"}},{status:409})));
 const claimed=vi.fn();
 render(<ClaimArtistForm onClaimed={claimed} />);
 const input=screen.getByLabelText("Artist name") as HTMLInputElement;
 fireEvent.change(input,{target:{value:"FIRST ACT"}});
 fireEvent.click(screen.getByRole("button",{name:"Create artist profile"}));
 const dialog=await screen.findByRole("alertdialog");
 expect(within(dialog).getByText(/Another user has claimed/)).toBeTruthy();
 expect(within(dialog).getByRole("link",{name:"View artist"}).getAttribute("href")).toBe("/artists/first-act");
 fireEvent.click(within(dialog).getByRole("button",{name:"Choose another name"}));
 expect(input.value).toBe("FIRST ACT");
 expect(claimed).not.toHaveBeenCalled();
});
