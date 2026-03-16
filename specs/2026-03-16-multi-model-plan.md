# Multi-Model Provider Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gemini-only AI backend with a multi-provider system supporting Gemini, OpenAI, Anthropic, Groq, and Ollama via the Vercel AI SDK.

**Architecture:** A prefix-based router (`gemini-*`, `gpt-*`, `claude-*`, `groq-*`, `ollama-*`) resolves model IDs to Vercel AI SDK provider instances.
A dynamic fallback chain rotates through all available models across providers on rate limits.
Config file at `~/.config/grepo/config.json` stores API keys and default model, with env var overrides.

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider`), Effect (existing), TypeScript

**Spec:** `specs/2026-03-16-multi-model-support-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/utils/ai-config.ts` | Config file loading, API key resolution, model registry |
| Create | `src/utils/ai-config.test.ts` | Tests for config loading/merging |
| Create | `src/utils/ai.ts` | `AIService` class — provider routing, `generateText`, fallback chain |
| Create | `src/utils/ai.test.ts` | Tests for provider routing, fallback chain building |
| Create | `src/utils/ollama.ts` | Ollama model discovery |
| Create | `src/utils/ollama.test.ts` | Tests for Ollama discovery (mocked HTTP) |
| Modify | `src/errors.ts` | Add `AIError`, deprecate `GeminiError` |
| Modify | `src/errors.test.ts` | Add `AIError` tests |
| Modify | `src/services.ts` | Add `AI`/`AILive`, deprecate `Gemini`/`GeminiLive` |
| Modify | `src/config.ts` | Add `--model` flag, `model` field in `GrepoConfig` |
| Modify | `src/config.test.ts` | Add `--model` tests |
| Modify | `src/cli.ts` | Use `AI`/`AILive` instead of `Gemini`/`GeminiLive` |
| Modify | `src/commands/readme.ts` | `Gemini` → `AI` |
| Modify | `src/commands/topics.ts` | `Gemini` → `AI` |
| Modify | `src/commands/describe.ts` | `Gemini` → `AI` |
| Modify | `src/commands/analyze.ts` | `Gemini` → `AI` |
| Modify | `src/mermaid.ts` | `GeminiServiceApi` → `AIServiceApi` |
| Modify | `src/index.ts` | Export new + deprecated types |
| Delete | `src/utils/gemini.ts` | Replaced by `src/utils/ai.ts` |
| Delete | `src/utils/gemini.test.ts` | Replaced by `src/utils/ai.test.ts` |

---

## Chunk 1: Dependencies & Config File

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vercel AI SDK packages**

```bash
bun add ai @ai-sdk/google @ai-sdk/openai @ai-sdk/anthropic ollama-ai-provider
```

- [ ] **Step 2: Remove old Gemini SDK**

```bash
bun remove @google/genai
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: swap @google/genai for Vercel AI SDK multi-provider packages"
```

---

### Task 2: Config file loading

**Files:**
- Create: `src/utils/ai-config.ts`
- Test: `src/utils/ai-config.test.ts`

- [ ] **Step 1: Write failing tests for config loading**

In `src/utils/ai-config.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	type GrepoAIConfig,
	getApiKey,
	loadAIConfig,
	resolveModel,
} from "./ai-config.js";

describe("loadAIConfig", () => {
	it("returns empty config when no file exists", () => {
		const config = loadAIConfig("/nonexistent/path");
		expect(config).toEqual({});
	});
});

describe("getApiKey", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	it("returns env var over config file value", () => {
		process.env.OPENAI_API_KEY = "env-key";
		const config: GrepoAIConfig = { openai_api_key: "config-key" };
		expect(getApiKey("openai", config)).toBe("env-key");
	});

	it("falls back to config file value", () => {
		delete process.env.OPENAI_API_KEY;
		const config: GrepoAIConfig = { openai_api_key: "config-key" };
		expect(getApiKey("openai", config)).toBe("config-key");
	});

	it("returns undefined when neither exists", () => {
		delete process.env.OPENAI_API_KEY;
		expect(getApiKey("openai", {})).toBeUndefined();
	});

	it("resolves Gemini key from GEMINI_API_KEY or GOOGLE_API_KEY", () => {
		process.env.GOOGLE_API_KEY = "google-key";
		delete process.env.GEMINI_API_KEY;
		expect(getApiKey("gemini", {})).toBe("google-key");
	});
});

