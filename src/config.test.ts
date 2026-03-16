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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildConfig } from "./config.js";
import { GrepoValidationError } from "./errors.js";

describe("buildConfig", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.GEMINI_API_KEY = "a".repeat(30);
		process.env.GITHUB_TOKEN = "ghp_testtoken12345678";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	it("parses a minimal valid command", () => {
		const config = buildConfig(["readme", "https://github.com/owner/repo"]);
		expect(config.command).toBe("readme");
		expect(config.repoUrl).toBe("https://github.com/owner/repo");
		expect(config.outputFormat).toBe("md");
		expect(config.style).toBe("standard");
		expect(config.branch).toBeUndefined();
		expect(config.isDryRun).toBe(false);
		expect(config.shouldPush).toBe(false);
	});

	it("parses all options", () => {
		const config = buildConfig([
			"readme",
			"https://github.com/owner/repo",
			"--format",
			"mdx",
			"--style",
			"comprehensive",
			"--branch",
			"develop",
			"--output",
			"DOCS.md",
			"--push",
			"--dry-run",
			"--tone",
			"casual",
		]);
		expect(config.outputFormat).toBe("mdx");
		expect(config.style).toBe("comprehensive");
		expect(config.branch).toBe("develop");
		expect(config.outputFile).toBe("DOCS.md");
		expect(config.shouldPush).toBe(true);
		expect(config.isDryRun).toBe(true);
		expect(config.tone).toBe("casual");
	});

	it("throws GrepoValidationError for invalid GitHub URL", () => {
		expect(() =>
			buildConfig(["readme", "https://not-github.com/owner/repo"]),
		).toThrow(GrepoValidationError);
	});

	it("throws GrepoValidationError when GEMINI_API_KEY is missing", () => {
		delete process.env.GEMINI_API_KEY;
		delete process.env.GOOGLE_API_KEY;
		expect(() =>
			buildConfig(["readme", "https://github.com/owner/repo"]),
		).toThrow(GrepoValidationError);
	});

	it("throws GrepoValidationError for invalid tone", () => {
		expect(() =>
			buildConfig([
				"readme",
				"https://github.com/owner/repo",
				"--tone",
				"funny",
			]),
		).toThrow(GrepoValidationError);
	});

	it("throws GrepoValidationError when push is set without GitHub token", () => {
		delete process.env.GITHUB_TOKEN;
		delete process.env.GH_TOKEN;
		expect(() =>
			buildConfig(["readme", "https://github.com/owner/repo", "--push"]),
		).toThrow(GrepoValidationError);
	});

	it("accepts GOOGLE_API_KEY as fallback for GEMINI_API_KEY", () => {
		delete process.env.GEMINI_API_KEY;
		process.env.GOOGLE_API_KEY = "b".repeat(30);
		const config = buildConfig(["readme", "https://github.com/owner/repo"]);
		expect(config.geminiApiKey).toBe("b".repeat(30));
	});

	it("defaults output file to README.<format>", () => {
		const mdConfig = buildConfig(["readme", "https://github.com/owner/repo"]);
		expect(mdConfig.outputFile).toBe("README.md");

		const mdxConfig = buildConfig([
			"readme",
			"https://github.com/owner/repo",
			"--format",
			"mdx",
		]);
		expect(mdxConfig.outputFile).toBe("README.mdx");
	});

	it("parses topics command with --apply and --merge", () => {
		const config = buildConfig([
			"topics",
			"https://github.com/owner/repo",
			"--apply",
			"--merge",
		]);
		expect(config.command).toBe("topics");
		expect(config.shouldApply).toBe(true);
		expect(config.shouldMerge).toBe(true);
	});

	it("exits for too few positional arguments", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		expect(() => buildConfig(["readme"])).toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(1);
		logSpy.mockRestore();
		exitSpy.mockRestore();
	});
});
