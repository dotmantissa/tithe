# Verification record

Contracts checked on 11 October 2026. Public Vercel deployment checked on 12 October 2026.

| Check | Result |
| :--- | :--- |
| Direct contract tests | 47 passed across registry, desk, court and transfers |
| Backend tests | 53 passed |
| Production browser tests | 10 passed |
| ESLint and TypeScript | Passed |
| GenVM lint | All three contracts passed |
| Next.js production build | Passed |
| Actual Studio integration | Passed twice, including the final source revision |
| Actual Neon and production API integration | Passed |
| Deployment source comparison | All three sources match byte for byte |
| Secret scan | No local credential values in source, Git history, public build assets or 26 live HTML and JavaScript assets |
| Vercel production | Ready, public alias assigned, GitHub main branch linked |
| Protected maintenance | Authorized call passed; unsigned call rejected |

The direct suite covers terms history, access, malformed inputs, source hashes, approvals, refusals, escrow release, refunds, credit withdrawals, double spending, response deadlines, every damages band, settlement conservation, appeal access and payout, numeric tolerance boundaries, animation rejection, and image descriptions failing closed.

The final live suite used isolated deployments with the exact final contract sources. It fetched a real published artifact, registered public terms, approved a licence through consensus, posted both dispute bonds, executed actual ONNX embeddings, ruled on permitted use, performed bonded review, updated terms, refused prohibited commercial use, and finalized the refund withdrawal. Transactions and source hashes are recorded in [the Studio report](../deployments/studio-verification.json). The separate [application deployment report](../deployments/verification.json) verifies the contracts used by the frontend.

The live API suite used a temporary hashed key in the real Neon database and removed it afterward. On the public Vercel deployment it also checked authorized maintenance and unsigned maintenance rejection. It checked managed account identity, private URL rejection, real artifact fingerprinting, MCP initialization and tools, key management restrictions, browser origin checks, and revoked key rejection. It did not add sample application records.

Browser checks passed against both the local production server and [the public Vercel deployment](https://tithe-desk.vercel.app), using the real Privy modal. They covered email only authentication choices, both themes, seven phone layouts, navigation, public reads, and unsigned write rejection. Email OTP delivery and a completed human email session were not automated.

Direct tests substitute external calls. Live text tests use actual web, model and embeddings runners. Image panel input and validation are covered by direct tests; live image consensus has not been exercised. Time dependent fee release and settlement use direct VM time changes. The live test did not pretend that two days had passed.

The Node standalone server was started and exercised. Docker is unavailable in this environment, so the container build has not been run. Vercel built the application from the linked `dotmantissa/tithe` repository. The deployment, alias, branch, checks and daily maintenance configuration are recorded in [the hosting report](../deployments/vercel.json). Private environment files and the recovery checklist return 404 on the public site. The maintenance endpoint passed a real authenticated invocation; its first scheduled daily invocation has not yet occurred. The most recent successful runtime audit found zero high and critical advisories and 27 moderate upstream advisories; a later npm audit endpoint request failed, so it supplied no newer result.
