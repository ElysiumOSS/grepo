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

import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GeminiServiceApi } from "./services.js";

// Mock child_process and fs/promises to control validateBlock behavior
const mockExecFile = vi.fn();
const mockMkdtemp = vi.fn();
const mockWriteFile = vi.fn();
const mockRm = vi.fn();

vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
}));

vi.mock("node:fs/promises", () => ({
	mkdtemp: mockMkdtemp,
	rm: mockRm,
	writeFile: mockWriteFile,
}));

// Must import after mocks are set up
const { extractMermaidBlocks, validateAndFixMermaid } = await import(
	"./mermaid.js"
);

function setupValidateBlockSuccess() {
	mockMkdtemp.mockResolvedValue("/tmp/mermaid-abc");
	mockWriteFile.mockResolvedValue(undefined);
	mockRm.mockResolvedValue(undefined);
	mockExecFile.mockImplementation(
		(
			_cmd: string,
			_args: string[],
			_opts: unknown,
			cb: (err: Error | null) => void,
		) => {
			cb(null);
		},
	);
}

function setupValidateBlockFailure(stderr = "Parse error on line 1") {
	mockMkdtemp.mockResolvedValue("/tmp/mermaid-abc");
	mockWriteFile.mockResolvedValue(undefined);
	mockRm.mockResolvedValue(undefined);
	const error = Object.assign(new Error("mmdc failed"), { stderr });
	mockExecFile.mockImplementation(
		(
			_cmd: string,
			_args: string[],
			_opts: unknown,
			cb: (err: Error | null) => void,
		) => {
			cb(error);
		},
	);
}

function makeGemini(
	impl: (prompt: string) => Effect.Effect<string, { message: string }>,
): GeminiServiceApi {
	return { generateContent: impl };
}

describe("extractMermaidBlocks", () => {
	it("returns empty array when no mermaid blocks exist", () => {
		expect(extractMermaidBlocks("# Hello\nNo diagrams here")).toEqual([]);
	});

	it("extracts a single mermaid block", () => {
		const md = `# Title

\`\`\`mermaid
flowchart TD
    A --> B
\`\`\`

Some text`;

		const blocks = extractMermaidBlocks(md);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].code).toBe("flowchart TD\n    A --> B");
		expect(blocks[0].index).toBe(0);
	});

	it("extracts multiple mermaid blocks", () => {
		const md = `\`\`\`mermaid
flowchart TD
    A --> B
\`\`\`

\`\`\`mermaid
sequenceDiagram
    A->>B: Hello
\`\`\``;

		const blocks = extractMermaidBlocks(md);
		expect(blocks).toHaveLength(2);
		expect(blocks[0].code).toContain("flowchart");
		expect(blocks[0].index).toBe(0);
		expect(blocks[1].code).toContain("sequenceDiagram");
		expect(blocks[1].index).toBe(1);
	});

	it("ignores non-mermaid code blocks", () => {
		const md = `\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`mermaid
flowchart TD
    A --> B
\`\`\``;

		const blocks = extractMermaidBlocks(md);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].code).toContain("flowchart");
	});

	it("tracks correct start and end positions", () => {
		const md = `\`\`\`mermaid
graph TD
    A --> B
\`\`\``;

		const blocks = extractMermaidBlocks(md);
		expect(blocks[0].start).toBe(0);
		expect(blocks[0].end).toBe(md.length);
	});

	it("trims whitespace from extracted code", () => {
		const md = `\`\`\`mermaid

  flowchart TD
    A --> B

\`\`\``;

		const blocks = extractMermaidBlocks(md);
		expect(blocks[0].code).toBe("flowchart TD\n    A --> B");
	});
});

