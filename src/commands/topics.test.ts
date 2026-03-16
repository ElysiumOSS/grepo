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
import { run } from "./topics.js";

const makeConfig = (overrides?: Partial<GrepoConfig>): GrepoConfig => ({
	branch: "main",
	command: "topics",
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

describe("topics command", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const makeLayer = (
		aiResponse: string,
		githubOverrides?: Partial<GitHubServiceApi>,
	) => {
		const gemini: GeminiServiceApi = {
			generateContent: () => Effect.succeed(aiResponse),
		};
		const github: GitHubServiceApi = {
			getTopics: () => Effect.succeed(["existing-topic"]),
			pushFile: () => Effect.succeed(undefined),
			setTopics: vi.fn(() => Effect.succeed(undefined)),
			updateRepo: () => Effect.succeed(undefined),
			...githubOverrides,
		};
		return Layer.merge(
			Layer.succeed(Gemini, gemini),
			Layer.succeed(GitHub, github),
		);
	};

	const getLogOutput = () =>
		logSpy.mock.calls.map((c) => (c as string[]).join(" ")).join("\n");

	it("parses topics from AI response", async () => {
		const layer = makeLayer('["typescript", "cli-tool", "ai-powered"]');
		const config = makeConfig();

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		expect(getLogOutput()).toContain("typescript");
	});

	it("normalizes topics to lowercase hyphenated strings", async () => {
		const setTopicsFn = vi.fn(() => Effect.void);
		const layer = makeLayer('["Type Script", "CLI Tool"]', {
			setTopics: setTopicsFn,
		});
		const config = makeConfig({ shouldApply: true });

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		const calledTopics = setTopicsFn.mock.calls[0]?.[2] as string[];
		expect(calledTopics).toContain("type-script");
		expect(calledTopics).toContain("cli-tool");
	});

	it("merges with existing topics when --merge is set", async () => {
		const setTopicsFn = vi.fn(() => Effect.void);
		const layer = makeLayer('["new-topic"]', {
			getTopics: () => Effect.succeed(["existing-topic"]),
			setTopics: setTopicsFn,
		});
		const config = makeConfig({ shouldMerge: true, shouldApply: true });

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		expect(setTopicsFn).toHaveBeenCalled();
		const calledTopics = setTopicsFn.mock.calls[0]?.[2] as string[];
		expect(calledTopics).toContain("existing-topic");
		expect(calledTopics).toContain("new-topic");
	});

	it("handles dry run without applying", async () => {
		const setTopicsFn = vi.fn(() => Effect.void);
		const layer = makeLayer('["topic-a"]', { setTopics: setTopicsFn });
		const config = makeConfig({ isDryRun: true, shouldApply: true });

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		expect(setTopicsFn).not.toHaveBeenCalled();
	});

	it("does not apply when --apply is not set", async () => {
		const setTopicsFn = vi.fn(() => Effect.void);
		const layer = makeLayer('["topic-a"]', { setTopics: setTopicsFn });
		const config = makeConfig({ shouldApply: false });

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));

		expect(setTopicsFn).not.toHaveBeenCalled();
	});

	it("handles AI response with no JSON array gracefully", async () => {
		const layer = makeLayer("Sorry, I cannot help with that.");
		const config = makeConfig();

		await Effect.runPromise(run(config).pipe(Effect.provide(layer)));
		// Should not throw
	});
});
