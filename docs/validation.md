# Verification record

Audit repairs checked on 12 October 2026. The live reports contain the exact addresses, transactions and source hashes.

| Check | Result |
| :--- | :--- |
| Direct contract tests | 108 passed across registry, licence desk, court, funding and transfers |
| Backend and component tests | 111 passed |
| ESLint and TypeScript | Passed |
| GenVM lint | All three contracts passed |
| Next.js production build | Passed |
| Real Neon lease and recovery checks | Passed |
| Isolated live Studio suite | Passed on the final sources: six real rulings, four settlements and every native balance |
| Official MCP client integration | Passed |
| Deployment source comparison | All three application sources match byte for byte |
| Application configuration | Default fee escrow, bonds, response, hearing and appeal windows verified |
| Credential scan | No local credentials in working source, Git history or public build assets |
| Runtime dependency audit | Zero high or critical advisories; 27 moderate upstream advisories |

The direct suite includes hostile leader fields, canonical explanations, exact monetary consent, stale historical choices, prior licence terms, immutable policies, failed hearings and reviews, all damages bands, every appeal round, fund conservation, corrupt media and strict URL checks. Funded credit survives failed evidence, malformed model output and expired appeals. Direct tests substitute external calls and explicitly exercise validator comparisons; they do not establish real model consensus.

Backend tests cover authenticated outbox encryption, original signer/hash/network/nonce binding, ownership, lost broadcasts, retry bounds, expiring fenced leases, one funding transition winner, funding finality and second signature failures. Real Neon checks race eight lease contenders and verify that stale ownership cannot update the transaction and that signed payments retain their recovery lock.

The focused appeal lifecycle test renders the actual claim component and production hooks. It restores a saved appeal operation, polls it after acceptance through finalization, refreshes the claim from the chain reader, displays the new ruling and leaves the review screen. It also verifies uncertain submission recovery without posting a replacement action. External responses in this component test are controlled fixtures; the public browser suite uses real application APIs and the real Privy modal.

The official MCP client initializes, lists tools, submits an action, polls its result and retrieves the licence by its returned record ID. Separate tests cover unsupported protocol headers, protocol errors, tool execution errors and credential privacy. The same official client also passed against the running application with real Neon authentication, managed account reads, search and error handling. The live API suite uses a temporary hashed key in Neon, checks account authorization, safe artifact fetching, real content fingerprints, tool discovery, origin restrictions and revocation, then removes the key.

[The Studio report](../deployments/studio-verification.json) records isolated real network tests. The suite uses public text and image artifacts, independent model assessments and actual ONNX embeddings. Isolated fee escrow is ten seconds, hearing and response windows are one hour, and appeals are twenty minutes. These declared test constructor values allow actual native fee release, review and settlement checks without changing the shared Studio clock. The application uses one day escrow, seven day responses, one day hearings and two day appeals. [Application deployment verification](../deployments/verification.json) checks those defaults, wiring, execution, source and snapshots.

The live suite exercised, in one isolated deployment: a paid commercial approval with timed fee release and native withdrawal, an intentionally reverted action whose funded credit survived and was withdrawn in full, a terms update to a prohibition, a refused request with its refund, a nonidentical text dispute ruled through actual ONNX embeddings at a measured distance of 344116 parts per million, a bonded review of that ruling, a grandfathered grant that resolved on the original licence terms rather than the amended version, a PNG image dispute decided from real vision input, and an unlicensed copy of prohibited terms that drew a HIGH damages band. All four claims then settled and both parties withdrew their credits, leaving the court holding nothing.

A live failure reproduction found that Studio retained native value attached to a reverted transaction in an older isolated court. The corrected protocol funds withdrawable credit first and sends every licence, claim, response and appeal action with zero attached value. The live suite intentionally reverts an action after funding and verifies the unchanged credit and its full native withdrawal. Earlier isolated addresses and signed transaction records remain available for investigation. Application deployments were empty and held zero native balance before replacement.

PNG images are supported. The pinned runner has no JPEG codec, and its WebP decoder trapped during a real claim despite its capability flag. Both formats are rejected before decoding with PNG conversion guidance. Image evidence uses actual vision input and deterministic spatial colour signatures for its embedding anchor; it is not a pixel similarity claim. A live PNG dispute was registered, licensed, answered and ruled on Studio, which closes the earlier gap where image handling rested on direct tests alone.

Browser checks exercise desktop and phone layouts, themes, navigation, email only sign in choices, public reads and unsigned write rejection. The Node production server is exercised locally. The final public Vercel checks and Git source are recorded in [the hosting report](../deployments/vercel.json).

Human email OTP completion is not automated. Docker is unavailable in this environment, so the container build is not exercised. The protected maintenance route is tested by authenticated invocation, while the scheduler's first automatic invocation remains an operational check. These limits are separate from the completed contract, backend and UI regression checks.

[The remediation map](remediation.md) connects each audit finding to its repair and evidence.
