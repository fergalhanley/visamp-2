import { expect, it } from "vitest";
import { artistLinkTypes, parseArtistLinks, readArtistLinks } from "./links";
import icons from "./link-icons.json";
it("provides 16 social/music types with local icons, plus Website", () => {
  expect(artistLinkTypes).toHaveLength(17);
  expect(Object.keys(icons).sort()).toEqual(artistLinkTypes.filter(t => t.value !== "website").map(t => t.value).sort());
  expect(Object.values(icons).every(path => path.length > 0)).toBe(true);
});
it("normalizes valid links and preserves legacy websites", () => {
  expect(parseArtistLinks([{ type: "bandcamp", url: " https://artist.bandcamp.com " }])).toEqual([{ type: "bandcamp", url: "https://artist.bandcamp.com/" }]);
  expect(readArtistLinks(undefined, "https://artist.example")).toEqual([{ type: "website", url: "https://artist.example/" }]);
  expect(readArtistLinks([{ type: "website", url: "javascript:alert(1)" }])).toEqual([]);
});
it.each([
  [{type:"website",url:"javascript:alert(1)"}], [{type:"website",url:"https://user:pass@example.com"}],
  [{type:"instagram",url:"https://instagram.com.evil.test/artist"}], [{type:"website",url:"https://example.com/\nsecret"}],
  [{type:"unknown",url:"https://example.com"}], [{type:"spotify",url:""}],
  Array.from({length:21}, () => ({type:"website",url:"https://example.com"})),
].map(links => ({ links })))("rejects unsafe or mismatched links: %j", ({ links }) => { expect(() => parseArtistLinks(links)).toThrow(); });
it("rejects duplicated links while allowing multiple different websites", () => {
  const first={type:"website",url:"https://one.example"};
  expect(() => parseArtistLinks([first,first])).toThrow("already listed");
  expect(parseArtistLinks([first,{type:"website",url:"https://two.example"}])).toHaveLength(2);
});
