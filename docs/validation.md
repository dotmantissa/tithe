# Verification record

Audit repairs checked on 13 October 2026. All seven court scenarios have genuine finalized rulings on the current source. Every claim settled after its declared appeal window, both parties withdrew their credits with exact native balance checks, and the isolated court and licence desk hold zero funds. The source-bound Studio report was regenerated after the complete run passed. The current application deployments match the repository source and hold no sample records. Production builds from the live GitHub repository, and public browser, API and MCP checks passed.

| Check | Result |
| :--- | :--- |
| Direct contract tests | 133 passed across registry, licence desk, court, funding and transfers |
| Backend and component tests | 145 passed |
| ESLint and TypeScript | Passed |
| GenVM lint | All three contracts passed |
| Next.js production build | Passed |
| Real Neon lease and recovery checks | Passed |
| Isolated live Studio suite | Current source: seven finalized rulings, all timed settlements and native withdrawals passed; court and desk balances zero |
| Superseded reviewer courts | Six courts recovered; original deadlines respected, native withdrawals verified and zero balances independently refreshed |
| Public Git deployment | Vercel built live main commit 3b069aa; exact Git source and READY production alias verified, both CI jobs passed |
| Public browser and assets | 10 browser checks passed; 26 HTML/JavaScript assets scanned, private paths return 404 |
| Maintenance workflow | Authenticated GitHub workflow dispatch passed against production |
| Official MCP client integration | Passed |
| Deployment source comparison | Current application sources, execution, schemas, wiring and production defaults verified; zero records |
| Application configuration | Default fee escrow, bonds, response, hearing and appeal windows verified |
| Credential scan | No local credentials in working source, Git history or public build assets |
| Runtime dependency audit | Zero high or critical advisories; 27 moderate upstream advisories |

An intermediate isolated grant hearing finalized without majority agreement and applied no ruling. Candidate execution succeeded in some rounds, but independent factual verification rejected some narratives. The revised verifier explicitly selects the agreed original grant or use-time terms and explains that established negative facts are not positive assertions. The original-grant regression checks this exact evidence binding. Four additional tests prove that retrying a transient assessment still rejects repeated failures, a contradictory independent finding and unsupported reasoning. The fresh current-source court has now finalized the prior-grant ruling on LICENCE_TERMS version 1 despite the later prohibition. The other six real rulings also passed, including instruction-injection and insufficient-context scenarios. All seven claims then settled, with 900 atto withdrawn by the creator and 700 by the respondent; the refused-licence credit returned another 100 atto. Every withdrawal matched its quoted credit and durable native balance baseline.

The direct suite includes hostile leader fields, canonical explanations, exact monetary consent, stale historical choices, prior licence terms, immutable policies, failed hearings and reviews, all damages bands, every appeal round, fund conservation, corrupt media and strict URL checks. Funded credit survives failed evidence, malformed model output and expired appeals. Direct tests substitute external calls and explicitly exercise validator comparisons; they do not establish real model consensus.

Backend tests cover authenticated outbox encryption, original signer/hash/network/nonce binding, ownership, lost broadcasts, retry bounds, expiring fenced leases, one funding transition winner, funding finality and second signature failures. Real Neon checks race eight lease contenders and verify that stale ownership cannot update the transaction and that signed payments retain their recovery lock.

The focused appeal lifecycle test renders the actual claim component and production hooks. It restores a saved appeal operation, polls it after acceptance through finalization, refreshes the claim from the chain reader, displays the new ruling and leaves the review screen. It also verifies uncertain submission recovery without posting a replacement action. External responses in this component test are controlled fixtures; the public browser suite uses real application APIs and the real Privy modal.

The official MCP client initializes, lists tools, submits an action, polls its result and retrieves the licence by its returned record ID. Separate tests cover unsupported protocol headers, protocol errors, tool execution errors and credential privacy. The same official client also passed against the running application with real Neon authentication, managed account reads, search and error handling. The live API suite uses a temporary hashed key in Neon, checks account authorization, safe artifact fetching, real content fingerprints, tool discovery, origin restrictions and revocation, then removes the key.

[The Studio report](../deployments/studio-verification.json) records isolated real network tests. The earlier suite used public text and image artifacts, independent model assessments and actual ONNX embeddings. The current revision adds preserved evidence, usage statements, factual explanations, review responses and live instruction-injection/context tests. Its seven rulings, timed settlements and native withdrawals passed on the exact current sources. The report records both the transaction outcomes and independently checked native balance changes. The earlier isolated suite used ten second fee escrow, one hour hearing/response windows and twenty minute appeals. The current suite declares four hour hearings and two hour appeals because actual consensus latency consumed the earlier test review window; response remains one hour. These declared test constructor values allow actual native fee release, review and settlement checks without changing the shared Studio clock. The application uses one day escrow, seven day responses, one day hearings and two day appeals. [Application deployment verification](../deployments/verification.json) checks those defaults, wiring, execution, source and snapshots.

The current live suite exercised a paid commercial approval with timed fee release and native withdrawal, an intentionally reverted zero-value action whose funded credit was returned in full, a later prohibition and refused request with its refund, nonidentical text with real ONNX embeddings and a substantive bonded review, an original paid grant upheld against newer terms, real PNG vision, unlicensed prohibited copying with HIGH damages, hostile source/intended-use/policy and image instructions, and contradictory usage context returning INSUFFICIENT_EVIDENCE. All seven claims settled and both parties withdrew their credits. The remaining hostile-licence refund was also withdrawn, leaving the isolated court and desk holding nothing.

[The recovery report](../deployments/recovery-verification.json) independently refreshes the source hashes, canonical successful recovery transactions and zero native balances for six superseded reviewer courts. Their original hearing and settlement deadlines were respected, and withdrawals were checked against durable native balance baselines. These courts are separate from the current application and the active final-source suite.

A live failure reproduction found that Studio retained native value attached to a reverted transaction in an older isolated court. The corrected protocol funds withdrawable credit first and sends every licence, claim, response and appeal action with zero attached value. The live suite intentionally reverts an action after funding and verifies the unchanged credit and its full native withdrawal. Earlier isolated addresses and signed transaction records remain available for investigation. Application deployments were empty and held zero native balance before replacement.

PNG images are supported. The pinned runner has no JPEG codec, and its WebP decoder trapped during a real claim despite its capability flag. Both formats are rejected before decoding with PNG conversion guidance. Image evidence uses actual vision input and deterministic spatial colour signatures for its embedding anchor; it is not a pixel similarity claim. A live PNG dispute was registered, licensed, answered and ruled on Studio, which closes the earlier gap where image handling rested on direct tests alone.

Browser checks exercise desktop and phone layouts, themes, navigation, email only sign in choices, public reads and unsigned write rejection. The Node production server is exercised locally. The final public Vercel checks and Git source are recorded in [the hosting report](../deployments/vercel.json).

Human email OTP completion is not automated. Docker is unavailable in this environment, so the container build is not exercised. The protected maintenance route and the five-minute GitHub workflow passed by authenticated invocation and explicit workflow dispatch; the first automatic schedule event has not yet been observed. These limits are separate from the completed contract, backend and UI regression checks.

[The remediation map](remediation.md) connects each audit finding to its repair and evidence.
