# Tithe

Your work. Your terms. Your share.

Visit [Tithe](https://tithe-desk.vercel.app). Updates pushed to `main` deploy through the linked GitHub repository.

A tithe is the portion returned to the source that made the yield possible. Here, that source is a person who made something worth using.

Tithe gives creators a place to publish permission in their own words. A writer can allow research, price commercial use, ask for attribution, or draw a firm line around a competing product. A lab can describe its intended use, request a licence, and keep a public receipt. If the two sides disagree, GenLayer validators read the committed evidence and the terms that applied at the time.

This is a private licensing and arbitration layer. It is not a legal court judgment, proof of copyright ownership, or a guarantee of legal safe harbour. GenLayer Studio funds have no cash value.

## What is here

* A Next.js application with email only Privy sign in, managed transactions, light and dark themes, and a responsive receipt interface.
* A creator registry with verified source fingerprints, public price schedules, and immutable terms versions.
* A licence desk with consensus decisions, fee escrow, refusal refunds, and withdrawals.
* A dispute court with equal party bonds, historical terms, committed outputs, optional published respondent policies, embeddings, bonded review, and settlement.
* A Neon search index, authenticated agent API, and MCP server. The index can be rebuilt. The contracts remain authoritative. Public home totals cache actual chain reads for one minute.

The application starts with an empty register. There are no invented creators, earnings, or decisions. Live integration tests use separate contract deployments and leave the application register untouched.

## Run locally

Use Node 22.13 or later and Python 3.13 or later. Copy `.env.example` to `.env.local`, fill in the values through your secret manager, then run:

```sh
npm ci
npm run db:migrate
npm run index
npm run dev
```

Open http://localhost:3000. Configure your Privy app for email authentication and allow this origin. The interface offers email authentication only. Transactions are signed by distinct managed accounts so users do not need to connect a wallet.

`NEXT_PUBLIC_PRIVY_APP_ID` is public. The Privy app secret, database connection, account derivation secret, indexer secret, and deployment key belong on the server. None should have a `NEXT_PUBLIC_` prefix.

Generate `ACCOUNT_DERIVATION_SECRET` once as a random 32 byte hex value and back it up securely. It controls access to every managed account. Replacing it changes account addresses and loses access to the old balances. This is a custodial service; email authentication does not give users independent possession of account keys. The deployment wallet never signs user actions.

The desk offers real Studio faucet credits once per day. Fees and bonds are displayed before consent. A free licence still requires a consensus transaction.

## The contracts

Current addresses and deployment transactions are in [the Studio manifest](deployments/studionet.json). [Deployment verification](deployments/verification.json) records source hashes, schema checks, successful execution, and live reads. Older addresses remain in the manifest for recovery.

| Contract | Responsibility |
| :--- | :--- |
| `contracts/work_registry.py` | Source hashes, creator indexes, prices, immutable public terms |
| `contracts/licence_desk.py` | Permission decisions, escrow, release, refunds, withdrawals |
| `contracts/infringement_court.py` | Evidence, embeddings, rulings, bonds, review, settlement |

Each contract pins a concrete GenVM runner hash. The court also pins the embeddings runner and executes it inside a Seq block. Text uses `all-MiniLM-L6-v2` and mean nearest squared embedding distance across bounded text chunks. Image disputes compare the actual images and embed a deterministic spatial colour signature. That score describes semantic overlap; it is not a pixel similarity measurement or proof of infringement.

Validators independently assess decisions and agree on category, terms basis, canonical clause, reproduction finding, material unresolved-fact flags, damages band and policy hash. Insufficient outcomes may differ on context flags while reproduction, verdict, citation, basis and amounts still agree and the narrative is independently verified. Cite the lowest numbered applicable clause; duplicate terms are rejected and historical duplicates with matching normalized text map to their first occurrence. Distance agrees within five percent with a 1000ppm absolute floor. Court records include concrete factual reasoning, quoted clause, evidence references and damages justification. A separate independent validator check rejects unsupported leader reasoning. Identity, amounts, dates and record IDs come from contract state.

The reasoning check uses the terms selected by the agreed basis explicitly. A covered original grant uses its original clauses, even when later terms prohibit the use. In factual findings, `ESTABLISHED` means the evidence resolves a fact, including an admitted absence; it does not imply that attribution or a competing product exists. Unsupported and disputed facts still cannot be presented as established.

Registration accepts UTF8 text (24000 characters) and still PNG (2 MB). The backend downloads and validates public HTTPS bytes; the contract verifies the submitted bytes against SHA256 and preserves them on chain. Direct callers supply the same bounded base64 evidence. No contract performs HTTP requests, so caller-controlled DNS destinations, redirects and streamed-download size cannot affect validators. URLs are asserted provenance rather than authenticated origin or proof of ownership. Licence checks and every hearing use preserved bytes, so changing or withdrawing the original artifact cannot defeat adjudication. Download source/output snapshots from the work/docket pages.

Terms use one clause per nonempty line without duplicates. Every work has a disclosed lifetime limit of **128 terms versions**; the editing form shows remaining updates and stops offering edits at the limit. Prices are exact atto GEN decimal strings (18 decimals per GEN) for research, commercial, quotation or derivative use. A price does not grant permission by itself.

## Money and review

Payments first enter withdrawable contract credit through a simple native transfer. The managed service waits for that transfer to finalize, then submits the original consented action with no attached value. Evidence, model, timing or consent failures leave the credit available to withdraw. Existing credit is used before adding only the required shortfall. This avoids Studio retaining an unrecorded payment after a reverted value transaction.

Approved licence fees remain in escrow for one day. After that, anyone can release the fee to the creator's withdrawal credit. A refusal credits the requester immediately. Withdrawals use finalized value transfers and clear the credit before transfer.

A creator names the respondent, commits the output, states the time of use, and posts a bond. The application court requires 0.01 GEN per party. The respondent has seven days to agree explicitly to the proposed time and terms version and post an equal bond. Either party can propose a correction for the other to accept. Versions sharing a timestamp remain separate choices; nobody silently rewrites history. This agreement does not independently prove when use happened. An unanswered claim closes without a ruling and returns the creator's bond.

Both parties must commit usage evidence: actual purpose, distribution, commercial activity, competition, attribution inside and outside the artifact, and supporting evidence. Statements and their hashes are permanently signed and public. Material facts require consistent specific admissions from both parties or concrete evidence visible in the committed artifacts. Unilateral allegations, policies, intended-use plans, external links and documents of unverified authenticity do not prove actual activity. Missing or conflicting material facts produce **INSUFFICIENT_EVIDENCE**, not guilt or permission. The hearing includes the price schedule and records established/unresolved facts and damages grounds.

An optional policy must match its submitted SHA256 bytes and contain the claim/account binding marker. Its text stays preserved; the marker does not authenticate ownership of a website. An existing licence covers its original described use and terms after amendments only when established actual use fits that grant. The hearing also sees whether that licence fee was actually released, so a priced permission cannot be treated as paid when the fee is still in escrow.

A funded hearing must reach a ruling within one day of the response. If that deadline passes without one, anyone can close the hearing and both original bonds are returned. An expired review returns only its review bond and keeps the earlier ruling for settlement. Evidence withdrawal cannot obstruct a hearing; network/model failure can still require deadline recovery.

A ruling opens a two day review window. There are at most three bonded review rounds, costing 2, 4, then 8 times the initial bond. Each round commits review grounds and optional additional evidence, and preserves the earlier decision. The other party has the first quarter of the hearing window (six hours in the application) to submit a preserved response. A hearing waits for that response or deadline, then independently addresses the grounds and evidence. GenLayer selects the validators; Tithe cannot guarantee distinct validator identities between rounds. This application review path is separate from native network appeals.

At settlement, a permitted derivative or insufficient-evidence result returns both original bonds. An insufficient-evidence result also returns all unexpired review bonds to their depositors. No use awards both to the respondent. Use outside the terms returns the creator's bond and awards 25, 50, or 100 percent of the respondent bond according to the damages band. An appeal bond returns only when the final result improves that party's position; otherwise it goes to the opponent. Awards are limited to posted funds. Tithe cannot seize assets or collect a larger legal award.

## Agents

Sign in and create a key on `/developers`. The raw key appears once; only its digest is stored. A key acts as the same account and can spend its available funds, so give each agent a separate key and revoke it when its job ends. Key creation and revocation require an email session.

Public reads include `/api/works`, `/api/works/WORK_ID`, `/api/licences/LICENCE_ID`, and `/api/docket/CLAIM_ID`. Submit actions to `/api/actions` with a bearer key and an `Idempotency-Key` header. Poll the returned operation ID at `/api/operations/OPERATION_ID` through finalization. Accepted results are provisional. Public receipts explicitly read finalized chain state and include finality metadata; a record not yet finalized returns a bounded missing-state response. Public search indexes only finalized documents. Successful operations expose `result.record_id` for authoritative reads. Account records have separate pages for works, licences, claims and activity; credits remain visible regardless of the selected page. Submission is not approval: read the resulting licence or docket record for the actual decision.

The authenticated MCP endpoint is `/api/mcp`. It supports Streamable HTTP initialization and discovery, with tools for work search, work and licence details, current and historical terms, account balances and records, artifact inspection, actions, operation status, submission recovery, pending action cancellation, and docket reads. Protocol negotiation and tool errors are exercised with the official MCP client. Client configuration and a working licence request example are available in the developer guide.

Requests use bounded JSON, origin checks, hashed API keys, account ownership checks, and an encrypted signing outbox with account scoped authenticated encryption, expiring fenced leases, and persisted transaction hashes. Stored approval fields carry a server authentication seal, so edited database arguments or destinations cannot trigger a new signature. Artifact downloads validate all DNS answers, pin public addresses, reject redirects, and enforce download limits. Errors do not expose provider credentials. An uncertain broadcast is recovered by POSTing to `/api/operations/OPERATION_ID/resume`. The server authenticates the saved signer, network, hash and nonce and reuses exactly those bytes. It never replaces a payment. Pending actions with zero attached value can be canceled through `/api/operations/OPERATION_ID/cancel` or `cancel_operation`. Native funding transfers remain protected until credited. Unsigned expired leases release the account for a new consented request. The browser stores only the operation ID and request key to resume polling after a reload.

## Verify it

Install the Python tools with `python3 -m pip install -r requirements.txt`, then run:

```sh
npm run lint
npm run typecheck
npm test
npm run lint:contracts
npm run test:contracts
npm run build
npx playwright install chromium
npm run test:browser
```

The browser needs its own system libraries. On a machine with root, `npx playwright install --with-deps chromium` installs them; otherwise point `LD_LIBRARY_PATH` at an extracted copy, or Chromium exits reporting a missing `libnspr4.so`.

The contract tools load the host's pure Python protobuf before the GenVM SDK. This keeps a native extension from loading against a different packaged protobuf version on a fresh machine.

The test script shares the official runner bundle with the linter. This avoids an obsolete download filename in the direct test tool on a fresh installation. Runner hashes in the contracts stay pinned.

The direct contract tests substitute web, model, and embedding calls to check access, validation, funds, versions, and validator agreement quickly. They include hostile leader outputs, stale consent, failed evidence, all review rounds and credit recovery. Backend tests also exercise the official MCP client and stored appeal polling through the actual claim component. They are not evidence that a real model reached consensus.

`npm run test:studio` deploys isolated contracts and exercises preserved source/output/policy evidence, actual ONNX embeddings, real text/image/policy/intended-use injection checks, conflicting-context insufficiency, approval, refusal, historical terms, bonded review, and finalized refunds. Its signed transaction recovery state stays in ignored `.secrets` files. Use a new `STUDIO_TEST_RUN` identifier for a fresh run. [The live report](deployments/studio-verification.json) includes transaction references and source hashes. The isolated live suite uses declared shorter constructor durations to exercise fee release and settlement without changing the shared network clock. The application retains one day escrow and two day appeals. Deadline controls read the network clock, which can differ from the browser clock.

With the app running, `npm run test:api` verifies real Neon authorization, public artifact hashing, MCP tools, origins, and key revocation, and `npm run test:mcp` drives the same endpoint with the official MCP client. Their temporary test keys are removed afterward. `npm run verify:deployment` compares every deployed source byte with the repository and checks execution and live reads.

`npm run test:outbox` and `npm run test:budget` run against the real database rather than a substitute. They check unsigned lease expiry, signed payment retention, a single lease winner under eight concurrent contenders, stale fencing, and the rolling network budget's hourly and per minute ceilings. Both clean up after themselves.

[The verification record](docs/validation.md) describes what was exercised and what still needs a live check.

## Operate it

`npm run deploy:contracts` uses the ignored deployment key and resumes transactions recorded in the manifest. Existing deployments are immutable. A contract revision requires a new registry, desk, and court wiring; preserve the previous manifest and migrate any existing records deliberately. Never replace a deployment containing user funds as a routine update.

Build with `npm run build` and run with `npm start` on a Node host. A Dockerfile is included. Set the public Privy app ID at build time, configure server secrets at runtime, set `NEXT_PUBLIC_APP_URL` to the real origin, and allow that origin in Privy. The contracts are deployed to Studio. The Vercel project is linked to `dotmantissa/tithe`, with `main` as its production branch and [tithe-desk.vercel.app](https://tithe-desk.vercel.app) as its production address. Commit and push changes to live `main` to deploy. Before calling a release complete, verify that the production alias points to a READY deployment whose source is Git and whose commit SHA matches live `main`.

GitHub Actions invokes the authenticated `/api/maintenance` route every five minutes using the encrypted repository secret `TITHE_CRON_SECRET`. Vercel Hobby's daily 03:00 UTC cron is a fallback. The route prioritizes saved payment recovery, then processes six index pages with fenced leases. Scans freeze a starting count and preserve progress across revisions/appends; subsequent passes refresh old records and collect new IDs. They do not require a stable entire collection, and do not pretend to be an atomic multi-record snapshot. Finalized operations refresh individual targets. On another Node host schedule `npm run reconcile` and `npm run index`, or invoke the same authenticated endpoint. Scheduler delays do not destroy progress.

Caller limits apply before public chain access: 20 public requests/minute and 120/hour per trusted IP. Self-hosting uses a shared anonymous bucket unless `TRUSTED_CLIENT_IP_HEADER` names a header overwritten by a sanitizing trusted proxy. The shared rolling Studio cap is 35/minute and 400/hour; public RPC traffic gets at most 10/minute and 80/hour. Ordinary traffic cannot consume the last 10/minute or 100/hour, reserved for authenticated signing, polling and payment recovery. Maintenance is bounded separately. Explicit missing-record membership results are cached for 30 seconds; provider failures are never cached as missing. Positive views cache for 15 seconds, with final/nonfinal variants in their keys and identical concurrent reads coalesced. The protected `/api/sync` endpoint remains available with `INDEXER_SECRET`.

The runtime dependency audit currently has no high or critical advisories; moderate upstream advisories remain. Recheck dependencies before a production release. Studio, managed custody, and bounded private arbitration are deliberate limits of this version.
