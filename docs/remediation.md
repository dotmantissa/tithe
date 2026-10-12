# Audit remediation

The October review found real defects behind the earlier green checks. This revision repairs the contracts and the paths that use them. The application register remains empty; integration evidence comes from separate Studio deployments.

| Finding | Repair | Evidence |
| :--- | :--- | :--- |
| Leader fields could redirect licence escrow | Exact canonical consensus envelopes; explicit deterministic payment and identity metadata | Hostile field and escrow regression tests |
| Unbound explanations influenced later decisions | Independently verified factual explanations; prior reasoning remains untrusted during review; bound terms basis | Conflicting leader and prior grant validator tests |
| Funded hearings could stall indefinitely | Initial and review deadlines, refunds, retained prior ruling and public recovery | Failed evidence, review expiry and three round conservation tests |
| A changed price could exceed consent | Exact fee and terms version in the UI, API and contract | Stale quote, unknown field and contract consent tests |
| Interrupted signing could block an account | Encrypted signing outbox, fenced leases, unsigned expiry, identical byte recovery | Real Neon lease race; signer, nonce, hash, ownership and crash tests |
| Claimant time silently chose historical terms | Explicit version candidates, two party agreement and correction | Same timestamp and stale proposal acceptance tests |
| New terms could invalidate an earlier grant | Original grant terms remain available; validators bind which terms apply | Original licence basis regression and live grant checks |
| Policy evidence changed during review | Account-signed claim marker, verified hash and preserved body; no website-ownership claim | Changed and unavailable policy review tests |
| Provisional records survived removal | Finalized-only documents, append-only fixed-prefix scans and finalized target refresh | Changing snapshots, no deletion inference and finality tests |
| Agents could not retrieve their permission | Result IDs, licence/account/history tools, proper MCP errors | Official MCP SDK submit, poll and licence read test |
| Unbounded scans and record caps hid progress or money | Resumable bounded pages, fair backoff, global RPC budget, separate pagination and independent withdrawal controls | Large collection, deadline and target refresh tests |
| Image magic and weak URL syntax passed validation | Complete decoding, frame and dimension limits, strict HTTPS syntax and public DNS controls | Corrupt image and address tests; real PNG Studio evidence |

Live testing found another issue in Studio: a finalized reverted transaction with native value left that value in an older isolated contract. The new desk and court therefore accept native value only through a simple credit funding method. The managed service waits for funding finality before sending the consented action with zero attached value. Failed evidence, model, timing and consent checks leave funded credit available to withdraw. Funding and action hashes remain separate recovery records. This behavior is tested through an intentional live failure followed by a full native withdrawal.

Only PNG images are offered. The pinned runner lacks JPEG decoding and its WebP decoder trapped during live verification. Both formats are rejected before decoding with PNG conversion guidance.

The interface resumes saved operation polling after a reload and continues after acceptance. The focused appeal test uses the actual hooks and claim component: it polls the persisted operation, refreshes chain state and leaves the review screen when the next ruling arrives. Separate public browser checks use the real Privy email modal and both themes.

[The verification record](validation.md) separates local regression coverage, real network results and remaining environmental checks. Contract addresses and source hashes live in the deployment reports. Earlier addresses are preserved, and replacement requires verification that application records and native balances are empty.

The earlier isolated live run used its release contract sources, with hashes recorded in [the Studio report](../deployments/studio-verification.json) that matched the earlier deployed application byte for byte. That report does not validate the current durable-evidence revision until regenerated. Its two harness repairs are worth stating plainly, because both hid real success behind an apparent failure: a funding transfer had no replay path, so a broadcast that left no record made a resumed run poll a hash forever; and Studio can leave a broadcast transaction invisible for minutes while the client reports a hard not-found, which previously failed a transaction that had in fact finalized. Resume now re-sends the exact saved bytes and waits within a bounded deadline, and never signs a replacement.

These changes establish the tested application behavior. They cannot promise acceptance by a reviewer or confer legal court authority. Human email OTP completion, a Docker build and the scheduler's first automatic invocation still require their respective environments.


## Durable receipt and arbitration review

| Finding | Repair | Verification |
| --- | --- | --- |
| Missing actual-use context | Both parties commit six structured usage fields and hashes; material fact criteria; current/original prices supplied; INSUFFICIENT_EVIDENCE returns bonds with zero damages | Direct factual/settlement tests; isolated live contradictory-context test |
| Public nonfinal permission | Explicit latest-final reads, finality metadata, finalized-only index, variant-separated caches | Reader/API and accepted-operation index tests |
| Evidence withdrawal obstructs adjudication | Hash-verified source/output/policy bytes preserved on chain; public snapshot downloads; no contract HTTP calls | Direct no-network initial/review tests; real preserved-byte reads |
| Revision churn prevents rebuild | Append-only fixed high-water prefix and persistent fenced cursor; later passes refresh changes; five-minute authenticated job plus daily fallback | Exact 201-record reproduction now reads 0,50,100,150,200 while revisions/appends continue |
| Anonymous traffic exhausts RPC | Trusted caller limits before chain access; aggregate public caps; explicit negative caching; recovery reservations | API/context/cache regressions and isolated real Neon reservation races |
| Arbitrary equivalent clause selection | Lowest numbered applicable rule, first-occurrence normalization for matching historical duplicate text, rejection of new duplicate clauses | Direct citation and normalized duplicate tests |
| Contract network restrictions weaker | Removed all HTTP access from contracts; direct callers supply bounded hash-verified bytes | No-network direct tests and real inline evidence |
| Thin explanations/reviews | Factual statuses, concrete reason, evidence references, quoted clause, damages reason; independently checked narratives; committed grounds/additional evidence and opposing response window | Hostile narrative, review access/window and live reasoning checks |
| Undisclosed 128-version ceiling | Metadata, remaining-update copy, exhausted editor, registration disclosure | Contract boundary and UI regressions |
| Stale architecture | Rewritten for preserved bytes, deterministic image signatures, verified factual narratives, finality and append-only scans | Source/doc comparison |
| Limited adversarial assurance | Hostile source, intended-use, policy and image instruction fixtures exercised with real validators, plus malformed-field and unsupported-reasoning regressions | Live report records actual tested outcomes; no universal model-security claim |

Previous deployment/test reports are historical evidence until regenerated for this source revision. The canonical ignored TASKS.md records which validations and release steps are complete.
