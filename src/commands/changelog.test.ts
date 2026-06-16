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
import { run } from "./changelog.js";

const makeConfig = (overrides?: Partial<GrepoConfig>): GrepoConfig => ({
	branch: "main",
	command: "changelog",
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

describe("changelog command", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const makeLayer = (opts?: {
		aiResponse?: string;
		github?: Partial<GitHubServiceApi>;
	}) => {
		const gemini: GeminiServiceApi = {
			generateContent: vi.fn(() =>
				Effect.succeed(opts?.aiResponse ?? "# Polished changelog"),
			),
		};
		const github: GitHubServiceApi = {
			compareCommits: () =>
				Effect.succeed([
					{ message: "feat(cli): add changelog command", sha: "aaaaaaa1" },
					{ message: "fix: handle empty tags", sha: "bbbbbbb2" },
				]),
			getDefaultBranch: () => Effect.succeed("main"),
			listCommits: () => Effect.succeed([]),
			listTags: () => Effect.succeed([{ name: "0.4.1", sha: "abc1234" }]),
			...opts?.github,
		};
		return {
			gemini,
			layer: Layer.merge(
				Layer.succeed(Gemini, gemini),
				Layer.succeed(GitHub, github),
			),
		};
	};

	const getLogOutput = () =>
		logSpy.mock.calls.map((call) => (call as string[]).join(" ")).join("\n");

	it("polishes the changelog via Gemini by default", async () => {
		const { gemini, layer } = makeLayer({
			aiResponse: "# Release 0.5.0\n- stuff",
		});

		await Effect.runPromise(run(makeConfig()).pipe(Effect.provide(layer)));

		expect(gemini.generateContent).toHaveBeenCalled();
		expect(getLogOutput()).toContain("# Release 0.5.0");
	});

	it("skips Gemini and emits grouped commits with --raw", async () => {
		const { gemini, layer } = makeLayer();

		await Effect.runPromise(
			run(makeConfig({ isRaw: true })).pipe(Effect.provide(layer)),
		);

		expect(gemini.generateContent).not.toHaveBeenCalled();
		const out = getLogOutput();
		expect(out).toContain("### Features");
		expect(out).toContain("add changelog command");
	});

	it("uses --since as the compare base instead of the latest tag", async () => {
		const compareFn = vi.fn(() =>
			Effect.succeed([{ message: "fix: a", sha: "ccccccc3" }]),
		);
		const listTagsFn = vi.fn(() => Effect.succeed([]));
		const { layer } = makeLayer({
			github: { compareCommits: compareFn, listTags: listTagsFn },
		});

		await Effect.runPromise(
			run(makeConfig({ isRaw: true, since: "0.3.0" })).pipe(
				Effect.provide(layer),
			),
		);

		expect(listTagsFn).not.toHaveBeenCalled();
		expect(compareFn).toHaveBeenCalledWith("owner", "repo", "0.3.0", "main");
	});

	it("falls back to listCommits when there are no tags", async () => {
		const listCommitsFn = vi.fn(() =>
			Effect.succeed([{ message: "feat: first", sha: "ddddddd4" }]),
		);
		const { layer } = makeLayer({
			github: {
				listCommits: listCommitsFn,
				listTags: () => Effect.succeed([]),
			},
		});

		await Effect.runPromise(
			run(makeConfig({ isRaw: true })).pipe(Effect.provide(layer)),
		);

		expect(listCommitsFn).toHaveBeenCalledWith("owner", "repo", "main");
	});
});
