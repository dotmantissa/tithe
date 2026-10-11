# Working on Tithe

Read the root TASKS.md and reconcile it with Git and the actual files before resuming work. Keep it as the canonical crash recovery checklist. Never stage or commit TASKS.md. Verify that it stays ignored with git check-ignore.

Commit only as dotmantissa <negativemantissa@gmail.com>, with no co-author trailers. Keep secrets in ignored configuration and never print provider request details or credentials.

The application uses real Studio records. Do not add sample balances, works, licences, claims or fallback verdicts to production. Tests may substitute external calls in direct mode; live tests use isolated contracts.

Frontend copy uses plain language and proper icons. Preserve the black, white and pink palette, the receipt layout, email only authentication, visible focus states and reduced motion support. Do not copy styling from other local projects.

Contracts must use concrete pinned runner hashes. Run genvm-lint check before direct tests. A finalized transaction can contain an execution error; inspect execution and state before declaring a deployment successful.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