describe("resolveModel", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	it("returns --model flag value when provided", () => {
		expect(resolveModel("gpt-4o", {})).toBe("gpt-4o");
	});

	it("falls back to config default_model", () => {
		expect(resolveModel(undefined, { default_model: "claude-sonnet-4-20250514" })).toBe(
			"claude-sonnet-4-20250514",
		);
	});

	it("falls back to first provider with a valid key", () => {
		process.env.OPENAI_API_KEY = "sk-test";
		delete process.env.GEMINI_API_KEY;
		delete process.env.GOOGLE_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.GROQ_API_KEY;
		const model = resolveModel(undefined, {});
		expect(model).toMatch(/^(gpt-|openai-)/);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- --run src/utils/ai-config.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ai-config.ts**

In `src/utils/ai-config.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface GrepoAIConfig {
	anthropic_api_key?: string;
	default_model?: string;
	gemini_api_key?: string;
	groq_api_key?: string;
	ollama_host?: string;
	openai_api_key?: string;
}

export type Provider =
	| "anthropic"
	| "gemini"
	| "groq"
	| "ollama"
	| "openai";

const ENV_KEYS: Record<Provider, string[]> = {
	anthropic: ["ANTHROPIC_API_KEY"],
	gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
	groq: ["GROQ_API_KEY"],
	ollama: [],
	openai: ["OPENAI_API_KEY"],
};

const CONFIG_KEYS: Record<Provider, keyof GrepoAIConfig> = {
	anthropic: "anthropic_api_key",
	gemini: "gemini_api_key",
	groq: "groq_api_key",
	ollama: "ollama_host",
	openai: "openai_api_key",
};

const PROVIDER_DEFAULTS: Record<Exclude<Provider, "ollama">, string> = {
	gemini: "gemini-2.0-flash",
	openai: "gpt-4o-mini",
	anthropic: "claude-sonnet-4-20250514",
	groq: "groq-llama-3.3-70b-versatile",
};

const DEFAULT_CONFIG_PATH = join(
	homedir(),
	".config",
	"grepo",
	"config.json",
);

export function loadAIConfig(
	path: string = DEFAULT_CONFIG_PATH,
): GrepoAIConfig {
	if (!existsSync(path)) {
		return {};
	}
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as GrepoAIConfig;
	} catch {
		return {};
	}
}

export function getApiKey(
	provider: Provider,
	config: GrepoAIConfig,
): string | undefined {
	for (const envKey of ENV_KEYS[provider]) {
		const val = process.env[envKey];
		if (val) return val;
	}
	const configKey = CONFIG_KEYS[provider];
	const configVal = config[configKey];
	return typeof configVal === "string" ? configVal : undefined;
}

export function getAvailableProviders(
	config: GrepoAIConfig,
): Provider[] {
	const providers: Provider[] = [];
	for (const provider of ["gemini", "openai", "anthropic", "groq"] as const) {
		if (getApiKey(provider, config)) {
			providers.push(provider);
		}
	}
	// Ollama is available if host is reachable (checked lazily)
	const ollamaHost =
		process.env.OLLAMA_HOST ?? config.ollama_host;
	if (ollamaHost) {
		providers.push("ollama");
	}
	return providers;
}

export function prefixToProvider(modelId: string): Provider {
	if (modelId.startsWith("claude-")) return "anthropic";
	if (modelId.startsWith("groq-")) return "groq";
	if (modelId.startsWith("ollama-") || modelId === "ollama") return "ollama";
	if (modelId.startsWith("gpt-") || modelId.startsWith("openai-"))
		return "openai";
	return "gemini";
}

export function resolveModel(
	cliModel: string | undefined,
	config: GrepoAIConfig,
): string {
	if (cliModel) return cliModel;
	if (config.default_model) return config.default_model;

	// Dynamic fallback: first provider with a key
	const available = getAvailableProviders(config);
	for (const provider of available) {
		if (provider === "ollama") continue;
		return PROVIDER_DEFAULTS[provider];
	}

	return "gemini-2.0-flash";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- --run src/utils/ai-config.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/ai-config.ts src/utils/ai-config.test.ts
git commit -m "feat: add AI config file loading and model resolution"
```

---

### Task 3: Ollama discovery

**Files:**
- Create: `src/utils/ollama.ts`
- Test: `src/utils/ollama.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/utils/ollama.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { discoverOllamaModels } from "./ollama.js";

describe("discoverOllamaModels", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns model names prefixed with ollama-", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					models: [{ name: "llama3" }, { name: "mistral" }],
				}),
			),
		);
		const models = await discoverOllamaModels("http://localhost:11434");
		expect(models).toEqual(["ollama-llama3", "ollama-mistral"]);
	});

	it("returns empty array on fetch failure", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
		const models = await discoverOllamaModels("http://localhost:11434");
		expect(models).toEqual([]);
	});

	it("returns empty array on invalid JSON", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("not json"),
		);
		const models = await discoverOllamaModels("http://localhost:11434");
		expect(models).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- --run src/utils/ollama.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ollama.ts**

In `src/utils/ollama.ts`:

```typescript
interface OllamaTag {
	name: string;
}

interface OllamaTagsResponse {
	models: OllamaTag[];
}

export async function discoverOllamaModels(
	host: string,
): Promise<string[]> {
	try {
		const response = await fetch(`${host}/api/tags`);
		const data = (await response.json()) as OllamaTagsResponse;
		return (data.models ?? []).map((m) => `ollama-${m.name}`);
	} catch {
		return [];
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- --run src/utils/ollama.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/ollama.ts src/utils/ollama.test.ts
git commit -m "feat: add Ollama model discovery"
```

---

## Chunk 2: AI Service & Provider Routing

### Task 4: AIService with provider routing and fallback

**Files:**
- Create: `src/utils/ai.ts`
- Test: `src/utils/ai.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/utils/ai.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the ai module before importing AIService
vi.mock("ai", () => ({
	generateText: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
	createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ modelId: "gemini-2.0-flash" }))),
}));

vi.mock("@ai-sdk/openai", () => ({
	createOpenAI: vi.fn(() => vi.fn(() => ({ modelId: "gpt-4o-mini" }))),
}));

vi.mock("@ai-sdk/anthropic", () => ({
	createAnthropic: vi.fn(() => vi.fn(() => ({ modelId: "claude-sonnet-4-20250514" }))),
}));

import { generateText } from "ai";

import { AIService, getProviderModel } from "./ai.js";

describe("getProviderModel", () => {
	it("routes gemini- prefix to Google provider", () => {
		const model = getProviderModel("gemini-2.0-flash", { gemini: "test-key" });
		expect(model).toBeDefined();
	});

	it("routes gpt- prefix to OpenAI provider", () => {
		const model = getProviderModel("gpt-4o", { openai: "test-key" });
		expect(model).toBeDefined();
	});

	it("routes claude- prefix to Anthropic provider", () => {
		const model = getProviderModel("claude-sonnet-4-20250514", {
			anthropic: "test-key",
		});
		expect(model).toBeDefined();
	});

	it("throws for missing API key", () => {
		expect(() => getProviderModel("gpt-4o", {})).toThrow(
			"API key required",
		);
	});
});

describe("AIService", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		vi.restoreAllMocks();
	});

	it("generates content using the configured model", async () => {
		const mockGenerateText = vi.mocked(generateText);
		mockGenerateText.mockResolvedValue({ text: "Hello world" } as never);

		const service = new AIService("gemini-2.0-flash", {
			gemini: "test-key",
		});
		const result = await service.generateContent("Say hello");
		expect(result).toBe("Hello world");
		expect(mockGenerateText).toHaveBeenCalled();
	});

	it("falls back to next model on rate limit", async () => {
		const mockGenerateText = vi.mocked(generateText);
		mockGenerateText
			.mockRejectedValueOnce(new Error("429 Too Many Requests"))
			.mockResolvedValueOnce({ text: "Fallback result" } as never);

		const service = new AIService("gemini-2.0-flash", {
			gemini: "test-key",
			openai: "test-key",
		});
		service.setFallbackChain(["gemini-2.0-flash", "gpt-4o-mini"]);
		const result = await service.generateContent("test");
		expect(result).toBe("Fallback result");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- --run src/utils/ai.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ai.ts**

In `src/utils/ai.ts`:

```typescript
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

import { Logger } from "./logger.js";
import { ApiError } from "./validation.js";
import { prefixToProvider, type Provider } from "./ai-config.js";

export type ApiKeys = Partial<Record<Provider, string>>;

export function getProviderModel(
	modelId: string,
	keys: ApiKeys,
	ollamaHost?: string,
) {
	const provider = prefixToProvider(modelId);

	switch (provider) {
		case "gemini": {
			const key = keys.gemini;
			if (!key) throw new ApiError("API key required for Gemini", undefined, "Gemini");
			const google = createGoogleGenerativeAI({ apiKey: key });
			return google(modelId);
		}
		case "openai": {
			const key = keys.openai;
			if (!key) throw new ApiError("API key required for OpenAI", undefined, "OpenAI");
			const openai = createOpenAI({ apiKey: key });
			return openai(modelId);
		}
		case "anthropic": {
			const key = keys.anthropic;
			if (!key) throw new ApiError("API key required for Anthropic", undefined, "Anthropic");
			const anthropic = createAnthropic({ apiKey: key });
			return anthropic(modelId);
		}
		case "groq": {
			const key = keys.groq;
			if (!key) throw new ApiError("API key required for Groq", undefined, "Groq");
			const groq = createOpenAI({
				apiKey: key,
				baseURL: "https://api.groq.com/openai/v1",
			});
			const groqModelId = modelId.replace(/^groq-/, "");
			return groq(groqModelId);
		}
		case "ollama": {
			const host = ollamaHost ?? "http://localhost:11434";
			const openai = createOpenAI({
				apiKey: "ollama",
				baseURL: `${host}/v1`,
			});
			const ollamaModelId = modelId.replace(/^ollama-/, "");
			return openai(ollamaModelId);
		}
	}
}

function isRateLimitError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message.toLowerCase();
	return (
		msg.includes("429") ||
		msg.includes("rate limit") ||
		msg.includes("resource exhausted") ||
		msg.includes("quota")
	);
}

export class AIService {
	private readonly logger: Logger;
	private readonly keys: ApiKeys;
	private readonly ollamaHost?: string;
	private readonly primaryModel: string;
	private fallbackChain: string[] = [];

	constructor(
		model: string,
		keys: ApiKeys,
		ollamaHost?: string,
	) {
		this.primaryModel = model;
		this.keys = keys;
		this.ollamaHost = ollamaHost;
		this.logger = new Logger("AIService");
	}

	setFallbackChain(chain: string[]): void {
		this.fallbackChain = chain;
	}

	async generateContent(prompt: string): Promise<string> {
		const models =
			this.fallbackChain.length > 0
				? this.fallbackChain
				: [this.primaryModel];

		for (let i = 0; i < models.length; i++) {
			const modelId = models[i];
			if (!modelId) continue;

			try {
				const model = getProviderModel(modelId, this.keys, this.ollamaHost);
				const result = await generateText({
					model,
					prompt,
				});

				if (!result.text) {
					throw new ApiError(
						"AI returned empty content",
						undefined,
						prefixToProvider(modelId),
					);
				}

				return result.text;
			} catch (error) {
				const nextModel = models[i + 1];
				if (isRateLimitError(error) && nextModel) {
					this.logger.warn(
						`Rate limited on ${modelId}, falling back to ${nextModel}`,
					);
					continue;
				}
				const message =
					error instanceof Error ? error.message : "Unknown error";
				throw new ApiError(
					`AI generation failed (${modelId}): ${message}`,
					undefined,
					prefixToProvider(modelId),
				);
			}
		}

		throw new ApiError("All models exhausted", undefined, "AI");
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- --run src/utils/ai.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/ai.ts src/utils/ai.test.ts
git commit -m "feat: add AIService with multi-provider routing and fallback"
```

---

## Chunk 3: Errors, Services, Config Integration

### Task 5: Add AIError and deprecate GeminiError

**Files:**
- Modify: `src/errors.ts`
- Modify: `src/errors.test.ts`

- [ ] **Step 1: Write failing test for AIError**

Add to `src/errors.test.ts`:

```typescript
import { AIError } from "./errors.js";

describe("AIError", () => {
	it("creates with message, provider, and model", () => {
		const err = new AIError({
			message: "Rate limited",
			provider: "openai",
			model: "gpt-4o",
		});
		expect(err.message).toBe("Rate limited");
		expect(err.provider).toBe("openai");
		expect(err.model).toBe("gpt-4o");
		expect(err._tag).toBe("AIError");
	});

	it("creates without optional fields", () => {
		const err = new AIError({ message: "Failed" });
		expect(err.provider).toBeUndefined();
		expect(err.model).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test -- --run src/errors.test.ts
```

Expected: FAIL — AIError not exported

- [ ] **Step 3: Add AIError and deprecate GeminiError**

Replace `src/errors.ts` contents with:

```typescript
import { Data } from "effect";

export class AIError extends Data.TaggedError("AIError")<{
	readonly message: string;
	readonly provider?: string;
	readonly model?: string;
	readonly cause?: unknown;
}> {}

/** @deprecated Use AIError instead */
export const GeminiError = AIError;
/** @deprecated Use AIError instead */
export type GeminiError = AIError;

export class GrepoValidationError extends Data.TaggedError(
	"GrepoValidationError",
)<{
	readonly message: string;
	readonly field?: string;
}> {}

export class GitHubError extends Data.TaggedError("GitHubError")<{
	readonly message: string;
	readonly statusCode?: number;
	readonly endpoint?: string;
}> {}

export class GitIngestError extends Data.TaggedError("GitIngestError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export type GrepoError =
	| AIError
	| GitHubError
	| GitIngestError
	| GrepoValidationError;
```

- [ ] **Step 4: Update existing GeminiError tests to use AIError**

Update the `GeminiError` describe block in `src/errors.test.ts` — keep it testing the deprecated alias:

```typescript
describe("GeminiError (deprecated alias)", () => {
	it("is the same as AIError", () => {
		expect(GeminiError).toBe(AIError);
	});
});
```

- [ ] **Step 5: Run all error tests**

```bash
bun run test -- --run src/errors.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/errors.test.ts
git commit -m "feat: add AIError, deprecate GeminiError as alias"
```

---

### Task 6: Update services.ts — AI tag replaces Gemini

**Files:**
- Modify: `src/services.ts`

- [ ] **Step 1: Replace services.ts**

```typescript
import type { Schema } from "effect";
import { Context, Effect, Layer } from "effect";

import { AIError, GitHubError, GitIngestError } from "./errors.js";
import { AIService } from "./utils/ai.js";
import type { ApiKeys } from "./utils/ai.js";
import { type GrepoAIConfig, getApiKey, prefixToProvider } from "./utils/ai-config.js";
import { GitHubClient } from "./utils/github.js";
import {
	fetchRepositoryContent,
	type GitIngestResponse,
} from "./utils/gitingest.js";

// ============================================================================
// AI Service
// ============================================================================

export interface AIServiceApi {
	readonly generateContent: (
		prompt: string,
	) => Effect.Effect<string, AIError>;
}

export class AI extends Context.Tag("AI")<AI, AIServiceApi>() {}

export const AILive = (model: string, aiConfig: GrepoAIConfig) => {
	const keys: ApiKeys = {};
	for (const provider of ["gemini", "openai", "anthropic", "groq"] as const) {
		const key = getApiKey(provider, aiConfig);
		if (key) keys[provider] = key;
	}
	const ollamaHost = process.env.OLLAMA_HOST ?? aiConfig.ollama_host;
	const service = new AIService(model, keys, ollamaHost);

	return Layer.succeed(AI, {
		generateContent: (prompt: string) =>
			Effect.tryPromise({
				catch: (error) =>
					new AIError({
						cause: error,
						message: error instanceof Error ? error.message : String(error),
						provider: prefixToProvider(model),
						model,
					}),
				try: () => service.generateContent(prompt),
			}),
	});
};

// Deprecated aliases
/** @deprecated Use AIServiceApi instead */
export type GeminiServiceApi = AIServiceApi;
/** @deprecated Use AI instead */
export const Gemini = AI;
/** @deprecated Use AILive instead */
export const GeminiLive = (apiKey: string) =>
	AILive("gemini-2.0-flash", { gemini_api_key: apiKey });

// ============================================================================
// GitHub Service
// ============================================================================

export interface GitHubServiceApi {
	readonly getTopics: (
		owner: string,
		repo: string,
	) => Effect.Effect<readonly string[], GitHubError>;
	readonly pushFile: (
		owner: string,
		repo: string,
		path: string,
		content: string,
		message: string,
		branch: string,
	) => Effect.Effect<void, GitHubError>;
	readonly setTopics: (
		owner: string,
		repo: string,
		topics: string[],
	) => Effect.Effect<void, GitHubError>;
	readonly updateRepo: (
		owner: string,
		repo: string,
		data: { description?: string; homepage?: string },
	) => Effect.Effect<void, GitHubError>;
}

export class GitHub extends Context.Tag("GitHub")<GitHub, GitHubServiceApi>() {}

export const GitHubLive = (token?: string) => {
	const client = new GitHubClient(token);
	return Layer.succeed(GitHub, {
		getTopics: (owner, repo) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}/topics`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.getTopics(owner, repo),
			}),
		pushFile: (owner, repo, path, content, message, branch) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}/contents/${path}`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.pushFile(owner, repo, path, content, message, branch),
			}),
		setTopics: (owner, repo, topics) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}/topics`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.setTopics(owner, repo, topics),
			}),
		updateRepo: (owner, repo, data) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.updateRepo(owner, repo, data),
			}),
	});
};