describe("validateAndFixMermaid", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.clearAllMocks();
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const geminiNoop = makeGemini(() => Effect.succeed("unused"));

	it("returns content unchanged when no mermaid blocks exist", async () => {
		const content = "# Hello\nNo diagrams here";
		const result = await Effect.runPromise(
			validateAndFixMermaid(content, geminiNoop),
		);
		expect(result).toBe(content);
	});

	it("returns content unchanged when all blocks are valid", async () => {
		setupValidateBlockSuccess();

		const content = `\`\`\`mermaid
flowchart TD
    A --> B
\`\`\``;

		const result = await Effect.runPromise(
			validateAndFixMermaid(content, geminiNoop),
		);
		expect(result).toBe(content);
	});

	it("replaces invalid block with Gemini-fixed code", async () => {
		let callCount = 0;
		mockMkdtemp.mockResolvedValue("/tmp/mermaid-abc");
		mockWriteFile.mockResolvedValue(undefined);
		mockRm.mockResolvedValue(undefined);
		mockExecFile.mockImplementation(
			(
				_cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null) => void,
			) => {
				callCount++;
				if (callCount === 1) {
					cb(Object.assign(new Error("fail"), { stderr: "syntax error" }));
				} else {
					cb(null);
				}
			},
		);

		const gemini = makeGemini(() =>
			Effect.succeed("flowchart TD\n    A --> C"),
		);

		const content = `\`\`\`mermaid
flowchart TD
    A -> B
\`\`\``;

		const result = await Effect.runPromise(
			validateAndFixMermaid(content, gemini),
		);
		expect(result).toBe(`\`\`\`mermaid
flowchart TD
    A --> C
\`\`\``);
	});

	it("removes block when Gemini cannot fix it", async () => {
		setupValidateBlockFailure("syntax error");

		const gemini = makeGemini(() => Effect.succeed("still broken"));

		const content = `Some text

\`\`\`mermaid
bad diagram
\`\`\`

More text`;

		const result = await Effect.runPromise(
			validateAndFixMermaid(content, gemini, 1),
		);
		expect(result).toBe("Some text\n\n\n\nMore text");
	});

	it("falls back gracefully when Gemini call fails", async () => {
		setupValidateBlockFailure("syntax error");

		const gemini = makeGemini(() =>
			Effect.fail({ message: "API quota exceeded" }),
		);

		const content = `\`\`\`mermaid
bad diagram
\`\`\``;

		const result = await Effect.runPromise(
			validateAndFixMermaid(content, gemini, 1),
		);
		expect(result).toBe("");
	});

	it("strips markdown fences from Gemini response", async () => {
		let callCount = 0;
		mockMkdtemp.mockResolvedValue("/tmp/mermaid-abc");
		mockWriteFile.mockResolvedValue(undefined);
		mockRm.mockResolvedValue(undefined);
		mockExecFile.mockImplementation(
			(
				_cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null) => void,
			) => {
				callCount++;
				if (callCount === 1) {
					cb(Object.assign(new Error("fail"), { stderr: "error" }));
				} else {
					cb(null);
				}
			},
		);

		const gemini = makeGemini(() =>
			Effect.succeed("```mermaid\nflowchart TD\n    A --> B\n```"),
		);

		const content = `\`\`\`mermaid
bad
\`\`\``;

		const result = await Effect.runPromise(
			validateAndFixMermaid(content, gemini),
		);
		expect(result).toContain("flowchart TD\n    A --> B");
		expect(result).not.toContain("```mermaid\n```mermaid");
	});

	it("handles multiple blocks with correct offset tracking", async () => {
		let callCount = 0;
		mockMkdtemp.mockResolvedValue("/tmp/mermaid-abc");
		mockWriteFile.mockResolvedValue(undefined);
		mockRm.mockResolvedValue(undefined);
		mockExecFile.mockImplementation(
			(
				_cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null) => void,
			) => {
				callCount++;
				// Block 1: fail then succeed; Block 2: fail then succeed
				if (callCount % 2 === 1) {
					cb(Object.assign(new Error("fail"), { stderr: "error" }));
				} else {
					cb(null);
				}
			},
		);

		const gemini = makeGemini((prompt) => {
			if (prompt.includes("A -> B")) {
				return Effect.succeed("flowchart TD\n    A --> B");
			}
			return Effect.succeed("sequenceDiagram\n    X->>Y: Fixed");
		});

		const content = `\`\`\`mermaid
flowchart TD
    A -> B
\`\`\`

\`\`\`mermaid
sequenceDiagram
    X->Y: Broken
\`\`\``;

		const result = await Effect.runPromise(
			validateAndFixMermaid(content, gemini),
		);
		expect(result).toContain("A --> B");
		expect(result).toContain("X->>Y: Fixed");
		// Both blocks should still be properly fenced
		const fenceCount = (result.match(/```mermaid/g) || []).length;
		expect(fenceCount).toBe(2);
	});

	it("respects maxRetries limit", async () => {
		setupValidateBlockFailure("persistent error");

		let geminiCalls = 0;
		const gemini = makeGemini(() => {
			geminiCalls++;
			return Effect.succeed("still broken");
		});

		const content = `\`\`\`mermaid
bad
\`\`\``;

		await Effect.runPromise(validateAndFixMermaid(content, gemini, 3));
		expect(geminiCalls).toBe(3);
	});
});
