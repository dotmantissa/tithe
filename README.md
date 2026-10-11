# Tithe

Your work. Your terms. Your share.

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

Each contract pins a concrete GenVM runner hash. The court also pins the embeddings runner and executes it inside a Seq block. Text uses `all-MiniLM-L6-v2` and mean nearest squared embedding distance across bounded text chunks. Image disputes compare the actual images and embed their independently produced descriptions. That score describes semantic overlap; it is not a pixel similarity measurement or proof of infringement.

Validators must agree exactly on the category, numbered terms clause, damages band, and policy hash. Distance must agree within five percent, with an absolute floor of 1000 parts per million near zero. The comparative validation approach follows [GenLayer's non determinism documentation](https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism). A score never overrides the written conditions.

Registration accepts directly reachable public HTTPS artifacts, with a limit of 2 MB and 24000 text characters. Supported images are still PNG, JPEG, and WebP. Animated images, audio, and video are outside this version. Keep the registered bytes available at their original URL: a changed or missing source cannot be silently substituted in a later hearing.

Terms use one clause per nonempty line. Prices are exact decimal strings in atto GEN, with 18 decimal places per GEN. A schedule can price research, commercial, quotation, or derivative use; a price alone never grants permission. The panel still assesses the actual terms.

## Money and review

Approved licence fees remain in escrow for one day. After that, anyone can release the fee to the creator's withdrawal credit. A refusal credits the requester immediately. Withdrawals use finalized value transfers and clear the credit before transfer.

A creator names the respondent, commits the output, states the time of use, and posts a bond. The application court requires 0.01 GEN per party. The respondent has seven days to post an equal bond. An unanswered claim closes without a ruling and returns the creator's bond.

A ruling opens a two day review window. There are at most three bonded review rounds, costing 2, 4, then 8 times the initial bond. Each round starts a fresh consensus transaction and preserves the earlier decision. GenLayer selects the validators; Tithe cannot guarantee distinct validator identities between rounds. This application review path is separate from native network appeals.

At settlement, a permitted derivative returns both original bonds. No use awards both to the respondent. Use outside the terms returns the creator's bond and awards 25, 50, or 100 percent of the respondent bond according to the damages band. An appeal bond returns only when the final result improves that party's position; otherwise it goes to the opponent. Awards are limited to posted funds. Tithe cannot seize assets or collect a larger legal award.

## Agents

Sign in and create a key on `/developers`. The raw key appears once; only its digest is stored. A key acts as the same account and can spend its available funds, so give each agent a separate key and revoke it when its job ends. Key creation and revocation require an email session.

Public reads include `/api/works`, `/api/works/WORK_ID`, `/api/licences/LICENCE_ID`, and `/api/docket/CLAIM_ID`. Submit actions to `/api/actions` with a bearer key and an `Idempotency-Key` header. Poll the returned operation ID at `/api/operations/OPERATION_ID`. Submission is not approval: read the resulting licence or docket record for the actual decision.

The authenticated MCP endpoint is `/api/mcp`. It supports Streamable HTTP initialization and discovery, with tools for work search, work details, artifact inspection, actions, operation status, and docket reads. Client configuration and a working licence request example are available in the developer guide.

Requests use bounded JSON, origin checks, hashed API keys, account ownership checks, and persisted signed transaction hashes. Artifact downloads validate all DNS answers, pin public addresses, reject redirects, and enforce download limits. Errors do not expose provider credentials. After an uncertain submission, inspect the saved operation before repeating a payment.

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

The direct contract tests substitute web, model, and embedding calls to check access, validation, funds, versions, and validator agreement quickly. They are not evidence that a real model reached consensus.

`npm run test:studio` deploys isolated contracts and exercises real web fetching, actual ONNX embeddings, approval, refusal, historical terms, bonded review, and finalized refunds. Its signed transaction recovery state stays in ignored `.secrets` files. Use a new `STUDIO_TEST_RUN` identifier for a fresh run. [The live report](deployments/studio-verification.json) includes transaction references and source hashes. Time dependent settlement and fee release are verified with direct tests rather than pretending that two days passed on Studio.

With the app running, `npm run test:api` verifies real Neon authorization, public artifact hashing, MCP tools, origins, and key revocation. Its temporary test key is removed afterward. `npm run verify:deployment` compares every deployed source byte with the repository and checks execution and live reads.

[The verification record](docs/validation.md) describes what was exercised and what still needs a live check.

## Operate it

`npm run deploy:contracts` uses the ignored deployment key and resumes transactions recorded in the manifest. Existing deployments are immutable. A contract revision requires a new registry, desk, and court wiring; preserve the previous manifest and migrate any existing records deliberately. Never replace a deployment containing user funds as a routine update.

Build with `npm run build` and run with `npm start` on a Node host. A Dockerfile is included. Set the public Privy app ID at build time, configure server secrets at runtime, set `NEXT_PUBLIC_APP_URL` to the real origin, and allow that origin in Privy. The contracts are deployed to Studio; the web application still needs a public Node hosting deployment.

Schedule `npm run reconcile` and `npm run index` on the server. Reconciliation checks pending transaction results without resubmitting payments. Indexing refreshes work search and docket records, including activity submitted directly to the contracts. The protected `/api/sync` endpoint also supports index refresh using `INDEXER_SECRET`. Rate limit history can be pruned after two days.

The runtime dependency audit currently has no high or critical advisories; moderate upstream advisories remain. Recheck dependencies before a production release. Studio, managed custody, and bounded private arbitration are deliberate limits of this version.
