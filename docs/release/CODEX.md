# Isolated Codex setup and first validation

This is an alpha-preparation workflow, not a verified general coding provider.

1. Install the official Codex CLI separately. CODOVYN currently pins native ARM64 **0.164.0**, SHA-256 `d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf`. Other binaries fail closed. CODOVYN does not install, downgrade or authenticate another CLI silently.
2. On the development checkout, run `node scripts/prepare-phase16.js` to create the disposable division Calculator and offline test oracle. Open the recorded division project. Validation refuses an altered/nonmatching project.
3. Open Chat → Settings → Sign in to isolated Codex. Confirm the native sign-in dialog. Open the official device page and enter its short-lived code there. Do not paste passwords, API keys, auth files or device codes into Chat/issues.
4. Authentication uses official `cli_auth_credentials_store="ephemeral"`; credentials remain inside that process. Global Codex accounts/settings are untouched. Closing the IDE/session or its idle expiry requires another sign-in. Use Sign Out of Isolated Codex or Cancel Isolated Codex Session to terminate it. No API-key input is implemented.
5. **Stop before inference unless the owner explicitly approved the specific campaign.** The initial proposal is Codex `gpt-6.1-sol`, Low effort, Ask, one submission, zero tools/writes and 120 seconds local time. Availability/entitlement and exact cost are unknown. Only use the advertised model/effort approved by the owner; never substitute another silently.
6. Review one Codex Ask validation opens Chat, asks for the exact model/effort, and presents the complete approved prompt/workspace and quota warning in a separate native modal. Signing in, metadata discovery, a Send click, or a generic “continue” is not spending approval. Dismissal submits nothing.
7. After approval, SQLite reservation/submission intent precedes `turn/start`. A provider acknowledgement, streamed text, terminal status and uncertainty are separate observations. No host inference retry or fallback occurs. Provider-internal calls, retries, tokens and billing are not bounded by one outer submission. The local deadline does not guarantee remote billing stops immediately.

The prompt contains only the known 229-byte Calculator excerpt and asks for the smallest division-by-zero correction, without tools or modifications. SHA-256 of the complete prompt: `dfe2704168df0eb12655b1a5401b9b41aff59331519b03e4b0189c307f33cc96`.

The owner must still perform device sign-in and authorize the first live request. Account metadata/read-only logout checks and protocol fixtures are not authenticated inference proof. Agent mode remains blocked and needs a separate approved coding test, isolated draft, independent tests and review. No public alpha should advertise Agent support yet.

References: [official authentication](https://learn.chatgpt.com/docs/auth), [official app-server](https://learn.chatgpt.com/docs/app-server). The installed version's schemas determine supported fields. The local open-source integration uses the documented device flow; commercial/hosted distribution needs separate review of OpenAI's stated authentication terms and Sign in with ChatGPT guidance.
