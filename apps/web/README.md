This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AI editor generation

The edit page includes an AI prompt composer above CodeMirror. Generation is
server-side and requires:

```dotenv
ANTHROPIC_API_KEY=...
ANTHROPIC_WORKSPACE_ID=... # required for identity-linked API keys
AI_ANTHROPIC_MODEL=claude-sonnet-5

OPENAI_API_KEY=...
AI_OPENAI_MODEL=... # an OpenAI Responses API model available to the project

DASHSCOPE_API_KEY=...
AI_QWEN_MODEL=qwen3.8-max
# Region/workspace-specific Model Studio compatible-mode URL, ending in /v1
ALIBABA_BASE_URL=https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1

AI_VALIDATOR_URL=http://validator:4318
```

`AI_STANDARD_MODEL` remains a backwards-compatible alias for
`AI_ANTHROPIC_MODEL`. Optional provider settings are `ANTHROPIC_BASE_URL`,
`OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`.

Shared controls are `AI_ATTEMPT_BUDGET` (default `3`),
`AI_MAX_OUTPUT_TOKENS` (default `8192`), `AI_MODEL_TIMEOUT_MS` (default
`60000`), and `AI_VALIDATOR_TIMEOUT_MS` (default `20000`). Provider model IDs
remain server configuration; the browser sends only a fixed provider key.

`AI_VALIDATOR_URL` must point to the private render-validator service. It must
not be exposed to browsers or the public internet.
