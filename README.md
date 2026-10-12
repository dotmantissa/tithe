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

Validators must agree exactly on the category, terms basis, numbered terms clause, damages band, and policy hash. Distance must agree within five percent, with an absolute floor of 1000 parts per million near zero. The comparative validation approach follows [GenLayer's non determinism documentation](https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism). A score never overrides the written conditions. Only these canonical fields leave consensus. Explanations are derived from the bound decision and clause, and are excluded from later evidence. Identity, amount, dates and record IDs come from contract state.

Registration accepts directly reachable public HTTPS artifacts, with a limit of 2 MB and 24000 text characters. Supported images are still PNG and WebP. Animated images, audio, and video are outside this version. Keep the registered bytes available at their original URL: a changed or missing source cannot be silently substituted in a later hearing.

Terms use one clause per nonempty line. Prices are exact decimal strings in atto GEN, with 18 decimal places per GEN. A schedule can price research, commercial, quotation, or derivative use; a price alone never grants permission. The panel still assesses the actual terms.

## Money and review

Payments first enter withdrawable contract credit through a simple native transfer. The managed service waits for that transfer to finalize, then submits the original consented action with no attached value. Evidence, model, timing or consent failures leave the credit available to withdraw. Existing credit is used before adding only the required shortfall. This avoids Studio retaining an unrecorded payment after a reverted value transaction.

Approved licence fees remain in escrow for one day. After that, anyone can release the fee to the creator's withdrawal credit. A refusal credits the requester immediately. Withdrawals use finalized value transfers and clear the credit before transfer.

A creator names the respondent, commits the output, states the time of use, and posts a bond. The application court requires 0.01 GEN per party. The respondent has seven days to agree explicitly to the proposed time and terms version and post an equal bond. Either party can propose a correction for the other to accept. Versions sharing a timestamp remain separate choices; nobody silently rewrites history. This agreement does not independently prove when use happened. An unanswered claim closes without a ruling and returns the creator's bond.

Before a response bond is accepted, validators verify the source and challenged output. An optional policy must contain the claim and responding account publication marker and match the supplied fingerprint. Its text and hash stay locked through reviews. An existing licence covers its original described use and terms even after an amendment; validators bind whether the original grant or use time terms apply.

A funded hearing must finish within one day. If it cannot, anyone can close it and return both original bonds. An expired review returns only its review bond and retains the earlier ruling for settlement. Missing evidence never becomes a verdict.

A ruling opens a two day review window. There are at most three bonded review rounds, costing 2, 4, then 8 times the initial bond. Each round starts a fresh consensus transaction and preserves the earlier decision. GenLayer selects the validators; Tithe cannot guarantee distinct validator identities between rounds. This application review path is separate from native network appeals.

At settlement, a permitted derivative returns both original bonds. No use awards both to the respondent. Use outside the terms returns the creator's bond and awards 25, 50, or 100 percent of the respondent bond according to the damages band. An appeal bond returns only when the final result improves that party's position; otherwise it goes to the opponent. Awards are limited to posted funds. Tithe cannot seize assets or collect a larger legal award.

## Agents

Sign in and create a key on `/developers`. The raw key appears once; only its digest is stored. A key acts as the same account and can spend its available funds, so give each agent a separate key and revoke it when its job ends. Key creation and revocation require an email session.

Public reads include `/api/works`, `/api/works/WORK_ID`, `/api/licences/LICENCE_ID`, and `/api/docket/CLAIM_ID`. Submit actions to `/api/actions` with a bearer key and an `Idempotency-Key` header. Poll the returned operation ID at `/api/operations/OPERATION_ID` through finalization. Accepted results are provisional. Successful operations expose `result.record_id` for authoritative reads. Account records have separate pages for works, licences, claims and activity; credits remain visible regardless of the selected page. Submission is not approval: read the resulting licence or docket record for the actual decision.

The authenticated MCP endpoint is `/api/mcp`. It supports Streamable HTTP initialization and discovery, with tools for work search, work and licence details, current and historical terms, account balances and records, artifact inspection, actions, operation status, submission recovery, and docket reads. Protocol negotiation and tool errors are exercised with the official MCP client. Client configuration and a working licence request example are available in the developer guide.

Requests use bounded JSON, origin checks, hashed API keys, account ownership checks, and an encrypted signing outbox with account scoped authenticated encryption, expiring fenced leases, and persisted transaction hashes. Artifact downloads validate all DNS answers, pin public addresses, reject redirects, and enforce download limits. Errors do not expose provider credentials. An uncertain broadcast is recovered by POSTing to `/api/operations/OPERATION_ID/resume`. The server authenticates the saved signer, network, hash and nonce and reuses exactly those bytes. It never replaces a payment. Unsigned expired leases release the account for a new consented request. The browser stores only the operation ID and request key to resume polling after a reload.

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

The contract tools load the host's pure Python protobuf before the GenVM SDK. This keeps a native extension from loading against a different packaged protobuf version on a fresh machine.

The test script shares the official runner bundle with the linter. This avoids an obsolete download filename in the direct test tool on a fresh installation. Runner hashes in the contracts stay pinned.

The direct contract tests substitute web, model, and embedding calls to check access, validation, funds, versions, and validator agreement quickly. They are not evidence that a real model reached consensus.

`npm run test:studio` deploys isolated contracts and exercises real web fetching, actual ONNX embeddings, approval, refusal, historical terms, bonded review, and finalized refunds. Its signed transaction recovery state stays in ignored `.secrets` files. Use a new `STUDIO_TEST_RUN` identifier for a fresh run. [The live report](deployments/studio-verification.json) includes transaction references and source hashes. The isolated live suite uses declared shorter constructor durations to exercise fee release and settlement without changing the shared network clock. The application retains one day escrow and two day appeals. Deadline controls read the network clock, which can differ from the browser clock.

With the app running, `npm run test:api` verifies real Neon authorization, public artifact hashing, MCP tools, origins, and key revocation. Its temporary test key is removed afterward. `npm run verify:deployment` compares every deployed source byte with the repository and checks execution and live reads.

[The verification record](docs/validation.md) describes what was exercised and what still needs a live check.

## Operate it

`npm run deploy:contracts` uses the ignored deployment key and resumes transactions recorded in the manifest. Existing deployments are immutable. A contract revision requires a new registry, desk, and court wiring; preserve the previous manifest and migrate any existing records deliberately. Never replace a deployment containing user funds as a routine update.

Build with `npm run build` and run with `npm start` on a Node host. A Dockerfile is included. Set the public Privy app ID at build time, configure server secrets at runtime, set `NEXT_PUBLIC_APP_URL` to the real origin, and allow that origin in Privy. The contracts are deployed to Studio. The Vercel project is linked to `dotmantissa/tithe`, with `main` as its production branch and [tithe-desk.vercel.app](https://tithe-desk.vercel.app) as its production address.

Vercel invokes the protected `/api/maintenance` route once a day at about 03:00 UTC. It reconciles recorded submissions, refreshes the index, and removes old rate limit history. `CRON_SECRET` is stored as a server secret and is sent by the Vercel scheduler. The Hobby plan allows daily scheduling; account activity also checks pending operations when a user opens their desk. For a separate Node host, schedule `npm run reconcile` and `npm run index` on the server. Reconciliation checks pending transaction results and safely replays an uncertain saved transaction using its original bytes. Due time ordering and bounded backoff keep a failed request from monopolizing the queue. Indexing resumes bounded pages per contract, checks a count and revision snapshot at both ends, and removes records missing from a stable snapshot. Each invocation has a shared time and page budget. Individual operations refresh their own record, including final results, rather than rescanning the register. Shared short view caches and a distributed RPC budget keep Studio polling bounded. The protected `/api/sync` endpoint also supports index refresh using `INDEXER_SECRET`. Rate limit history can be pruned after two days.

The runtime dependency audit currently has no high or critical advisories; moderate upstream advisories remain. Recheck dependencies before a production release. Studio, managed custody, and bounded private arbitration are deliberate limits of this version.
