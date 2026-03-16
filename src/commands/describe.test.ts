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
import {
	Gemini,
	type GeminiServiceApi,
	GitHub,
	type GitHubServiceApi,
} from "../services.js";
import { run } from "./describe.js";

const makeConfig = (overrides?: Partial<GrepoConfig>): GrepoConfig => ({
	branch: "main",
	command: "describe",
	geminiApiKey: "test-key",
	githubToken: "ghp_test",
	isDryRun: false,
	outputFile: "README.md",
	outputFormat: "md",
	repoUrl: "https://github.com/owner/repo",
	shouldApply: false,
	shouldMerge: false,
	shouldPush: false,
	style: "standard",
	...overrides,
});

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

describe("describe command", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const getLogOutput = () =>
		logSpy.mock.calls.map((c) => (c as string[]).join(" ")).join("\n");

	const makeLayer = (
		aiResponse: string,
		githubOverrides?: Partial<GitHubServiceApi>,
	) => {
		const gemini: GeminiServiceApi = {
			generateContent: () => Effect.succeed(aiResponse),
		};
		const github: GitHubServiceApi = {
			getTopics: () => Effect.succeed([]),
			pushFile: () => Effect.succeed(undefined),
			setTopics: () => Effect.succeed(undefined),
			updateRepo: vi.fn(() => Effect.succeed(undefined)),
			...githubOverrides,
		};
		return Layer.merge(
			Layer.succeed(Gemini, gemini),
			Layer.succeed(GitHub, github),
		);
	};

	it("parses description and homepage from AI response", async () => {
		const layer = makeLayer(
			'{"description": "A cool CLI tool", "homepage": "https://example.com"}',
		);
		const config = makeConfig();

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const output = getLogOutput();
		expect(output).toContain("A cool CLI tool");
		expect(output).toContain("https://example.com");
	});

	it("handles null homepage", async () => {
		const layer = makeLayer('{"description": "A CLI tool", "homepage": null}');
		const config = makeConfig();

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const output = getLogOutput();
		expect(output).toContain("(none detected)");
	});

	it("applies description to GitHub when --apply is set", async () => {
		const updateRepoFn = vi.fn(() => Effect.void);
		const layer = makeLayer('{"description": "A cool CLI", "homepage": null}', {
			updateRepo: updateRepoFn,
		});
		const config = makeConfig({ shouldApply: true });

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		expect(updateRepoFn).toHaveBeenCalled();
		const data = updateRepoFn.mock.calls[0]?.[2] as {
			description?: string;
		};
		expect(data.description).toBe("A cool CLI");
	});

	it("includes homepage in update data when present", async () => {
		const updateRepoFn = vi.fn(() => Effect.void);
		const layer = makeLayer(
			'{"description": "A tool", "homepage": "https://docs.example.com"}',
			{ updateRepo: updateRepoFn },
		);
		const config = makeConfig({ shouldApply: true });

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const data = updateRepoFn.mock.calls[0]?.[2] as {
			homepage?: string;
		};
		expect(data.homepage).toBe("https://docs.example.com");
	});

	it("does not apply on dry run", async () => {
		const updateRepoFn = vi.fn(() => Effect.void);
		const layer = makeLayer('{"description": "A tool", "homepage": null}', {
			updateRepo: updateRepoFn,
		});
		const config = makeConfig({ isDryRun: true, shouldApply: true });

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		expect(updateRepoFn).not.toHaveBeenCalled();
	});

	it("handles AI response with no JSON gracefully", async () => {
		const layer = makeLayer("I cannot generate a description right now.");
		const config = makeConfig();

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));
		// Should not throw
	});

	it("warns when description exceeds 350 chars", async () => {
		const longDesc = "A".repeat(400);
		const layer = makeLayer(`{"description": "${longDesc}", "homepage": null}`);
		const config = makeConfig();

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const output = getLogOutput();
		expect(output).toContain("400 chars");
	});
});