// ============================================================================
// GitIngest Service
// ============================================================================

export type RepoData = Schema.Schema.Type<typeof GitIngestResponse>;

export const fetchRepo = (
	repoUrl: string,
): Effect.Effect<RepoData, GitIngestError> =>
	Effect.tryPromise({
		catch: (error) =>
			new GitIngestError({
				cause: error,
				message: error instanceof Error ? error.message : String(error),
			}),
		try: () => fetchRepositoryContent(repoUrl),
	});
```

- [ ] **Step 2: Run full test suite to check nothing breaks**

```bash
bun run test -- --run
```

Expected: Some tests may fail due to import changes — fix in next tasks.

- [ ] **Step 3: Commit**

```bash
git add src/services.ts
git commit -m "feat: add AI/AILive service, deprecate Gemini/GeminiLive"
```

---

### Task 7: Update config.ts — add --model flag

**Files:**
- Modify: `src/config.ts`
- Modify: `src/config.test.ts`

- [ ] **Step 1: Add failing tests for --model flag**

Add to `src/config.test.ts`:

```typescript
	it("parses --model flag", () => {
		const config = buildConfig([
			"readme",
			"https://github.com/owner/repo",
			"--model",
			"gpt-4o",
		]);
		expect(config.model).toBe("gpt-4o");
	});

	it("defaults model via resolveModel when --model not provided", () => {
		const config = buildConfig(["readme", "https://github.com/owner/repo"]);
		expect(config.model).toBeDefined();
	});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- --run src/config.test.ts
