# Audit remediation

The October review found real defects behind the earlier green checks. This revision repairs the contracts and the paths that use them. The application register remains empty; integration evidence comes from separate Studio deployments.

| Finding | Repair | Evidence |
| :--- | :--- | :--- |
| Leader fields could redirect licence escrow | Exact canonical consensus envelopes; explicit deterministic payment and identity metadata | Hostile field and escrow regression tests |
| Unbound explanations influenced later decisions | Clause based explanations; prose excluded from later evidence; bound terms basis | Conflicting leader and prior grant validator tests |
| Funded hearings could stall indefinitely | Initial and review deadlines, refunds, retained prior ruling and public recovery | Failed evidence, review expiry and three round conservation tests |
| A changed price could exceed consent | Exact fee and terms version in the UI, API and contract | Stale quote, unknown field and contract consent tests |
| Interrupted signing could block an account | Encrypted signing outbox, fenced leases, unsigned expiry, identical byte recovery | Real Neon lease race; signer, nonce, hash, ownership and crash tests |
| Claimant time silently chose historical terms | Explicit version candidates, two party agreement and correction | Same timestamp and stale proposal acceptance tests |
| New terms could invalidate an earlier grant | Original grant terms remain available; validators bind which terms apply | Original licence basis regression and live grant checks |
| Policy evidence changed during review | Published claim/account marker, verified hash, locked body | Changed and unavailable policy review tests |
| Provisional records survived removal | Revision snapshots, stable scan pruning and final target refresh | Changed snapshot, zero count pruning and finality tests |
| Agents could not retrieve their permission | Result IDs, licence/account/history tools, proper MCP errors | Official MCP SDK submit, poll and licence read test |
| Unbounded scans and record caps hid progress or money | Resumable bounded pages, fair backoff, global RPC budget, separate pagination and independent withdrawal controls | Large collection, deadline and target refresh tests |
| Image magic and weak URL syntax passed validation | Complete decoding, frame and dimension limits, strict HTTPS syntax and public DNS controls | Corrupt image and address tests; real PNG Studio evidence |

Live testing found another issue in Studio: a finalized reverted transaction with native value left that value in an older isolated contract. The new desk and court therefore accept native value only through a simple credit funding method. The managed service waits for funding finality before sending the consented action with zero attached value. Failed evidence, model, timing and consent checks leave funded credit available to withdraw. Funding and action hashes remain separate recovery records. This behavior is tested through an intentional live failure followed by a full native withdrawal.

Only PNG images are offered. The pinned runner lacks JPEG decoding and its WebP decoder trapped during live verification. Both formats are rejected before decoding with PNG conversion guidance.

The interface resumes saved operation polling after a reload and continues after acceptance. The focused appeal test uses the actual hooks and claim component: it polls the persisted operation, refreshes chain state and leaves the review screen when the next ruling arrives. Separate public browser checks use the real Privy email modal and both themes.

[The verification record](validation.md) separates local regression coverage, real network results and remaining environmental checks. Contract addresses and source hashes live in the deployment reports. Earlier addresses are preserved, and replacement requires verification that application records and native balances are empty.

The isolated live run that confirms this revision used the final contract sources, with hashes recorded in [the Studio report](../deployments/studio-verification.json) that match the deployed application byte for byte. Its two harness repairs are worth stating plainly, because both hid real success behind an apparent failure: a funding transfer had no replay path, so a broadcast that left no record made a resumed run poll a hash forever; and Studio can leave a broadcast transaction invisible for minutes while the client reports a hard not-found, which previously failed a transaction that had in fact finalized. Resume now re-sends the exact saved bytes and waits within a bounded deadline, and never signs a replacement.

These changes establish the tested application behavior. They cannot promise acceptance by a reviewer or confer legal court authority. Human email OTP completion, a Docker build and the scheduler's first automatic invocation still require their respective environments.
