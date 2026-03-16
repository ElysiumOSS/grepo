import { execFile } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";

import type { GeminiServiceApi } from "./services.js";
import { Logger } from "./utils/logger.js";

const execFileAsync = promisify(execFile);
const logger = new Logger("GREPO:MERMAID");

interface MermaidBlock {
	code: string;
	end: number;
	index: number;
	start: number;
}

export function extractMermaidBlocks(markdown: string): MermaidBlock[] {
	const blocks: MermaidBlock[] = [];
	const regex = /```mermaid\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	let index = 0;

	while ((match = regex.exec(markdown)) !== null) {
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
	const dir = await mkdtemp(join(tmpdir(), "mermaid-"));
	const inputFile = join(dir, "input.mmd");
	const outputFile = join(dir, "output.svg");

	try {
		await writeFile(inputFile, block.code);

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
					() => Effect.succeed(currentCode),
				);

				currentCode = fixed
					.replace(/^```(?:mermaid)?\s*/i, "")
					.replace(/\s*```\s*$/, "")
					.trim();

				validation = yield* Effect.promise(() =>
					validateBlock({ ...block, code: currentCode }),
				);
			}

			if (validation.valid && currentCode !== block.code) {
				logger.success(
					`Diagram ${block.index + 1} fixed after ${attempt} attempt(s)`,
				);
				result = result.replace(
					`\`\`\`mermaid\n${block.code}\n\`\`\``,
					`\`\`\`mermaid\n${currentCode}\n\`\`\``,
				);
			} else if (validation.valid) {
				logger.success(`Diagram ${block.index + 1} valid`);
			} else {
				logger.warn(
					`Diagram ${block.index + 1} could not be fixed, removing it`,
				);
				result = result.replace(`\`\`\`mermaid\n${block.code}\n\`\`\``, "");
			}
		}

		return result;
	});
