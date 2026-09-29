# Todo

**Current milestone:** M1 — Studio + marketplace prototype

Keep this list short. Maximum target: 10 active tasks.

- [x] Replace Studio's separate Video Maker with persistent selection of existing Sets and links to the exact Set Builder. [R030 R031 R035 R090]
- [x] Refactor Studio into Set library, distributions and settings columns; persist Master Downloads setup (rendering deferred). [R030 R032 R035]
- [ ] Verify first-class Visript params and add live per-clip param editing/persistence to Set Builder. [R011 R012 R036 R092]
- [ ] Complete distribution/source/fork semantics and eligible visual discovery/preview in Set Builder. [R010 R017 R018 R026 R034]
- [ ] Validate selected Sets for artist-owned hosted tracks, eligible visuals and render readiness below the UI. [R033 R034 R091]
- [ ] Integrate product licensing, credit debit and creator earnings into the Set distribution flow. [R023 R025 R037 R093]
- [ ] Export a selected Set and attach the rendered output and revision/provenance to Studio. [R038 R039 R094]
- [ ] Preserve/convert existing interim Video drafts into Sets before retiring Video authoring APIs/storage. [R031 R039]
- [ ] Verify the authenticated Set Builder → Studio → licence → export flow and prepare musician/creator testing. [R090-R094]

See [M1 design](designs/marketplace-prototype.md). The earlier separate Video
Maker implementation is superseded by the owner's direct-Set distribution
decision; its completed tasks are retained in Git history.
