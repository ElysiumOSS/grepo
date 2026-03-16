# Multi-Model Provider Support

**Date:** 2026-03-16
**Status:** Approved

## Overview

Add support for multiple AI providers (Gemini, OpenAI, Anthropic, Groq, Ollama) via the Vercel AI SDK, replacing the Gemini-only architecture. Models are selected by prefix-based routing, with automatic cross-provider fallback on rate limits.

## Providers

| Prefix | Provider | SDK | API Key Env Var |
|--------|----------|-----|-----------------|
| `gemini-*` | Google Generative AI | `@ai-sdk/google` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` |
| `gpt-*` / `openai-*` | OpenAI | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| `claude-*` | Anthropic | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| `groq-*` | Groq | `@ai-sdk/openai` (custom base URL) | `GROQ_API_KEY` |
| `ollama-*` | Ollama | `ollama-ai-provider` | None (uses `ollama_host`) |

## Config File

Location: `~/.config/grepo/config.json`

```json
{
  "default_model": "gemini-2.0-flash",
  "openai_api_key": "sk-...",
  "anthropic_api_key": "sk-ant-...",
  "gemini_api_key": "AIza...",
  "groq_api_key": "gsk_...",
  "ollama_host": "http://localhost:11434"
}
```

**API key resolution:** Env vars override config file values.

## Model Selection

**Priority order:**
1. `--model` CLI flag (highest)
2. Config file `default_model`
3. Dynamic fallback: first available model from providers with valid API keys

## Fallback Chain

Built dynamically at startup from all configured providers. Each provider's available models are fetched via SDK or curated registry. Models ranked by tier (cheap/fast → expensive/powerful) across all providers.

On rate limit or failure, rotates to the next model in the chain — may cross provider boundaries.

Example with Gemini + OpenAI keys:
`gemini-2.0-flash` → `gpt-4o-mini` → `gemini-2.0-flash-lite` → `gemini-1.5-flash` → `gpt-4o` → `gemini-1.5-pro` → ...

## Ollama Discovery

- `--model ollama` (bare): queries `{ollama_host}/api/tags`, picks first available model
- `--model ollama-llama3`: uses that model directly

## Architecture Changes

### New Files
- `src/utils/ai.ts` — `AIService` class wrapping Vercel AI SDK `generateText()`, provider routing by prefix, cross-provider fallback chain
- `src/utils/ai-config.ts` — Config file loading/merging, API key resolution, model chain building
- `src/utils/ollama.ts` — Ollama model discovery

### Modified Files
- `src/services.ts` — New `AI` Effect tag + `AILive` layer replacing `Gemini`/`GeminiLive`. Old names kept as deprecated re-exports.
- `src/errors.ts` — New `AIError` tagged error with `provider` and `model` fields. `GeminiError` kept as deprecated re-export.
- `src/config.ts` — Add `--model` CLI flag, replace `geminiApiKey` with `model: string` in `GrepoConfig`. Keep `geminiApiKey` as deprecated optional field.
- `src/cli.ts` — Use `AI`/`AILive` instead of `Gemini`/`GeminiLive`
- `src/index.ts` — Export new types + deprecated re-exports
- `src/commands/*.ts` — Change `Gemini` service dependency to `AI`

### Removed Files
- `src/utils/gemini.ts` — Replaced by `src/utils/ai.ts`

## Backwards Compatibility

- `GeminiError` re-exported as deprecated alias for `AIError`
- `Gemini` service tag re-exported as deprecated alias for `AI`
- `GeminiLive` re-exported as deprecated wrapper that creates `AILive`
- `GeminiServiceApi` re-exported as deprecated alias for `AIServiceApi`
- `geminiApiKey` kept as optional field in `GrepoConfig` (maps to Gemini provider key internally)

## Dependencies

### Add
- `ai` — Vercel AI SDK core
- `@ai-sdk/google` — Gemini provider
- `@ai-sdk/openai` — OpenAI + Groq provider
- `@ai-sdk/anthropic` — Anthropic provider
- `ollama-ai-provider` — Ollama provider

### Remove
- `@google/genai` — Replaced by `@ai-sdk/google`

## Testing

- Unit tests for prefix → provider routing
- Unit tests for fallback chain building (dynamic, based on available keys)
- Unit tests for config file loading/merging with env var overrides
- Unit tests for Ollama discovery (mocked HTTP)
- Mocked `generateText` for command-level tests
- Update existing `config.test.ts` with `--model` flag
- Add `AIError` tests to `errors.test.ts`
