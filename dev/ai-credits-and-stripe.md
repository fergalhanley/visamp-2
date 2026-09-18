# AI credits and Stripe — VIS-123

## Product rules

- Initial requests use GPT-6 Astra with one automatic retry on model/code failure,
  capped at two attempts. There is no provider picker.
- A technically successful request costs 100 credits, including validation retries.
  Initial-request failure, cancellation and exhausted retries do not consume credits.
  Explicit Try to fix runs once on GPT-6 Astra and charges one generation cost before
  calling the model, even on failure or cancellation. Edit/accept/cancel recovery
  actions are free. Undo does not refund.
- Protected `profiles.ai_credit_exempt` skips credit requirements and charges. It does
  not skip authentication, ownership, rate limits or concurrency limits.
- US$1 purchases 1,000 credits. Presets: $5 / 5,000, $20 / 20,000, $50 / 50,000.
  This exchange rate stays fixed; future pricing adjusts `generation_cost` instead.
  At the current 100-credit cost, US$1 funds 10 successful generations.
  Custom purchases accept cents, from $2 to $1,000 per checkout. All prices are USD.
- New verified signups receive 2,000 credits (20 successful requests). Settings are
  service-role-only. Verification and OAuth retries cannot grant twice. Promotions
  change future grants; existing balances are never recalculated.
- Purchased/signup credits never expire. Discretionary grants may have an expiry.
  Spend earliest-expiring first, then non-expiring free, then purchased credits.
- Existing ledger balances migrate into non-expiring legacy allocations, without
  rescaling. Existing transactions remain available for audit. Previously granted
  signup credits suppress duplicate grants. Existing verified users are not backfilled.

## Initial price estimate (17 September 2026)

Historical Sol estimate: generation switched to Astra on 18 September. These
figures are not an estimate of the current Astra workload.

This is an estimate, not a measured production cost or guaranteed margin.
[OpenAI lists Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) at
US$4/million input and $20/million output tokens, including reasoning output.
The current promotional rates are available at least through 21 November 2026.

Illustrative workload: 30,000 input tokens and 4,000 output/reasoning tokens per
attempt = $0.20. At 1.5 attempts per submitted request and 90% eventual success,
provider spend averages $0.20 × 1.5 / 0.9 = **$0.333 per billable success**.
At 60,000 input / 8,192 output and two attempts / 90% success: **$0.898**.
These assumptions need replacement with measured usage before increasing allowances.

The original $1/request proposal was replaced by owner-approved introductory
pricing of $0.10/request (VIS-125). Under the illustrative $0.333 workload this
subsidizes approximately $0.233 per success before payment fees and hosting.
Future profitability adjustments must increase generation credit cost, keeping
1,000 credits per US$1 fixed. Budgeting at the pre-promotion $5/$30 rates gives about $0.45 for the
illustrative workload. Do not assume promotional pricing continues indefinitely.