```

Expected: FAIL — `model` not on `GrepoConfig`

- [ ] **Step 3: Update config.ts**

Add `model` field to `GrepoConfig`, add `--model` parsing, import `loadAIConfig` and `resolveModel`:

In `GrepoConfig` interface, add:
```typescript
	/** @deprecated Use model + loadAIConfig instead */
	geminiApiKey: string;
	model: string;
```

In `buildConfig()`, after API key validation, add:
```typescript
	const aiConfig = loadAIConfig();
	const model = resolveModel(options.model as string | undefined, aiConfig);
```

And in the return object, add `model`.

Remove the hard requirement for `geminiApiKey` — instead validate that the resolved model's provider has a key.
Keep `geminiApiKey` populated for backwards compat.

- [ ] **Step 4: Run tests**

```bash
bun run test -- --run src/config.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add --model CLI flag and model resolution to config"
```

---

## Chunk 4: Wire Everything Up

### Task 8: Update cli.ts to use AI/AILive

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Update imports and layer construction**

Replace:
```typescript
import { GeminiLive, GitHubLive } from "./services.js";
```
With:
```typescript
import { AILive, GitHubLive } from "./services.js";
import { loadAIConfig } from "./utils/ai-config.js";
```

Replace:
```typescript
const layers = Layer.merge(
	GeminiLive(config.geminiApiKey),
	GitHubLive(config.githubToken),
);
```
With:
```typescript
const aiConfig = loadAIConfig();
const layers = Layer.merge(
	AILive(config.model, aiConfig),
	GitHubLive(config.githubToken),
);
```

Update the `catchTags` — rename `GeminiError` to `AIError`:
```typescript
		AIError: (e) =>
			Effect.sync(() => {
				logger.error(`AI Error (${e.provider ?? "unknown"}): ${e.message}`);
				process.exit(1);
			}),
