/**
 * Paid product content. Kept as a TypeScript module rather than a file in
 * public/ or on disk: it is guaranteed to be bundled into the serverless
 * function, it cannot be hotlinked, and it needs no outputFileTracing config.
 *
 * {{PRICE_TABLE}} is substituted at delivery time with the live catalog, so a
 * downloaded copy is never stale.
 */

export const HANDBOOK_EN = `# The Open-Model API Handbook

## Selection and Cost Engineering for Open-Source LLM APIs

Version 1.0 · tokshop.xyz

---

## About this handbook

This is a working document from a production system, not a survey of the field.
Everything described here runs on tokshop.xyz: an OpenAI-compatible API that
resells open-source models, bills per token, takes payment on two continents,
and publishes its own SEO content automatically.

Where a number appears, it is either derived from published provider pricing or
from arithmetic you can redo yourself. Where something is uncertain, this
handbook says so instead of guessing. There are no case studies with invented
revenue figures, because inventing them would make the rest of the document
worthless.

Three things you should know before spending your dollar:

1. This handbook is about **unit economics and billing correctness**, not about
   prompt engineering. If you want prompt techniques, this is the wrong purchase.
2. The code patterns are TypeScript on serverless infrastructure with Postgres.
   The reasoning transfers to any stack; the exact snippets assume this one.
3. The price appendix is generated the moment you download, from the same
   database that serves the public catalog.

---

## Chapter 1. The only pricing model that survives contact with reality

### 1.1 Why per-token beats subscriptions for a reseller

A subscription decouples what you charge from what you owe upstream. That is
fine when your marginal cost is near zero. It is ruinous when your marginal cost
is a per-token bill from someone else, because a single heavy user can consume
more than a month of revenue in an afternoon.

Per-token billing keeps the two coupled: every dollar of cost is triggered by a
dollar-plus of revenue. The engineering price you pay for that safety is that
your metering has to be correct, all the time, including when a request is
aborted halfway. Chapter 3 is about exactly that.

### 1.2 The retail multiplier

The simplest defensible model is a fixed multiplier on upstream cost:

    retail_price = upstream_price * multiplier

tokshop.xyz uses **1.5**, giving a 33.3% gross margin on token revenue:

    margin_fraction = (1.5 - 1) / 1.5 = 0.333

Pick the multiplier before you pick your price points, because the multiplier is
what determines whether a given price point can survive its payment fees. A
common mistake is to choose round retail prices first and discover afterwards
that the margin cannot absorb the processor's cut.

Two properties make a fixed multiplier worth the simplicity:

- **It is auditable.** A customer can compare your published price to the
  upstream provider's published price and see the markup. Hiding the markup
  invites the suspicion that it is worse than it is.
- **It self-corrects.** When an upstream provider drops prices - which
  open-source model providers do frequently - your retail price drops with it,
  and your margin fraction is unchanged.

### 1.3 What you are actually selling

You are not selling tokens. Tokens are a commodity that the upstream provider
sells more cheaply than you do. You are selling four things the upstream
provider does not bundle:

- **One credential for many models.** Switching models becomes a string change
  instead of a new vendor relationship.
- **Prepaid spend with a hard ceiling.** A prepaid balance cannot produce a
  surprise invoice. For a hobbyist or a demo, that is worth more than a few
  percent of price.
- **No minimum and no contract.** Most upstream providers have a floor. If
  yours does not, that is a real product feature.
- **A billing record you can audit.** Per-call token counts and costs, visible
  immediately.

If you cannot articulate which of these you are selling, your markup is
arbitrary and a price war will remove it.

---

## Chapter 2. Payment fees decide your price points

This chapter contains the single most useful piece of arithmetic in the
handbook, and the one most often skipped.

### 2.1 Fixed fees are the whole story at low prices

Payment fees come in two parts: a percentage and a fixed amount per
transaction. At high ticket prices the percentage dominates and the fixed part
is noise. At low ticket prices it inverts completely.

Take a merchant-of-record processor charging **3.9% + $0.40**:

| Order | Fee | Fee as % of order |
| --- | --- | --- |
| $1 | $0.439 | 43.9% |
| $3 | $0.517 | 17.2% |
| $5 | $0.595 | 11.9% |
| $20 | $1.180 | 5.9% |
| $100 | $4.300 | 4.3% |

Now combine that with a 1.5x retail multiplier, where the credits sold on an
order of size \`A\` cost you \`A / 1.5\` upstream:

    net = A - fee(A) - A/1.5

| Order | Fee | Upstream cost | Net |
| --- | --- | --- | --- |
| $1 | $0.439 | $0.667 | **-$0.106** |
| $3 | $0.517 | $2.000 | +$0.483 |
| $5 | $0.595 | $3.333 | +$1.072 |
| $20 | $1.180 | $13.333 | +$5.487 |
| $100 | $4.300 | $66.667 | +$29.033 |

The one-dollar top-up **loses money on every sale**. Not a little: it is
structurally impossible to fix by tuning, because the fee plus the upstream cost
exceed the revenue before you have done anything.

### 2.2 The break-even price point

Solve for where net crosses zero, with percentage fee \`p\`, fixed fee \`f\`, and
multiplier \`m\`:

    A - (p*A + f) - A/m = 0
    A * (1 - p - 1/m) = f
    A_min = f / (1 - p - 1/m)

With p = 0.039, f = 0.40, m = 1.5:

    A_min = 0.40 / (1 - 0.039 - 0.6667) = 0.40 / 0.2943 = $1.36

So $1.36 is the floor. Anything below it is a marketing expense, and should be
budgeted as one.

This formula is the whole chapter. Put your own numbers in it before you publish
a price list. Note what it implies: **raising your multiplier lowers your
minimum viable price**, which is the honest argument for a higher markup on
small orders.

### 2.3 Why a second rail changes the answer

Not all processors have a fixed fee. Wallet rails in China - Alipay and WeChat
Pay reached through a service provider - are typically all-percentage:
roughly 0.38% to 0.6% to the wallet operator plus 1% to 2% to the provider, so
about 2.6% all-in with **no fixed component**.

Rerun the same one-dollar order:

| Rail | Fee on $1 | Upstream cost | Net |
| --- | --- | --- | --- |
| Card, 3.9% + $0.40 | $0.439 | $0.667 | -$0.106 |
| Wallet, 2.6% flat | $0.026 | $0.667 | **+$0.307** |

The same product at the same price is a loss on one rail and a healthy margin on
the other. And by the break-even formula, \`f = 0\` makes \`A_min\` zero: on an
all-percentage rail there is no minimum viable price at all.

The practical consequences:

- **Micro-priced products belong on all-percentage rails.** If your cheap entry
  product only reaches customers through a fixed-fee card rail, it is an ad, not
  a product.
- **Route by geography, not by preference.** Offer the rail that works where the
  customer is. Do not try to push everyone onto the one that is cheapest for you;
  a failed payment costs 100%.
- **Model each rail separately.** A blended average fee will hide a
  loss-making segment.

### 2.4 The costs that are easy to forget

- **Payout fees.** A flat withdrawal fee (say $7, or 1% if larger) is 14% of a
  $50 withdrawal and 1% of a $700 one. Withdraw in larger, less frequent
  batches; the money is not earning anything either way.
- **Currency conversion.** If you charge in one currency and settle in another,
  a conversion spread applies somewhere. Find out where before you are surprised.
- **Disputes.** A chargeback typically costs a fixed dispute fee on top of the
  refund. One dispute can erase the margin on dozens of small orders, which is
  the real reason to answer refund emails within a day.
- **Failed-payment retries.** Some processors charge for declines.

### 2.5 Merchant of record, or not

A merchant of record becomes the legal seller. It collects and remits VAT, GST
and sales tax worldwide, and you never register for tax in a country you have
never visited. You pay for this in the percentage.

A payment service provider only moves money. Tax registration, invoicing and
compliance stay with you.

For a solo operator selling globally, the merchant-of-record premium is almost
always worth it, for a reason that has nothing to do with money: the failure
mode of getting cross-border VAT wrong is not a smaller profit, it is a
liability you discover years later. Buy the insurance.

But be precise about which of your rails is which. A domestic wallet rail
reached through a technical service provider is usually **not** a merchant of
record, so income through it is your own business income and yours to declare.
Mixing the two up in your bookkeeping is the most common accounting error in
this business.

---

## Chapter 3. Metering that cannot lose money

An API reseller has exactly one unforgivable bug: serving a response you do not
bill for. This chapter is about the three places it happens.

### 3.1 Store money with enough decimal places

A single small call can cost less than a hundredth of a cent. At an input price
of $0.27 per million tokens, 100 tokens costs $0.000027.

Store balances and costs with **eight decimal places**, not two:

    balance  numeric(16,8)
    cost     numeric(16,8)

Two decimal places rounds that call to zero. A user making a million small calls
would pay nothing at all, and you would not notice until the upstream invoice
arrived. Use exact decimal types, never floating point, for anything that is
money.

The cost expression itself is unremarkable:

    cost = input_tokens  * input_price_per_million  / 1e6
         + output_tokens * output_price_per_million / 1e6

### 3.2 The balance gate belongs before the upstream call

Check the balance before forwarding, and refuse with HTTP 402 when it is
exhausted. 402 is the correct status - it exists for exactly this - and clients
handle it distinctly from 401.

A design decision worth making consciously: gate on \`balance > 0\`, not on
\`balance >= estimated_cost\`. You cannot know the cost before the call, because
output length is unknown. So a request that starts with a positive balance is
allowed to finish and may push the balance slightly negative. The alternative -
reserving an estimated amount up front - means holding funds and reconciling
later, which is a lot of machinery to avoid a few cents of exposure per user.
Take the few cents.

Be explicit about it in your terms, though, so a negative balance is never a
surprise.

### 3.3 Streaming is where the money leaks

Non-streaming responses are easy: the body contains a usage object, you bill it,
done.

Streaming has two traps.

**Trap one: the usage block is optional.** In the OpenAI streaming protocol, a
stream only reports token usage if the request asked for it. If your customer
omits that option, you receive no usage and bill nothing.

The fix is to stop trusting the client. Rewrite the request before forwarding:

    body.stream_options = { ...body.stream_options, include_usage: true }

Now usage arrives regardless of what the caller sent. This single line is the
difference between billing all streamed traffic and billing only the fraction
whose authors happened to opt in.

**Trap two: settling too late.** If you bill after the stream is fully consumed
by the client, a client that disconnects at 90% never triggers settlement -
while the upstream provider has already generated and charged you for the whole
completion.

Settle inside the stream transform's **flush** step, which runs when the
upstream stream ends, not when the client finishes reading. Structurally:

    transform(chunk) {
      capture usage if this chunk carries it
      pass chunk through
    }
    flush() {
      settle(captured usage)   // runs on upstream completion
    }

The order matters: capture during transform, settle in flush, and never make
settlement conditional on the client's behaviour.

### 3.4 Log every call, and let the customer read it

Record per call: model, input tokens, output tokens, cost charged, whether it
streamed, timestamp. Show it in the dashboard immediately.

This is not a nicety. It is the artefact that turns a billing dispute into a
one-minute conversation, and per-token pricing is only trustworthy if it is
checkable. It also makes your own margin analysis possible: you cannot tell
which models are worth carrying without per-model volume.

### 3.5 API keys: hash them and mean it

Show the key once at creation. Store a hash and a short display prefix. Never
store the key.

The consequence is that you genuinely cannot recover a lost key, only revoke and
reissue. Say that in the UI. Every system that can email you your key is a
system where a database leak is a total compromise.

Look keys up by hash on every request, and check a status column so revocation
is immediate rather than eventually consistent.

---

## Chapter 4. Taking money without losing track of it

Payment bugs are worse than metering bugs, because they are visible to the
customer and they involve money that has already moved.

### 4.1 Create the order before you leave your own system

The order row is created first, in \`pending\`, and only then does the customer go
to the provider's page. The provider is handed your order id as its reference.

This ordering means every payment that ever happens has a home to land in. The
reverse - creating the record when the callback arrives - loses any payment whose
callback is malformed, delayed, or arrives while you are deploying.

It also gives you a reconciliation surface: pending orders older than an hour
are exactly the set worth investigating.

### 4.2 Never render the payment form

Redirect to the provider's hosted page for every rail. The customer enters card
or wallet details on the provider's domain, and your servers never see them.

This is not laziness, it is scope reduction. Card data touching your
infrastructure changes your compliance obligations. Hosted pages also come with
wallet support - Apple Pay and Google Pay - that you would otherwise implement
and maintain per platform, and they are usually better at conversion than
anything you would build, because the provider A/B tests them across every
merchant.

### 4.3 Two layers of idempotency, because callbacks repeat

Every payment provider delivers callbacks more than once. Some retry on
timeouts, some retry on non-2xx responses, some just retry. Assume at-least-once
delivery.

**Layer one: record the event id, uniquely.**

    unique (provider, event_id)

Insert the event with \`on conflict do nothing\`. If the insert produced no row,
you have seen this event; acknowledge and stop. Note that the key includes the
provider, so two providers with colliding id schemes cannot shadow each other.

**Layer two: make the state transition conditional.**

    update orders set status = 'paid'
     where id = $1 and status = 'pending'

The \`and status = 'pending'\` is the load-bearing part. Only one execution can
ever match, so two distinct events for the same order still credit once. This
layer covers what layer one cannot: different event ids describing the same
payment.

Neither layer alone is enough. Implement both.

### 4.4 Settle atomically, even without transactions

Marking an order paid and crediting the balance are two writes that must not
come apart. If the process dies between them, the order says paid and the
customer has nothing.

Serverless Postgres drivers over HTTP often have no interactive transactions, so
\`BEGIN ... COMMIT\` across two round-trips is not available. The answer is to
express both writes as **one statement** with a CTE:

    with paid as (
      update orders set status = 'paid', paid_at = now()
       where id = $1 and status = 'pending'
      returning user_id, credits, kind
    ),
    credited as (
      update users u set balance = u.balance + p.credits
        from paid p
       where u.id = p.user_id and p.kind = 'credits'
      returning u.id
    )
    select * from paid;

One statement is one transaction. The conditional update from layer two is still
in there, so this is atomic and idempotent at once. It is also a single network
round-trip, which happens to be faster than the two it replaces.

Notice \`balance = balance + credits\` rather than reading the balance and writing
a computed value. Read-modify-write across a round-trip loses concurrent
credits; the database does the addition, so it cannot.

### 4.5 Verify signatures, and re-verify weak ones

Signature schemes are not equally strong, and your handling should reflect that.

**HMAC over the raw body** is the strong form. Compute the digest over the exact
bytes received, before parsing. Two details people get wrong:

- Compare with a **timing-safe** comparison, and guard the length first, because
  timing-safe comparators typically throw on length mismatch.
- Sign the *raw* body. If you parse and re-serialise, key order and number
  formatting change and the digest will not match.

**Sorted-parameter MD5 with a shared secret** is the weaker form still common in
domestic Chinese payment rails: sort the parameters by key, join them, append
the secret, hash. It authenticates, but it is guessable-adjacent and the secret
is shared with a third party.

For the weak form, add a second check: **query the provider for the order's
status and compare the amount** before crediting anything.

    if remote.status != PAID: acknowledge, credit nothing
    if abs(remote.amount - our.expected_amount) > 0.01: refuse

This converts a replayed or forged callback into a no-op, because the attacker
would have to also convince the provider that the order was paid. Any callback
you cannot independently confirm should be treated as a hint to go and check,
not as an instruction to pay out.

### 4.6 Return exactly what the provider expects

Providers infer success from your response. One expects a JSON 200. Another
expects the literal body \`success\` and retries six times if it sees anything
else.

Read the specification and match it exactly. Then use it deliberately: for a
transient failure on your side, return the non-success response *on purpose* so
the retry happens. A provider's retry loop is free durability, but only if you
do not accidentally suppress it by acknowledging failures.

### 4.7 Handle the reversal path before you launch

Almost everyone implements payment and stops. Then a refund arrives, and the
customer keeps both the money and the credits.

Handle refunds and lost disputes symmetrically with the paid path:

    with reversed as (
      update orders set status = 'refunded'
       where id = $1 and status = 'paid'
      returning user_id, credits, kind
    ),
    debited as (
      update users u set balance = greatest(u.balance - r.credits, 0)
        from reversed r
       where u.id = r.user_id and r.kind = 'credits'
      returning u.id
    )
    select * from reversed;

Two decisions embedded there:

- \`greatest(..., 0)\` floors the balance at zero. If the customer already spent
  what they are reclaiming, you absorb the difference rather than creating a
  negative balance they can never clear. That is a deliberate choice to keep
  accounts usable; the loss is capped and small.
- For access-granting products, the status change is the entire revocation,
  because every access check requires \`status = 'paid'\`. Model entitlements as
  "a paid order exists", never as a separate boolean that has to be kept in sync.

---

## Chapter 5. Guest checkout for micro-priced products

Requiring registration before a one-dollar purchase loses most of the buyers.
But a balance needs an account to live in. The resolution is to treat the two
product types differently.

### 5.1 Which products can skip the account

- **Balance top-ups need an account.** There is nowhere to put credits
  otherwise, and any account-less scheme is an account with worse ergonomics.
- **Access-granting products do not.** A purchase that grants a download only
  needs a durable way for the buyer to come back.

### 5.2 Making the order row nullable is the whole schema change

    user_id uuid null references users(id)
    email   text            -- always written

A guest order has an email and no user. When someone registers or signs in, bind
the orphans:

    update orders set user_id = $1
     where user_id is null and lower(email) = lower($2)

Run it on both register and sign-in. On register it catches the buy-then-join
path; on sign-in it catches buy-as-guest-while-logged-out, which is more common
than you would expect because people buy from a different browser.

Match case-insensitively. Emails are entered inconsistently and a mismatch here
silently hides someone's purchase.

### 5.3 Three credentials for one entitlement

Without an account, the paid order *is* the entitlement. Accept several proofs,
in decreasing strength:

1. **A session** whose account owns a paid order for the product.
2. **A signed access cookie** issued at delivery, carrying the order id.
   Signed, so it cannot be forged; a cookie, so re-downloading needs no thought.
3. **A redeem code**, which is what the buyer keeps as a long-term receipt.

Generate redeem codes from an alphabet with no \`0\`, \`O\`, \`1\`, \`I\` or \`L\`.
Codes get read aloud, retyped from screenshots, and pasted with a trailing
space; ambiguity in the alphabet turns into support email.

A redeem code is a bearer token, so cap deliveries per order. A limit generous
enough that no honest buyer meets it, low enough that a code posted publicly
stops working, is enough. Do not build DRM for a one-dollar document; the
tradeoff is not worth the friction it adds for real customers.

### 5.4 The delivery page and the callback race

The buyer arrives back on your site as soon as the provider redirects. The
webhook may not have landed yet. So the delivery page will sometimes be asked to
render an order that is still \`pending\`.

Do not paper over this by trusting the redirect. Separate the two questions:

- **"Did this visitor start this checkout?"** Answer with your own signed token
  in the return URL. Do not build this on the provider's own return signature
  unless you can verify its algorithm from the specification - if you cannot
  verify it, you cannot rely on it, and an HMAC you control is just as good for
  this purpose.
- **"Has this been paid?"** Answer only from the order row. That is the single
  source of truth, written by the signature-verified callback.

When the token is valid and the order is still pending, say so plainly and
refresh. Where the provider offers a status query, calling it here also turns a
lost callback into a self-healing case.

---

## Chapter 6. Choosing models on cost per useful answer

Comparing price per million tokens is comparing the wrong number.

### 6.1 The number that matters

What you care about is:

    cost_per_useful_answer = cost_per_call / success_rate

where success is defined by your task: the JSON parsed, the classification was
right, the summary did not need redoing. A model at half the price with a 70%
success rate is more expensive than the pricier model at 95%:

    cheap:     1.00 / 0.70 = 1.43
    expensive: 1.80 / 0.95 = 1.89   -- still worse here
    cheap:     1.00 / 0.50 = 2.00   -- now the expensive one wins

Run the arithmetic with your own success rates. The ranking flips at plausible
values, which is exactly why price-per-token comparisons mislead.

### 6.2 Output price dominates more than you expect

Output tokens usually cost several times input tokens, and for generative work
the output is what you are paying for. Two prices published as one number can
hide a factor of three.

Before comparing, measure your own input-to-output ratio. A classifier with a
long prompt and a one-word answer is priced almost entirely by input; a
summariser is priced almost entirely by output. The cheaper model for one is
often the dearer model for the other.

### 6.3 What to measure before you commit

- **Task success on your own data.** Fifty real examples beat any public
  leaderboard for your specific use. Leaderboards measure a distribution that is
  not yours.
- **Latency distribution, not the mean.** The p95 is what your users experience
  as "slow". A model with a good mean and a terrible tail feels worse than a
  uniformly mediocre one.
- **Real context capacity.** An advertised window is where the model stops
  erroring, not where it stops degrading. Test retrieval accuracy at the length
  you actually use.
- **Behaviour under load.** Rate limits and queueing during peak hours are part
  of the price. So is the provider's failure mode: does it queue, or does it
  drop?

### 6.4 Keep switching cheap

Every model you integrate should be one identifier in a table, not a code path.
Map a public slug to an upstream id, keep prices as data, and mark models
active or inactive with a flag.

That way adding a model is a row, a price change is an update, and a
deprecation is a boolean. This matters more in open-source model serving than
anywhere else, because the frontier moves in weeks: a model you integrate today
will be superseded well before any code you write about it needs changing.

---

## Chapter 7. Automating the content that brings customers

A developer API has no viral loop. Traffic comes from people searching for a
problem, and increasingly from assistants answering on their behalf. Both can be
served by the same content, but only if it is written for machine extraction.

### 7.1 Answer first, always

Both search snippets and assistant answers extract short, self-contained
passages. Structure every article for extraction:

- A **TL;DR** at the top that answers the title's question in two or three
  sentences and stands alone if quoted with no context.
- **Question-shaped headings**, because they match how questions are asked.
- **Short paragraphs**, three sentences or so, each making one point.
- A closing **FAQ**, which is both genuinely useful and directly consumable as
  structured data.

The test to apply: if a machine lifted any single paragraph out of the page,
would it still be true and useful? If it needs the paragraph above it to make
sense, it will be quoted wrongly.

### 7.2 Machine-readable surfaces are cheap and worth it

- \`robots.txt\` should explicitly allow the assistant crawlers you want to be
  read by. Silence is ambiguous, and some crawlers treat it as such.
- \`llms.txt\` gives a compact, link-rich summary of what the site offers.
- Structured data for articles, FAQs, breadcrumbs, products and offers, all
  generated from the same source as the visible page so they cannot drift apart.
- An immediate-indexing ping on publish, rather than waiting to be crawled.

### 7.3 Generated content needs a fact-checking gate, not a style gate

If you generate articles with a model, the failure that will hurt you is not
clumsy prose. It is a confidently stated wrong price.

So the quality gate must check facts against your own database, not just
readability. Concretely: extract every price claim from the draft, look each one
up in the live catalog, and reject the article if any of them disagrees.

This is the highest-value hundred lines in a content pipeline. A blog that
misquotes your own prices does more damage than no blog, because it converts a
visitor into someone who thinks you are careless with numbers - the exact thing
they are trusting you not to be.

Add structural checks alongside it: the TL;DR exists, there is an FAQ, headings
are questions. Structure is mechanically checkable, so check it mechanically.

### 7.4 Translate, and do the hreflang properly

If your market is bilingual, publish both languages as separate URLs with
reciprocal \`hreflang\` annotations and correct \`lang\` attributes. Machine
translation of a technical article is good enough now that the marginal cost is
close to zero and the reach roughly doubles.

The part that goes wrong is not the translation, it is the annotations. Every
language version must point at every other one, including itself, and the
canonical URL must point at the version it is on, not at the English original.

---

## Chapter 8. The operational minimum

Things that are boring, cheap, and the reason a small service stays up.

**Idempotency everywhere money moves.** Not just webhooks. Any endpoint that can
be retried should be safe to retry.

**One source of truth per fact.** Prices in the database, product definitions in
one module, and every page reading from them. The most common bug in a small
commerce site is a price hardcoded in three places, two of which are stale. If
you find yourself editing the same number twice, you have already got the bug.

**Automated end-to-end tests against production.** Not unit tests of your
mocks: real requests to the live system checking that the checkout responds, the
webhook rejects a bad signature, a duplicate callback credits once, and a
tampered amount is refused. Run them on every deploy.

**Alert on the reconciliation gap, not on error rates.** The dangerous state is
silent: pending orders that never settled, or usage logged against a balance
that never moved. Count those on a schedule.

**Legal pages before payment onboarding.** Terms, refunds and privacy are a
prerequisite for a payment account, not paperwork you add later. Write them
specifically enough to be true. A refund policy that promises what your code
actually does is worth more than a generous one you cannot honour.

**Two rails, independently switchable.** Any single processor can suspend you
with little notice. If each rail is separately enabled by configuration, losing
one degrades the checkout options instead of stopping sales.

---

## Closing note

None of this is difficult. It is a few hundred lines of careful code and one
piece of arithmetic done before choosing price points. What makes it valuable is
that the failure modes are quiet: a stream that does not bill, a callback
credited twice, a one-dollar product that loses a dime a sale. None of them page
you. All of them compound.

If you take one thing from this handbook, take the break-even formula from 2.2
and run it on your own numbers before you publish a price.

Questions and corrections are genuinely welcome: mingxinai@agentmail.to. If you
find an error here, tell us and we will fix the document - buyers get updates at
no cost.

---

## Appendix: live price catalog

The table below was generated from the production database at the moment you
downloaded this file, so it matches what the public API returns right now. The
authoritative source is always \`GET https://tokshop.xyz/v1/models\`.

{{PRICE_TABLE}}

---

*The Open-Model API Handbook, version 1.0. Sold by tokshop.xyz. Licensed for the
purchaser's own use; please do not redistribute. Corrections and updates are
free to buyers - use your redeem code to fetch the current version at any time.*
`;