[Stripe fees](https://stripe.com/pricing) depend on merchant country, card, currency
and settlement. As an illustration only, 2.9% + $0.30 costs $0.358 on a $2 checkout
and $0.445 on $5. Check the actual merchant schedule; USD pricing does not imply a
US merchant account. Taxes are additional when Stripe Tax is enabled/configured.
Revisit generation credit cost based on observed mean cost, failure/retry rate and actual fees.

## Database rollout

Pause `AI_GENERATION_ENABLED` and wait for current requests to finish, then apply
`supabase/migrations/20260917120000_ai_credit_purchases.sql`. The migration refuses
cutover with active requests or negative legacy balances. Deploy the matching web
code before re-enabling generation. Applying only the schema or only the web code
is not a supported production cutover.

Settings and exemptions (trusted SQL / service role):

```sql
update public.ai_credit_settings
set generation_cost = 100, signup_grant = 2000,
    grant_reference = 'signup-v1', updated_at = now()
where singleton;

update public.profiles set ai_credit_exempt = true
where id = '<user-uuid>';

select public.grant_ai_credits(
  '<user-uuid>', 1000, 'discretionary', 'creator-grant:<unique-reference>',
  now() + interval '30 days'
);
-- Omit the last argument for a non-expiring grant.
```

Use `grant_ai_credits`, not direct transaction inserts. The reference is an
idempotency key: repeating the same grant is safe, reusing it with different
values is an error. Save the exact expiry when retrying an expiring grant.
User profile editing cannot update the exemption flag.

## Credit exchange rate rollout — VIS-125

Apply `supabase/migrations/20260917160000_credit_exchange_rate.sql` before deploying
this pricing update. It preserves historical purchases and balances, records each
purchase's quote rate and fixes refunds to remove the proportional quoted credits.
Older app instances can still create legacy-rate quotes during rollout; new code
explicitly records 1,000 credits/USD. Pending older checkouts retain their original
credit amounts when fulfilled. No Stripe Product/Price changes are needed.

Future generation pricing changes use the existing protected setting:

```sql
-- Replace 100 with the approved cost for future requests.
update public.ai_credit_settings
set generation_cost = 100, updated_at = now()
where singleton;
```

This does not rescale balances or purchase prices. Running requests retain their
reserved cost. Signup grants remain 2,000 credits; their generation count depends
on the current generation cost. OpenAI automatic balance reload is an operator
setting and is not changed by this release.

## Paid repair rollout — VIS-128

Apply `supabase/migrations/20260918010000_paid_ai_repairs.sql` before deploying the
matching web code. It adds `repair_charged` and a service-role-only `charge_ai_repair`
RPC, preserving the existing completion signature. Initial requests retain their
successful-request billing behavior. No balance changes occur during migration.

Repair admission reserves the full current generation cost and retains auth,
ownership, rate, concurrency and exemption checks. Before the provider call,
`charge_ai_repair` locks the user/request, verifies the displayed cost against the
reserved quote, consumes unexpired reservations once, and records the debit. An
expired reservation or stale quote rejects the repair without calling the provider.
The consumed reservation is removed so it cannot subtract from the balance twice.
Completion keeps the actual outcome and never charges again. A failure or abandoned
request remains charged; credit-exempt requests record repair usage with no debit.
Failed repair code is available through the existing owner-only result download.
The billing history displays the debit even when the repair failed.

The old `AI_ATTEMPT_BUDGET` environment setting is ignored: initial requests have
at most two model calls; explicit repairs have exactly one. Model/provider errors
can retry once on Astra, but a validator connectivity error aborts without another
model call. Astra is documented in the [OpenAI model catalog](https://developers.openai.com/api/docs/models).

Verification: `supabase/tests/paid_ai_repairs.sql`, existing credit ledger tests,
web API/component tests and desktop/mobile dialog checks. Run SQL tests only against
a disposable/local database; each test rolls back its fixture changes.

## Stripe setup

Use a dedicated test Supabase database for Stripe test mode. Test payments must
never fund production credit balances. The application rejects test mode on Vercel
production and rejects payment events/key prefixes that disagree with STRIPE_MODE.
Do not point a local/test deployment at the production database.

Set server-only environment variables:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MODE=test
STRIPE_AUTOMATIC_TAX=false
OPENAI_API_KEY=...
```

No publishable key or pre-created Stripe Product/Price is required: this uses
hosted Checkout with server-priced line items. Production uses `sk_live_...`,
`STRIPE_MODE=live` and its own endpoint signing secret. Keep existing AI guardrail,
service-role and private validator settings. Old Anthropic/Qwen/model-selection
environment variables can be removed; the model is pinned in server code.

1. Configure the Stripe account and USD billing/settlement as appropriate.
2. Register a webhook endpoint at `https://www.visamp.io/api/billing/webhook` for:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded`.
3. For local test mode, run `stripe listen --forward-to localhost:3000/api/billing/webhook`
   and put the CLI's signing secret in local configuration.
4. Configure tax registrations/product tax treatment with the merchant's adviser.
   Enable `STRIPE_AUTOMATIC_TAX=true` once Stripe Tax is ready. Prices exclude tax;
   checkout shows the final total. This code does not determine tax obligations.
5. Perform a Stripe test-card purchase, check the allocation and available balance,
   replay its event, then use an AI request and verify one 100-credit charge.
6. Test cancelled checkout, signed unpaid events, webhook retry after a DB outage,
   partial/full refunds and a refunded purchase with credits already used.
7. Verify live model access and validator connectivity before enabling AI on prod.

## Reservations and recoverable results

Reservations last at most ten minutes. Charged credits must still be unexpired
at completion. If a reserved grant expires, completion atomically replaces its
reservation using currently available unexpired credits in the normal order. If
there are insufficient replacement credits, the request fails with no charge and
a clear expiry error. Failure releases the reservation; expired unused credits
remain unavailable. A timed-out request cannot later charge after its
reservation is released. Completion locks the user and settles all allocations,
one ledger charge and the generated source in one transaction. The stream emits
success only after settlement. Billing history provides a result download if the
browser disconnects after payment. Undo does not refund a successful request.

## Payment integrity and refunds

Checkout creates a server-owned purchase with exact user, credits, base USD amount
and mode. Only a signed paid event matching that purchase can allocate credits.
The return URL only polls the balance. Purchase locking and unique Stripe IDs
prevent duplicate grants, including concurrent events. Failed fulfilment returns
an error so Stripe retries; unsigned events are rejected before DB access.

Refunds issued in Stripe revoke proportional credits using cumulative refunded
amounts (including tax proportionally), so duplicate/out-of-order refund events
cannot revoke twice. Unreserved purchased credits are removed first. Used/reserved
credits create a debt offsetting future available balance. This can make the
available balance negative; future purchases/grants offset it. Billing history
shows the refunded base-price portion, excluding tax. Refunds before fulfilment
are retried. Manual refund decisions remain an operator action in Stripe.

Chargeback/dispute automation is not implemented in this pass; monitor Stripe
and resolve account abuse/disputes operationally. Optional local-currency pricing
and video-export charging remain separate backlog work.

## Verification

Run `supabase/tests/ai_credit_purchases.sql` against a local/disposable database
with the migration applied. Tests roll back their fixtures. Web tests cover
pricing bounds, signed/unsigned events, wrong mode, failed fulfilment, OpenAI
routing and the purchase/editor UI. Real Stripe checkout requires configured
sandbox keys and a separate test database; mocked tests do not establish live
merchant configuration, tax setup or email verification delivery.

Validated in this pass: 73 web tests, 36 database assertions, simultaneous
admission and duplicate-payment races, TypeScript, targeted ESLint and the Next.js
production build. The build retains the existing async-WebAssembly target warning.
Desktop/mobile billing UI was checked with local fixtures. A real Sol request
passed the running render validator after three attempts. Stripe credentials were
not present, so the real test-card/webhook round trip remains a rollout check.
