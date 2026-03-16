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

import { describe, expect, it } from "vitest";

import { extractMermaidBlocks } from "./mermaid.js";

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
