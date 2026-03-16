/**
 *
 * Copyright 2026 Mike Odnis
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GrepoConfig } from "../config.js";
import { Gemini, type GeminiServiceApi } from "../services.js";
import { run } from "./analyze.js";

const makeConfig = (command: "summary" | "tech" | "improve"): GrepoConfig => ({
	branch: "main",
	command,
	geminiApiKey: "test-key",
	isDryRun: false,
	outputFile: "README.md",
	outputFormat: "md",
	repoUrl: "https://github.com/owner/repo",
	shouldApply: false,
	shouldMerge: false,
	shouldPush: false,
	style: "standard",
});

// Mock fetchRepo at module level
vi.mock("../services.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../services.js")>();
	return {
		...original,
		fetchRepo: () =>
			Effect.succeed({
				content: "const x = 1;",
				default_max_file_size: 1118,
				digest_url: "https://gitingest.com/digest/abc",
				pattern: "",
				pattern_type: "exclude",
				repo_url: "https://github.com/owner/repo",
				short_repo_url: "owner/repo",
				summary: "A test repo",
				tree: "src/\n  index.ts",
			}),
	};
});

describe("analyze command", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const getLogOutput = () =>
		logSpy.mock.calls.map((c) => (c as string[]).join(" ")).join("\n");

	const makeGeminiLayer = (response: string) => {
		const geminiService: GeminiServiceApi = {
			generateContent: () => Effect.succeed(response),
		};
		return Layer.succeed(Gemini, geminiService);
	};

	it("runs summary analysis and outputs result", async () => {
		const layer = makeGeminiLayer("This is a summary of the repo.");
		const config = makeConfig("summary");

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const output = getLogOutput();
		expect(output).toContain("This is a summary of the repo.");
	});

	it("runs tech analysis", async () => {
		const layer = makeGeminiLayer("- TypeScript\n- Effect\n- Vitest");
		const config = makeConfig("tech");

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const output = getLogOutput();
		expect(output).toContain("TypeScript");
	});

	it("runs improve analysis", async () => {
		const layer = makeGeminiLayer("1. Add more tests\n2. Fix types");
		const config = makeConfig("improve");

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const output = getLogOutput();
		expect(output).toContain("Add more tests");
	});
});