```

Also update the `CommandRunner` type's error union and `Gemini` → `AI` in the service union.

- [ ] **Step 2: Commit**

```bash
git add src/cli.ts
git commit -m "feat: wire CLI to use AI/AILive multi-provider service"
```

---

### Task 9: Update all commands — Gemini → AI

**Files:**
- Modify: `src/commands/readme.ts`
- Modify: `src/commands/topics.ts`
- Modify: `src/commands/describe.ts`
- Modify: `src/commands/analyze.ts`
- Modify: `src/mermaid.ts`

- [ ] **Step 1: Update each command file**

In each command file, replace:
```typescript
import { fetchRepo, Gemini, GitHub } from "../services.js";
```
With:
```typescript
import { AI, fetchRepo, GitHub } from "../services.js";
```

And replace:
```typescript
const gemini = yield* Gemini;
```
With:
```typescript
const ai = yield* AI;
```

Then replace all `gemini.generateContent(` with `ai.generateContent(`.

For `src/mermaid.ts`, update the `GeminiServiceApi` import:
```typescript
import type { AIServiceApi } from "./services.js";
```
And change the parameter type from `GeminiServiceApi` to `AIServiceApi`.

- [ ] **Step 2: Run full test suite**

```bash
bun run test -- --run
```

Expected: PASS (all 115+ tests)

- [ ] **Step 3: Commit**

```bash
git add src/commands/ src/mermaid.ts
git commit -m "refactor: update all commands to use AI service instead of Gemini"
```

---

### Task 10: Update index.ts exports and clean up

**Files:**
- Modify: `src/index.ts`
- Delete: `src/utils/gemini.ts`
- Delete: `src/utils/gemini.test.ts`

- [ ] **Step 1: Update index.ts**

Add new exports and keep deprecated ones:

```typescript
// AI Service (new)
export { AIService } from "./utils/ai.js";
export {
	type GrepoAIConfig,
	getApiKey,
	getAvailableProviders,
	loadAIConfig,
	prefixToProvider,
	type Provider,
	resolveModel,
} from "./utils/ai-config.js";
export { discoverOllamaModels } from "./utils/ollama.js";

// Services
export {
	AI,
	AILive,
	type AIServiceApi,
	fetchRepo,
	// Deprecated
	Gemini,
	GeminiLive,
	type GeminiServiceApi,
	GitHub,
	GitHubLive,
	type GitHubServiceApi,
	type RepoData,
} from "./services.js";

// Errors
export {
	AIError,
	// Deprecated
	GeminiError,
	GitHubError,
	GitIngestError,
	type GrepoError,
	GrepoValidationError,
} from "./errors.js";
```

Remove:
```typescript
export { GeminiService } from "./utils/gemini.js";
```

- [ ] **Step 2: Delete old files**

```bash
rm src/utils/gemini.ts src/utils/gemini.test.ts
```

- [ ] **Step 3: Run full test suite**

```bash
bun run test -- --run
```

Expected: PASS

- [ ] **Step 4: Run build**

```bash
bun run build
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: export new AI types, remove old GeminiService"
```

---

### Task 11: Update --model in usage text and docs

**Files:**
- Modify: `src/cli.ts` (usage text)
- Modify: `src/config.ts` (USAGE constant)

- [ ] **Step 1: Add --model to USAGE string in config.ts**

Add after the `--tone` line:
```text
  --model <id>               AI model (e.g. gemini-2.0-flash, gpt-4o, claude-sonnet-4-20250514)
```

- [ ] **Step 2: Update cli.ts usage text similarly**

- [ ] **Step 3: Commit**

```bash
git add src/config.ts src/cli.ts
git commit -m "docs: add --model flag to CLI usage text"
```
