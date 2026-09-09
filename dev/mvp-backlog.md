# Visamp Linear backlog mapping

Transferred and verified 2026-09-08 (UTC). Linear is now authoritative for live scope,
ownership, priority, dependencies, acceptance criteria and delivery status.
This file is a transfer snapshot and navigation index, not a second live task tracker.
Product decisions remain in the [MVP specification](mvp.md).

The existing Visamp team was inspected before creation. It contained four Linear starter
issues and no matching projects or product backlog issues. The seven projects below and
65 scoped issues (VIS-5 through VIS-69) cover all 35 prepared draft references.
The four starter issues were preserved. No work was marked Done merely because it was imported.

At verification: **12 Todo**, **53 Backlog**, **9 assigned to Fergal**, **56 unassigned**,
and **89 native blocking relationships**. Fergal leads all seven projects; implementation
ownership remains unassigned unless explicitly allocated in the source. Founder-decision
ownership on company/funding work does not imply preparation/execution has an assignee.
Source Normal priority maps to Linear Medium. Optional Adaptive Pricing is Low and is not
a beta blocker. No calendar deadlines were invented from the approximate two-week ambition.

## Projects

| Project | Issues | Lead | State |
| --- | ---: | --- | --- |
| [Beta — Listening and community](https://linear.app/visamp/project/beta-listening-and-community-48b8658528b4) | 18 | Fergal Hanley | Planned |
| [Beta — Creation and assets](https://linear.app/visamp/project/beta-creation-and-assets-f1ac378f6372) | 12 | Fergal Hanley | Planned |
| [Beta — Credits and video export](https://linear.app/visamp/project/beta-credits-and-video-export-4d195d4fa959) | 9 | Fergal Hanley | Planned |
| [Beta — Launch operations](https://linear.app/visamp/project/beta-launch-operations-2603cfb508ec) | 5 | Fergal Hanley | Planned |
| [Launch — Community and content](https://linear.app/visamp/project/launch-community-and-content-8df38bf1d855) | 5 | Fergal Hanley | Planned |
| [Business — Company and funding](https://linear.app/visamp/project/business-company-and-funding-e9b99a3de4b7) | 2 | Fergal Hanley | Planned |
| [Roadmap — Post-MVP](https://linear.app/visamp/project/roadmap-post-mvp-e7a88f854eb1) | 14 | Fergal Hanley | Planned |

Each project links the product specification, this mapping and [baseline PR #3](https://github.com/fergalhanley/visamp-2/pull/3).

## First wave

These issues were placed in Todo. Todo means ready to pick up or resolve the listed inputs,
not that implementation has started or the open choices have been settled.

- [VIS-21 — Design and build the landing hero, navigation and footer](https://linear.app/visamp/issue/VIS-21/design-and-build-the-landing-hero-navigation-and-footer) — Fergal Hanley.
- [VIS-6 — Define user/creator/music-artist presentation](https://linear.app/visamp/issue/VIS-6/define-usercreatormusic-artist-presentation) — Unassigned.
- [VIS-32 — Define Mixpanel events, identity and beta metrics](https://linear.app/visamp/issue/VIS-32/define-mixpanel-events-identity-and-beta-metrics) — Unassigned.
- [VIS-10 — Evaluate client-side export and select rendering approach](https://linear.app/visamp/issue/VIS-10/evaluate-client-side-export-and-select-rendering-approach) — Unassigned.
- [VIS-11 — Begin company setup](https://linear.app/visamp/issue/VIS-11/begin-company-setup) — Fergal Hanley.
- [VIS-12 — Research grants and prepare funding applications](https://linear.app/visamp/issue/VIS-12/research-grants-and-prepare-funding-applications) — Fergal Hanley.
- [VIS-13 — Repair signup and password-reset navigation](https://linear.app/visamp/issue/VIS-13/repair-signup-and-password-reset-navigation) — Unassigned.
- [VIS-46 — Select the v1 visual collection for beta](https://linear.app/visamp/issue/VIS-46/select-the-v1-visual-collection-for-beta) — Fergal Hanley.
- [VIS-51 — Implement asset storage, validation and access control](https://linear.app/visamp/issue/VIS-51/implement-asset-storage-validation-and-access-control) — Fergal Hanley.
- [VIS-17 — Investigate silent editor failures](https://linear.app/visamp/issue/VIS-17/investigate-silent-editor-failures) — Fergal Hanley.
- [VIS-19 — Automatic AI provider choice with admin configuration](https://linear.app/visamp/issue/VIS-19/automatic-ai-provider-choice-with-admin-configuration) — Unassigned.
- [VIS-67 — Configure Vercel production deployment with the existing backend](https://linear.app/visamp/issue/VIS-67/configure-vercel-production-deployment-with-the-existing-backend) — Unassigned.

## Dependency boundaries

- [VIS-39](https://linear.app/visamp/issue/VIS-39/route-the-player-by-track-music-list-and-visual-playlist-prepare-set) depends on the beta set contract [VIS-38](https://linear.app/visamp/issue/VIS-38/define-the-beta-set-data-and-route-contract); it does not depend on post-MVP set playback [VIS-44](https://linear.app/visamp/issue/VIS-44/implement-timed-set-authoring-and-playback-after-mvp) or VJ controls [VIS-45](https://linear.app/visamp/issue/VIS-45/define-and-implement-early-vj-controls-after-timed-sets).
- Landing design [VIS-21](https://linear.app/visamp/issue/VIS-21/design-and-build-the-landing-hero-navigation-and-footer) can start independently. Carousel integration [VIS-43](https://linear.app/visamp/issue/VIS-43/integrate-and-validate-the-five-landing-discovery-carousels) depends on design, ranking/data definitions, identity and featured routing.
- Credit pricing [VIS-25](https://linear.app/visamp/issue/VIS-25/calibrate-ai-credit-pricing-packs-and-conditional-export-rates) uses AI cost/retry evaluation [VIS-19](https://linear.app/visamp/issue/VIS-19/automatic-ai-provider-choice-with-admin-configuration) and export feasibility [VIS-10](https://linear.app/visamp/issue/VIS-10/evaluate-client-side-export-and-select-rendering-approach). Ledger work [VIS-26](https://linear.app/visamp/issue/VIS-26/implement-allocation-ledger-spending-order-and-grant-expiry) can proceed independently of signup repair.
- Export [VIS-54](https://linear.app/visamp/issue/VIS-54/implement-track-based-video-export) depends on rendering feasibility and asset loading. Only if server rendering is chosen must metered release also wait for pricing [VIS-25](https://linear.app/visamp/issue/VIS-25/calibrate-ai-credit-pricing-packs-and-conditional-export-rates), ledger [VIS-26](https://linear.app/visamp/issue/VIS-26/implement-allocation-ledger-spending-order-and-grant-expiry) and purchasing [VIS-28](https://linear.app/visamp/issue/VIS-28/implement-stripe-one-off-credit-purchases-and-verified-webhooks). Client-rendered watermarked exports are free and have no billing blocker.
- Upload validation [VIS-24](https://linear.app/visamp/issue/VIS-24/validate-artist-upload-processing-publication-and-admin-end-to-end) may run locally before deployment. Its production-check portion requires [VIS-67](https://linear.app/visamp/issue/VIS-67/configure-vercel-production-deployment-with-the-existing-backend); the related link preserves that condition without blocking local validation.
- Livestream/content [VIS-50](https://linear.app/visamp/issue/VIS-50/establish-founder-content-and-weekly-livestream) requires cleared export/livestream reuse permission for the chosen audio and visuals. Site-playback permission alone is insufficient. In-product export [VIS-54](https://linear.app/visamp/issue/VIS-54/implement-track-based-video-export) is related work, not a prerequisite for recording a livestream. Planning and broadcast configuration can begin before content completion.
- Grant research [VIS-12](https://linear.app/visamp/issue/VIS-12/research-grants-and-prepare-funding-applications) starts alongside company setup [VIS-11](https://linear.app/visamp/issue/VIS-11/begin-company-setup). Only selected applications with registration prerequisites depend on completed company setup.
- Initial deployment [VIS-67](https://linear.app/visamp/issue/VIS-67/configure-vercel-production-deployment-with-the-existing-backend) has no feature-completion blockers. Public-beta readiness [VIS-69](https://linear.app/visamp/issue/VIS-69/verify-public-beta-readiness-across-the-agreed-core-flows) has the core-flow completion dependencies and production validation criteria. A separate staging stack remains post-MVP in [VIS-68](https://linear.app/visamp/issue/VIS-68/separate-staging-infrastructure-after-mvp).
- Missing-asset warnings and the 24-hour privacy rule [VIS-55](https://linear.app/visamp/issue/VIS-55/handle-missing-assets-and-enforce-the-24-hour-repair-window) are beta work. Owner notifications [VIS-59](https://linear.app/visamp/issue/VIS-59/add-owner-notifications-for-missing-assets-and-privacy-changes) are post-MVP and do not block enforcement.

## Issue mapping

Draft references below are retained only for traceability to the prepared backlog. Follow the
real Linear links for current requirements and status. Blocking columns list the native
blocking relations verified at transfer; conditional dependencies are explained above and in issues.

### Beta — Listening and community

| Source draft | Linear issue | Priority | Owner | Import state | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D01 / D01a | [VIS-21 — Design and build the landing hero, navigation and footer](https://linear.app/visamp/issue/VIS-21/design-and-build-the-landing-hero-navigation-and-footer) | High | Fergal Hanley | Todo | — |
| D01 / D01b | [VIS-22 — Define simple discovery rankings and carousel data](https://linear.app/visamp/issue/VIS-22/define-simple-discovery-rankings-and-carousel-data) | High | Unassigned | Backlog | [VIS-6](https://linear.app/visamp/issue/VIS-6/define-usercreatormusic-artist-presentation) |
| D01 / D01c | [VIS-43 — Integrate and validate the five landing discovery carousels](https://linear.app/visamp/issue/VIS-43/integrate-and-validate-the-five-landing-discovery-carousels) | High | Fergal Hanley | Backlog | [VIS-21](https://linear.app/visamp/issue/VIS-21/design-and-build-the-landing-hero-navigation-and-footer), [VIS-22](https://linear.app/visamp/issue/VIS-22/define-simple-discovery-rankings-and-carousel-data), [VIS-40](https://linear.app/visamp/issue/VIS-40/featured-artist-configuration-and-entry-routing), [VIS-6](https://linear.app/visamp/issue/VIS-6/define-usercreatormusic-artist-presentation) |
| D02 | [VIS-5 — Player navigation and panel layout](https://linear.app/visamp/issue/VIS-5/player-navigation-and-panel-layout) | Medium | Unassigned | Backlog | — |
| D03 | [VIS-40 — Featured artist configuration and entry routing](https://linear.app/visamp/issue/VIS-40/featured-artist-configuration-and-entry-routing) | High | Unassigned | Backlog | [VIS-8](https://linear.app/visamp/issue/VIS-8/gereon-founding-artist-onboarding), [VIS-7](https://linear.app/visamp/issue/VIS-7/admin-artist-and-licence-onboarding), [VIS-39](https://linear.app/visamp/issue/VIS-39/route-the-player-by-track-music-list-and-visual-playlist-prepare-set) |
| D04 | [VIS-8 — Gereon founding artist onboarding](https://linear.app/visamp/issue/VIS-8/gereon-founding-artist-onboarding) | High | Unassigned | Backlog | [VIS-7](https://linear.app/visamp/issue/VIS-7/admin-artist-and-licence-onboarding) |
| D05 | [VIS-7 — Admin artist and licence onboarding](https://linear.app/visamp/issue/VIS-7/admin-artist-and-licence-onboarding) | High | Unassigned | Backlog | [VIS-6](https://linear.app/visamp/issue/VIS-6/define-usercreatormusic-artist-presentation) |
| D06 | [VIS-15 — Validate accounts and community](https://linear.app/visamp/issue/VIS-15/validate-accounts-and-community) | High | Fergal Hanley | Backlog | [VIS-13](https://linear.app/visamp/issue/VIS-13/repair-signup-and-password-reset-navigation), [VIS-14](https://linear.app/visamp/issue/VIS-14/follow-creatorsartists-and-filter-discovery) |
| D07 / D07a | [VIS-23 — Implement self-upload agreements and automatic music publication](https://linear.app/visamp/issue/VIS-23/implement-self-upload-agreements-and-automatic-music-publication) | High | Unassigned | Backlog | [VIS-7](https://linear.app/visamp/issue/VIS-7/admin-artist-and-licence-onboarding) |
| D07 / D07b | [VIS-24 — Validate artist upload, processing, publication and admin end to end](https://linear.app/visamp/issue/VIS-24/validate-artist-upload-processing-publication-and-admin-end-to-end) | High | Unassigned | Backlog | [VIS-7](https://linear.app/visamp/issue/VIS-7/admin-artist-and-licence-onboarding), [VIS-23](https://linear.app/visamp/issue/VIS-23/implement-self-upload-agreements-and-automatic-music-publication) |
| D08 | [VIS-6 — Define user/creator/music-artist presentation](https://linear.app/visamp/issue/VIS-6/define-usercreatormusic-artist-presentation) | High | Unassigned | Todo | — |
| D11 | [VIS-9 — Implement mobile/tablet viewer layout](https://linear.app/visamp/issue/VIS-9/implement-mobiletablet-viewer-layout) | High | Unassigned | Backlog | [VIS-5](https://linear.app/visamp/issue/VIS-5/player-navigation-and-panel-layout) |
| D19 | [VIS-41 — Restore local files and listening sessions after reload](https://linear.app/visamp/issue/VIS-41/restore-local-files-and-listening-sessions-after-reload) | Medium | Unassigned | Backlog | [VIS-39](https://linear.app/visamp/issue/VIS-39/route-the-player-by-track-music-list-and-visual-playlist-prepare-set) |
| D20 | [VIS-39 — Route the player by track, music list and visual playlist; prepare set model](https://linear.app/visamp/issue/VIS-39/route-the-player-by-track-music-list-and-visual-playlist-prepare-set) | High | Unassigned | Backlog | [VIS-38](https://linear.app/visamp/issue/VIS-38/define-the-beta-set-data-and-route-contract) |
| D21 / D21a | [VIS-38 — Define the beta set data and route contract](https://linear.app/visamp/issue/VIS-38/define-the-beta-set-data-and-route-contract) | High | Unassigned | Backlog | — |
| D22 | [VIS-42 — Visual transport controls and shortcuts](https://linear.app/visamp/issue/VIS-42/visual-transport-controls-and-shortcuts) | Medium | Unassigned | Backlog | [VIS-39](https://linear.app/visamp/issue/VIS-39/route-the-player-by-track-music-list-and-visual-playlist-prepare-set) |
| D23 | [VIS-13 — Repair signup and password-reset navigation](https://linear.app/visamp/issue/VIS-13/repair-signup-and-password-reset-navigation) | High | Unassigned | Todo | — |
| D24 | [VIS-14 — Follow creators/artists and filter discovery](https://linear.app/visamp/issue/VIS-14/follow-creatorsartists-and-filter-discovery) | High | Unassigned | Backlog | [VIS-6](https://linear.app/visamp/issue/VIS-6/define-usercreatormusic-artist-presentation) |

### Beta — Creation and assets

| Source draft | Linear issue | Priority | Owner | Import state | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D25 / D25a | [VIS-46 — Select the v1 visual collection for beta](https://linear.app/visamp/issue/VIS-46/select-the-v1-visual-collection-for-beta) | High | Fergal Hanley | Todo | — |
| D25 / D25b | [VIS-47 — Inventory language gaps in the selected v1 visuals](https://linear.app/visamp/issue/VIS-47/inventory-language-gaps-in-the-selected-v1-visuals) | High | Unassigned | Backlog | [VIS-46](https://linear.app/visamp/issue/VIS-46/select-the-v1-visual-collection-for-beta) |
| D25 / D25c | [VIS-48 — Implement the approved language capabilities for selected ports](https://linear.app/visamp/issue/VIS-48/implement-the-approved-language-capabilities-for-selected-ports) | High | Unassigned | Backlog | [VIS-47](https://linear.app/visamp/issue/VIS-47/inventory-language-gaps-in-the-selected-v1-visuals) |
| D25 / D25d | [VIS-49 — Port and validate the selected v1 visuals](https://linear.app/visamp/issue/VIS-49/port-and-validate-the-selected-v1-visuals) | High | Unassigned | Backlog | [VIS-48](https://linear.app/visamp/issue/VIS-48/implement-the-approved-language-capabilities-for-selected-ports) |
| D26 | [VIS-16 — Choose and propagate the visual-language name](https://linear.app/visamp/issue/VIS-16/choose-and-propagate-the-visual-language-name) | Medium | Unassigned | Backlog | — |
| D27 / D27a | [VIS-51 — Implement asset storage, validation and access control](https://linear.app/visamp/issue/VIS-51/implement-asset-storage-validation-and-access-control) | High | Fergal Hanley | In Progress | — |
| D27 / D27a | [VIS-73 — Define asset rights, reuse permission and attribution](https://linear.app/visamp/issue/VIS-73/define-asset-rights-reuse-permission-and-attribution) | Medium | Unassigned | Backlog | [VIS-51](https://linear.app/visamp/issue/VIS-51/implement-asset-storage-validation-and-access-control) |
| D27 / D27b | [VIS-52 — Build asset library discovery, selection and upload UI](https://linear.app/visamp/issue/VIS-52/build-asset-library-discovery-selection-and-upload-ui) | High | Unassigned | Backlog | [VIS-51](https://linear.app/visamp/issue/VIS-51/implement-asset-storage-validation-and-access-control) |
| D27 / D27c | [VIS-53 — Load assets in the renderer and preserve access in forks](https://linear.app/visamp/issue/VIS-53/load-assets-in-the-renderer-and-preserve-access-in-forks) | High | Unassigned | Backlog | [VIS-51](https://linear.app/visamp/issue/VIS-51/implement-asset-storage-validation-and-access-control) |
| D28 | [VIS-55 — Handle missing assets and enforce the 24-hour repair window](https://linear.app/visamp/issue/VIS-55/handle-missing-assets-and-enforce-the-24-hour-repair-window) | High | Unassigned | Backlog | [VIS-51](https://linear.app/visamp/issue/VIS-51/implement-asset-storage-validation-and-access-control), [VIS-53](https://linear.app/visamp/issue/VIS-53/load-assets-in-the-renderer-and-preserve-access-in-forks) |
| D29 | [VIS-17 — Investigate silent editor failures](https://linear.app/visamp/issue/VIS-17/investigate-silent-editor-failures) | High | Fergal Hanley | Todo | — |
| D30 | [VIS-18 — Report multiple editor diagnostics](https://linear.app/visamp/issue/VIS-18/report-multiple-editor-diagnostics) | Medium | Unassigned | Backlog | — |
| D31 | [VIS-19 — Automatic AI provider choice with admin configuration](https://linear.app/visamp/issue/VIS-19/automatic-ai-provider-choice-with-admin-configuration) | High | Unassigned | Todo | — |

### Beta — Credits and video export

| Source draft | Linear issue | Priority | Owner | Import state | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D09 / D09a | [VIS-25 — Calibrate AI credit pricing, packs and conditional export rates](https://linear.app/visamp/issue/VIS-25/calibrate-ai-credit-pricing-packs-and-conditional-export-rates) | High | Unassigned | Backlog | [VIS-19](https://linear.app/visamp/issue/VIS-19/automatic-ai-provider-choice-with-admin-configuration), [VIS-10](https://linear.app/visamp/issue/VIS-10/evaluate-client-side-export-and-select-rendering-approach) |
| D09 / D09b | [VIS-26 — Implement allocation ledger, spending order and grant expiry](https://linear.app/visamp/issue/VIS-26/implement-allocation-ledger-spending-order-and-grant-expiry) | High | Unassigned | Backlog | — |
| D09 / D09c | [VIS-27 — Implement verified signup credits and admin discretionary grants](https://linear.app/visamp/issue/VIS-27/implement-verified-signup-credits-and-admin-discretionary-grants) | High | Unassigned | Backlog | [VIS-13](https://linear.app/visamp/issue/VIS-13/repair-signup-and-password-reset-navigation), [VIS-25](https://linear.app/visamp/issue/VIS-25/calibrate-ai-credit-pricing-packs-and-conditional-export-rates), [VIS-26](https://linear.app/visamp/issue/VIS-26/implement-allocation-ledger-spending-order-and-grant-expiry) |
| D09 / D09d | [VIS-28 — Implement Stripe one-off credit purchases and verified webhooks](https://linear.app/visamp/issue/VIS-28/implement-stripe-one-off-credit-purchases-and-verified-webhooks) | High | Unassigned | Backlog | [VIS-25](https://linear.app/visamp/issue/VIS-25/calibrate-ai-credit-pricing-packs-and-conditional-export-rates), [VIS-26](https://linear.app/visamp/issue/VIS-26/implement-allocation-ledger-spending-order-and-grant-expiry) |
| D09 / D09e | [VIS-29 — Add editor credit balance, action cost and top-up](https://linear.app/visamp/issue/VIS-29/add-editor-credit-balance-action-cost-and-top-up) | High | Unassigned | Backlog | [VIS-25](https://linear.app/visamp/issue/VIS-25/calibrate-ai-credit-pricing-packs-and-conditional-export-rates), [VIS-26](https://linear.app/visamp/issue/VIS-26/implement-allocation-ledger-spending-order-and-grant-expiry), [VIS-28](https://linear.app/visamp/issue/VIS-28/implement-stripe-one-off-credit-purchases-and-verified-webhooks), [VIS-19](https://linear.app/visamp/issue/VIS-19/automatic-ai-provider-choice-with-admin-configuration) |
| D09 / D09f | [VIS-30 — Build account billing, usage and expiry history](https://linear.app/visamp/issue/VIS-30/build-account-billing-usage-and-expiry-history) | High | Unassigned | Backlog | [VIS-26](https://linear.app/visamp/issue/VIS-26/implement-allocation-ledger-spending-order-and-grant-expiry), [VIS-27](https://linear.app/visamp/issue/VIS-27/implement-verified-signup-credits-and-admin-discretionary-grants), [VIS-28](https://linear.app/visamp/issue/VIS-28/implement-stripe-one-off-credit-purchases-and-verified-webhooks) |
| D09 / D09g | [VIS-31 — Evaluate optional Stripe Adaptive Pricing eligibility](https://linear.app/visamp/issue/VIS-31/evaluate-optional-stripe-adaptive-pricing-eligibility) | Low | Unassigned | Backlog | — |
| D12 | [VIS-54 — Implement track-based video export](https://linear.app/visamp/issue/VIS-54/implement-track-based-video-export) | High | Unassigned | Backlog | [VIS-10](https://linear.app/visamp/issue/VIS-10/evaluate-client-side-export-and-select-rendering-approach), [VIS-53](https://linear.app/visamp/issue/VIS-53/load-assets-in-the-renderer-and-preserve-access-in-forks) |
| D13 | [VIS-10 — Evaluate client-side export and select rendering approach](https://linear.app/visamp/issue/VIS-10/evaluate-client-side-export-and-select-rendering-approach) | High | Unassigned | Todo | — |

### Beta — Launch operations

| Source draft | Linear issue | Priority | Owner | Import state | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D10 / D10a | [VIS-32 — Define Mixpanel events, identity and beta metrics](https://linear.app/visamp/issue/VIS-32/define-mixpanel-events-identity-and-beta-metrics) | High | Unassigned | Todo | — |
| D10 / D10b | [VIS-33 — Implement Mixpanel environment routing and beta dashboards](https://linear.app/visamp/issue/VIS-33/implement-mixpanel-environment-routing-and-beta-dashboards) | High | Unassigned | Backlog | [VIS-32](https://linear.app/visamp/issue/VIS-32/define-mixpanel-events-identity-and-beta-metrics) |
| D33 / D33a | [VIS-67 — Configure Vercel production deployment with the existing backend](https://linear.app/visamp/issue/VIS-67/configure-vercel-production-deployment-with-the-existing-backend) | High | Unassigned | Todo | — |
| D33 / D33b | [VIS-69 — Verify public-beta readiness across the agreed core flows](https://linear.app/visamp/issue/VIS-69/verify-public-beta-readiness-across-the-agreed-core-flows) | High | Unassigned | Backlog | [VIS-67](https://linear.app/visamp/issue/VIS-67/configure-vercel-production-deployment-with-the-existing-backend), [VIS-43](https://linear.app/visamp/issue/VIS-43/integrate-and-validate-the-five-landing-discovery-carousels), [VIS-5](https://linear.app/visamp/issue/VIS-5/player-navigation-and-panel-layout), [VIS-40](https://linear.app/visamp/issue/VIS-40/featured-artist-configuration-and-entry-routing), [VIS-8](https://linear.app/visamp/issue/VIS-8/gereon-founding-artist-onboarding), [VIS-15](https://linear.app/visamp/issue/VIS-15/validate-accounts-and-community), [VIS-24](https://linear.app/visamp/issue/VIS-24/validate-artist-upload-processing-publication-and-admin-end-to-end), [VIS-27](https://linear.app/visamp/issue/VIS-27/implement-verified-signup-credits-and-admin-discretionary-grants), [VIS-28](https://linear.app/visamp/issue/VIS-28/implement-stripe-one-off-credit-purchases-and-verified-webhooks), [VIS-29](https://linear.app/visamp/issue/VIS-29/add-editor-credit-balance-action-cost-and-top-up), [VIS-30](https://linear.app/visamp/issue/VIS-30/build-account-billing-usage-and-expiry-history), [VIS-33](https://linear.app/visamp/issue/VIS-33/implement-mixpanel-environment-routing-and-beta-dashboards), [VIS-9](https://linear.app/visamp/issue/VIS-9/implement-mobiletablet-viewer-layout), [VIS-54](https://linear.app/visamp/issue/VIS-54/implement-track-based-video-export), [VIS-34](https://linear.app/visamp/issue/VIS-34/publish-policy-licensing-about-and-beta-site-information), [VIS-35](https://linear.app/visamp/issue/VIS-35/expose-the-existing-discord-invite-only-to-signed-in-users), [VIS-41](https://linear.app/visamp/issue/VIS-41/restore-local-files-and-listening-sessions-after-reload), [VIS-39](https://linear.app/visamp/issue/VIS-39/route-the-player-by-track-music-list-and-visual-playlist-prepare-set), [VIS-42](https://linear.app/visamp/issue/VIS-42/visual-transport-controls-and-shortcuts), [VIS-14](https://linear.app/visamp/issue/VIS-14/follow-creatorsartists-and-filter-discovery), [VIS-49](https://linear.app/visamp/issue/VIS-49/port-and-validate-the-selected-v1-visuals), [VIS-16](https://linear.app/visamp/issue/VIS-16/choose-and-propagate-the-visual-language-name), [VIS-52](https://linear.app/visamp/issue/VIS-52/build-asset-library-discovery-selection-and-upload-ui), [VIS-53](https://linear.app/visamp/issue/VIS-53/load-assets-in-the-renderer-and-preserve-access-in-forks), [VIS-55](https://linear.app/visamp/issue/VIS-55/handle-missing-assets-and-enforce-the-24-hour-repair-window), [VIS-17](https://linear.app/visamp/issue/VIS-17/investigate-silent-editor-failures), [VIS-18](https://linear.app/visamp/issue/VIS-18/report-multiple-editor-diagnostics), [VIS-19](https://linear.app/visamp/issue/VIS-19/automatic-ai-provider-choice-with-admin-configuration), [VIS-20](https://linear.app/visamp/issue/VIS-20/define-and-set-up-beta-monitoring) |
| D34 | [VIS-20 — Define and set up beta monitoring](https://linear.app/visamp/issue/VIS-20/define-and-set-up-beta-monitoring) | High | Unassigned | Backlog | — |

### Launch — Community and content

| Source draft | Linear issue | Priority | Owner | Import state | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D14 / D14a | [VIS-34 — Publish policy, licensing, About and beta site information](https://linear.app/visamp/issue/VIS-34/publish-policy-licensing-about-and-beta-site-information) | High | Unassigned | Backlog | — |
| D14 / D14b | [VIS-35 — Expose the existing Discord invite only to signed-in users](https://linear.app/visamp/issue/VIS-35/expose-the-existing-discord-invite-only-to-signed-in-users) | High | Unassigned | Backlog | [VIS-13](https://linear.app/visamp/issue/VIS-13/repair-signup-and-password-reset-navigation) |
| D14 / D14c | [VIS-36 — Set up consistent Visamp-branded social accounts and links](https://linear.app/visamp/issue/VIS-36/set-up-consistent-visamp-branded-social-accounts-and-links) | High | Unassigned | Backlog | — |
| D17 | [VIS-37 — Recruit founding beta users](https://linear.app/visamp/issue/VIS-37/recruit-founding-beta-users) | High | Fergal Hanley | Backlog | [VIS-34](https://linear.app/visamp/issue/VIS-34/publish-policy-licensing-about-and-beta-site-information), [VIS-35](https://linear.app/visamp/issue/VIS-35/expose-the-existing-discord-invite-only-to-signed-in-users), [VIS-36](https://linear.app/visamp/issue/VIS-36/set-up-consistent-visamp-branded-social-accounts-and-links) |
| D18 | [VIS-50 — Establish founder content and weekly livestream](https://linear.app/visamp/issue/VIS-50/establish-founder-content-and-weekly-livestream) | High | Fergal Hanley | Backlog | [VIS-34](https://linear.app/visamp/issue/VIS-34/publish-policy-licensing-about-and-beta-site-information), [VIS-35](https://linear.app/visamp/issue/VIS-35/expose-the-existing-discord-invite-only-to-signed-in-users), [VIS-36](https://linear.app/visamp/issue/VIS-36/set-up-consistent-visamp-branded-social-accounts-and-links), [VIS-49](https://linear.app/visamp/issue/VIS-49/port-and-validate-the-selected-v1-visuals) |

### Business — Company and funding

| Source draft | Linear issue | Priority | Owner | Import state | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D15 | [VIS-11 — Begin company setup](https://linear.app/visamp/issue/VIS-11/begin-company-setup) | High | Fergal Hanley | Todo | — |
| D16 | [VIS-12 — Research grants and prepare funding applications](https://linear.app/visamp/issue/VIS-12/research-grants-and-prepare-funding-applications) | High | Fergal Hanley | Todo | — |

### Roadmap — Post-MVP

| Source draft | Linear issue | Priority | Owner | Import state | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D21 / D21b | [VIS-44 — Implement timed-set authoring and playback after MVP](https://linear.app/visamp/issue/VIS-44/implement-timed-set-authoring-and-playback-after-mvp) | High | Unassigned | Backlog | [VIS-38](https://linear.app/visamp/issue/VIS-38/define-the-beta-set-data-and-route-contract) |
| D21 / D21c | [VIS-45 — Define and implement early VJ controls after timed sets](https://linear.app/visamp/issue/VIS-45/define-and-implement-early-vj-controls-after-timed-sets) | High | Unassigned | Backlog | [VIS-44](https://linear.app/visamp/issue/VIS-44/implement-timed-set-authoring-and-playback-after-mvp) |
| D32 / D32a | [VIS-56 — Add client-side editor history after MVP](https://linear.app/visamp/issue/VIS-56/add-client-side-editor-history-after-mvp) | Low | Unassigned | Backlog | — |
| D32 / D32b | [VIS-57 — Add GLSL/shader authoring context after MVP](https://linear.app/visamp/issue/VIS-57/add-glslshader-authoring-context-after-mvp) | Low | Unassigned | Backlog | — |
| D32 / D32c | [VIS-58 — Add community publication notifications after MVP](https://linear.app/visamp/issue/VIS-58/add-community-publication-notifications-after-mvp) | Low | Unassigned | Backlog | [VIS-14](https://linear.app/visamp/issue/VIS-14/follow-creatorsartists-and-filter-discovery) |
| D32 / D32d | [VIS-59 — Add owner notifications for missing assets and privacy changes](https://linear.app/visamp/issue/VIS-59/add-owner-notifications-for-missing-assets-and-privacy-changes) | Low | Unassigned | Backlog | [VIS-55](https://linear.app/visamp/issue/VIS-55/handle-missing-assets-and-enforce-the-24-hour-repair-window) |
| D32 / D32e | [VIS-60 — Define and implement TV browser mode](https://linear.app/visamp/issue/VIS-60/define-and-implement-tv-browser-mode) | Low | Unassigned | Backlog | — |
| D32 / D32f | [VIS-61 — Plan platform-specific native smart TV apps](https://linear.app/visamp/issue/VIS-61/plan-platform-specific-native-smart-tv-apps) | Low | Unassigned | Backlog | [VIS-60](https://linear.app/visamp/issue/VIS-60/define-and-implement-tv-browser-mode) |
| D32 / D32g | [VIS-62 — Evaluate subscriptions and recurring credit plans](https://linear.app/visamp/issue/VIS-62/evaluate-subscriptions-and-recurring-credit-plans) | Low | Unassigned | Backlog | — |
| D32 / D32h | [VIS-63 — Evaluate advertising after MVP](https://linear.app/visamp/issue/VIS-63/evaluate-advertising-after-mvp) | Low | Unassigned | Backlog | — |
| D32 / D32i | [VIS-64 — Define artist revenue sharing after MVP](https://linear.app/visamp/issue/VIS-64/define-artist-revenue-sharing-after-mvp) | Low | Unassigned | Backlog | — |
| D32 / D32j | [VIS-65 — Implement paid watermark removal after MVP](https://linear.app/visamp/issue/VIS-65/implement-paid-watermark-removal-after-mvp) | Low | Unassigned | Backlog | [VIS-54](https://linear.app/visamp/issue/VIS-54/implement-track-based-video-export) |
| D32 / D32k | [VIS-66 — Define richer export editing and multi-visual sequencing](https://linear.app/visamp/issue/VIS-66/define-richer-export-editing-and-multi-visual-sequencing) | Low | Unassigned | Backlog | [VIS-54](https://linear.app/visamp/issue/VIS-54/implement-track-based-video-export) |
| D35 | [VIS-68 — Separate staging infrastructure after MVP](https://linear.app/visamp/issue/VIS-68/separate-staging-infrastructure-after-mvp) | Medium | Unassigned | Backlog | [VIS-67](https://linear.app/visamp/issue/VIS-67/configure-vercel-production-deployment-with-the-existing-backend) |

## Source and verification

- [Prepared backlog before transfer](https://github.com/fergalhanley/visamp-2/blob/69f7e9c0b3da3296ea65cf7110be07e56ffb0f52/dev/mvp-backlog.md). Source file blob: `be80b55070779eb9693b125eef8640800bdf947d`.
- [MVP specification](mvp.md) and [baseline PR #3](https://github.com/fergalhanley/visamp-2/pull/3).
- Read back all 65 issues and all seven projects. Verified titles/coverage, project membership, priorities, assignees, states, no due dates, source links and all 89 expected blocking edges. No mismatches were found.
- Replaced forward draft references with live links. Added related links for production upload validation and in-product export/livestream coordination without introducing unconditional blockers.
- Product implementation, registration, outreach, account provisioning and launch are still tracked work; this transfer does not claim those outcomes are complete.
