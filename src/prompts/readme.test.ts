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

import {
	type AnalysisResult,
	buildAnalysisPrompt,
	buildExistingReadmeInstructions,
	buildGenerationPrompt,
	DEFAULT_ANALYSIS,
	extractExistingReadme,
	parseAnalysis,
	type RepoData,
} from "./readme.js";

const makeRepoData = (overrides?: Partial<RepoData>): RepoData => ({
	content: "const x = 1;",
	repo_url: "https://github.com/test/repo",
	summary: "A test repo",
	tree: "src/\n  index.ts",
	...overrides,
});

const makeAnalysis = (overrides?: Partial<AnalysisResult>): AnalysisResult => ({
	...DEFAULT_ANALYSIS,
	identity: {
		differentiators: ["fast"],
		name: "TestProject",
		oneLiner: "A test",
	},
	repoType: "library",
	sections: { recommended: ["hero", "overview"], skip: [] },
	tone: { detected: "professional", evidence: "formal style" },
	...overrides,
});

describe("extractExistingReadme", () => {
	it("returns null when no README section exists", () => {
		expect(extractExistingReadme("just some code")).toBeNull();
	});

	it("returns null when README content is too short", () => {
		expect(extractExistingReadme("===\nREADME.md\n===\nShort")).toBeNull();
	});

	it("extracts README content when present and long enough", () => {
		const content = `===
README.md
===
${"This is a detailed README with enough content to pass the 50-character threshold. ".repeat(2)}
===
other-file.txt
===
other content`;

		const result = extractExistingReadme(content);
		expect(result).toBeTruthy();
		expect(result).toContain("detailed README");
	});
});

describe("parseAnalysis", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it("parses valid JSON analysis", () => {
		const analysis = makeAnalysis();
		const result = parseAnalysis(JSON.stringify(analysis));
		expect(result.repoType).toBe("library");
		expect(result.identity.name).toBe("TestProject");
	});

	it("strips markdown code fences before parsing", () => {
		const analysis = makeAnalysis();
		const wrapped = `\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``;
		const result = parseAnalysis(wrapped);
		expect(result.repoType).toBe("library");
	});

	it("returns DEFAULT_ANALYSIS for invalid JSON", () => {
		const result = parseAnalysis("not json at all");
		expect(result).toEqual(DEFAULT_ANALYSIS);
	});

	it("returns DEFAULT_ANALYSIS when required fields are missing", () => {
		const result = parseAnalysis(JSON.stringify({ repoType: "lib" }));
		expect(result).toEqual(DEFAULT_ANALYSIS);
	});

	it("returns DEFAULT_ANALYSIS when sections.recommended is empty", () => {
		const partial = makeAnalysis({
			sections: { recommended: [], skip: [] },
		});
		const result = parseAnalysis(JSON.stringify(partial));
		expect(result).toEqual(DEFAULT_ANALYSIS);
	});
});

describe("buildAnalysisPrompt", () => {
	it("includes repo URL and summary", () => {
		const prompt = buildAnalysisPrompt(makeRepoData());
		expect(prompt).toContain("https://github.com/test/repo");
		expect(prompt).toContain("A test repo");
	});

	it("includes existing README when provided", () => {
		const prompt = buildAnalysisPrompt(makeRepoData(), "# My Old README");
		expect(prompt).toContain("<existing_readme>");
		expect(prompt).toContain("# My Old README");
	});

	it("omits existing_readme block when not provided", () => {
		const prompt = buildAnalysisPrompt(makeRepoData());
		expect(prompt).not.toContain("<existing_readme>");
	});
});

describe("buildExistingReadmeInstructions", () => {
	it("returns 'from scratch' message when quality is none", () => {
		const analysis = makeAnalysis({
			existingReadme: {
				improve: [],
				missing: [],
				preserve: [],
				quality: "none",
			},
		});
		const result = buildExistingReadmeInstructions(analysis);
		expect(result).toContain("from scratch");
	});

	it("includes preserve instructions", () => {
		const analysis = makeAnalysis({
			existingReadme: {
				improve: [],
				missing: [],
				preserve: ["installation section"],
				quality: "good",
			},
		});
		const result = buildExistingReadmeInstructions(analysis);
		expect(result).toContain("Preserve");
		expect(result).toContain("installation section");
	});

	it("includes improve instructions", () => {
		const analysis = makeAnalysis({
			existingReadme: {
				improve: ["API docs"],
				missing: [],
				preserve: [],
				quality: "decent",
			},
		});
		const result = buildExistingReadmeInstructions(analysis);
		expect(result).toContain("Improve");
		expect(result).toContain("API docs");
	});

	it("includes missing topic instructions", () => {
		const analysis = makeAnalysis({
			existingReadme: {
				improve: [],
				missing: ["contributing guide"],
				preserve: [],
				quality: "poor",
			},
		});
		const result = buildExistingReadmeInstructions(analysis);
		expect(result).toContain("missing");
		expect(result).toContain("contributing guide");
	});
});

describe("buildGenerationPrompt", () => {
	it("includes recommended sections", () => {
		const prompt = buildGenerationPrompt(makeAnalysis(), makeRepoData(), {
			format: "md",
			style: "standard",
		});
		expect(prompt).toContain("hero, overview");
	});

	it("uses explicit tone over detected tone", () => {
		const prompt = buildGenerationPrompt(makeAnalysis(), makeRepoData(), {
			format: "md",
			style: "standard",
			tone: "casual",
		});
		expect(prompt).toContain("Style: casual");
	});

	it("falls back to detected tone when none specified", () => {
		const prompt = buildGenerationPrompt(makeAnalysis(), makeRepoData(), {
			format: "md",
			style: "standard",
		});
		expect(prompt).toContain("Style: professional");
	});

	it("includes style guidance for the chosen style", () => {
		const prompt = buildGenerationPrompt(makeAnalysis(), makeRepoData(), {
			format: "md",
			style: "minimal",
		});
		expect(prompt).toContain("concise");
	});

	it("specifies output format", () => {
		const prompt = buildGenerationPrompt(makeAnalysis(), makeRepoData(), {
			format: "mdx",
			style: "standard",
		});
		expect(prompt).toContain("MDX");
	});
});
