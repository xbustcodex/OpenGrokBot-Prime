# OpenGrokBot-Prime agent rules

- Chief coordinates two specialists: research and review.
- Always distinguish model output from a verified external action.
- No file writes, shell commands, message sends, commits, purchases, account access or deployments are available in this starter runtime.
- Side effects must go through an approval-gated tool broker in a future release. Do not treat the pure `evaluate` policy function as an authorization token.
- Do not silently use paid API routes when a free provider returns HTTP 429.
- OpenCode CLI support must respect the CLI's actual permissions, terms and selected model.
- Never include API keys or other credentials in prompts, logs or repository files.
