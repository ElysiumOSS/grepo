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

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Effect, Schema } from "effect";

import type { GeminiServiceApi } from "./services.js";
import { Logger } from "./utils/logger.js";

const execFileAsync = promisify(execFile);
const logger = new Logger("GREPO:MERMAID");

export const MermaidBlock = Schema.Struct({
	code: Schema.String,
	end: Schema.Number,
	index: Schema.Number,
	start: Schema.Number,
});
export type MermaidBlock = Schema.Schema.Type<typeof MermaidBlock>;

export function extractMermaidBlocks(markdown: string): MermaidBlock[] {
	const blocks: MermaidBlock[] = [];
	const regex = /```mermaid\n([\s\S]*?)```/g;
	let index = 0;

	for (
		let match = regex.exec(markdown);
		match !== null;
		match = regex.exec(markdown)
	) {
		blocks.push({
			code: match[1].trim(),
			end: match.index + match[0].length,
			index: index++,
			start: match.index,
		});
	}

	return blocks;
}

async function validateBlock(
	block: MermaidBlock,
): Promise<{ error?: string; valid: boolean }> {
	let dir: string;
	try {
		dir = await mkdtemp(join(tmpdir(), "mermaid-"));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(`Failed to create temp directory: ${message}`);
		return {
			error: `Temp directory creation failed: ${message}`,
			valid: false,
		};
	}

	const inputFile = join(dir, "input.mmd");
	const outputFile = join(dir, "output.svg");

	try {
		await writeFile(inputFile, block.code);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(`Failed to write mermaid input file: ${message}`);
		await rm(dir, { force: true, recursive: true }).catch(() => {});
		return { error: `File write failed: ${message}`, valid: false };
	}

	try {
		await execFileAsync(
			"npx",
			["mmdc", "-i", inputFile, "-o", outputFile, "-e", "svg"],
			{ timeout: 15_000 },
		);

		return { valid: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const stderr =
			err &&
			typeof err === "object" &&
			"stderr" in err &&
			typeof err.stderr === "string"
				? err.stderr
				: "";
		return { error: stderr.trim() || message, valid: false };
	} finally {
		await rm(dir, { force: true, recursive: true }).catch(() => {});
	}
}

function buildFixPrompt(code: string, error: string): string {
	return `The following Mermaid diagram has a syntax error. Fix it and return ONLY the corrected Mermaid code — no fences, no explanation.

<broken_diagram>
${code}
</broken_diagram>

<error>
${error}
</error>

Common fixes:
- Wrap labels with special chars in quotes: A["Label (info)"]
- Use --> not -> in flowcharts
- Use ->> not --> in sequence diagrams
- Use "flowchart" not "graph"
- Subgraph IDs cannot have spaces
- No semicolons at end of lines

Return ONLY the fixed Mermaid code.`;
}

export const validateAndFixMermaid = (
	content: string,
	gemini: GeminiServiceApi,
	maxRetries = 2,
): Effect.Effect<string, never> =>
	Effect.gen(function* () {
		const blocks = extractMermaidBlocks(content);
		if (blocks.length === 0) {
			return content;
		}

		logger.info(`Validating ${blocks.length} Mermaid diagram(s)...`);
		let result = content;
		let offset = 0;

		for (const block of blocks) {
			let currentCode = block.code;
			let attempt = 0;
			let validation = yield* Effect.promise(() =>
				validateBlock({ ...block, code: currentCode }),
			);

			while (!validation.valid && attempt < maxRetries) {
				attempt++;
				logger.warn(
					`Diagram ${block.index + 1} invalid (attempt ${attempt}/${maxRetries}): ${validation.error}`,
				);

				const fixPrompt = buildFixPrompt(
					currentCode,
					validation.error ?? "Unknown error",
				);
				const fixed: string = yield* Effect.catchAll(
					gemini.generateContent(fixPrompt),
					(err) => {
						logger.warn(
							`Diagram ${block.index + 1}: Gemini fix failed (${err.message}), keeping current code`,
						);
						return Effect.succeed(currentCode);
					},
				);

				currentCode = fixed
					.replace(/^```(?:mermaid)?\s*/i, "")
					.replace(/\s*```\s*$/, "")
					.trim();

				validation = yield* Effect.promise(() =>
					validateBlock({ ...block, code: currentCode }),
				);
			}

			const start = block.start + offset;
			const end = block.end + offset;

			if (validation.valid && currentCode !== block.code) {
				logger.success(
					`Diagram ${block.index + 1} fixed after ${attempt} attempt(s)`,
				);
				const replacement = `\`\`\`mermaid\n${currentCode}\n\`\`\``;
				result = result.slice(0, start) + replacement + result.slice(end);
				offset += replacement.length - (block.end - block.start);
			} else if (validation.valid) {
				logger.success(`Diagram ${block.index + 1} valid`);
			} else {
				logger.warn(
					`Diagram ${block.index + 1} could not be fixed after ${attempt} attempt(s), removing it: ${validation.error}`,
				);
				result = result.slice(0, start) + result.slice(end);
				offset -= block.end - block.start;
			}
		}

		return result;
	});
