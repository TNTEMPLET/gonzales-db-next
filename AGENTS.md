<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git

1. Push work to **`preview`** first (`git push origin preview`) so CI / the preview deploy can run.
2. **Do not** push or merge to **`main`** until the user confirms a good preview build. Wait for explicit approval before updating **`main`**.
