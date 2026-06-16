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

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";

import { GrepoValidationError } from "./errors.js";
import { parseArgs } from "./utils/args.js";
import { loadConfigFile } from "./utils/config-file.js";
import * as validation from "./utils/validation.js";

// ============================================================================
// Config Schema
// ============================================================================

export const Command = Schema.Literal(
	"readme",
	"topics",
	"describe",
	"summary",
	"tech",
	"improve",
	"changelog",
);
export type Command = Schema.Schema.Type<typeof Command>;

export const OutputFormat = Schema.Literal("md", "mdx");
export type OutputFormat = Schema.Schema.Type<typeof OutputFormat>;

export const DocumentationStyle = Schema.Literal(
	"minimal",
	"standard",
	"comprehensive",
);
export type DocumentationStyle = Schema.Schema.Type<typeof DocumentationStyle>;

export const GrepoConfig = Schema.Struct({
	branch: Schema.optional(Schema.String),
	command: Command,
	geminiApiKey: Schema.String,
	githubToken: Schema.optional(Schema.String),
	isDryRun: Schema.Boolean,
	isRaw: Schema.optional(Schema.Boolean),
	outputFile: Schema.String,
	outputFormat: OutputFormat,
	repoUrl: Schema.String,
	shouldApply: Schema.Boolean,
	shouldMerge: Schema.Boolean,
	shouldPush: Schema.Boolean,
	since: Schema.optional(Schema.String),
	style: DocumentationStyle,
	tone: Schema.optional(
		Schema.Literal("casual", "minimal", "professional", "technical"),
	),
});
export type GrepoConfig = Schema.Schema.Type<typeof GrepoConfig>;

// ============================================================================
// Env Loading
// ============================================================================

export async function loadEnv(): Promise<void> {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const envPath = resolve(__dirname, "../.env");

	if (!existsSync(envPath)) {
		return;
	}

	const envContent = readFileSync(envPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const [key, ...valueParts] = trimmed.split("=");
		if (key && valueParts.length > 0) {
			const value = valueParts
				.join("=")
				.trim()
				.replaceAll(/(^["'])|(['"]$)/g, "");
			if (!process.env[key.trim()]) {
				process.env[key.trim()] = value;
			}
		}
	}
}

// ============================================================================
// Config Builder
// ============================================================================

const BOOLEAN_FLAGS = ["push", "apply", "merge", "dry-run", "raw"] as const;

const USAGE = `Usage: grepo <command> <github-url> [options]

Commands:
  readme    Generate README documentation
  topics    Generate and apply repository topics
  describe  Generate repository description and homepage URL
  summary   Summarize repository
  tech      List technologies used
  improve   Suggest improvements
  changelog Generate a changelog from commits since the last tag

Options:
  --format md|mdx              Output format (readme only, default: md)
  --style minimal|standard|comprehensive  Documentation style (readme only, default: standard)
  --output <file>              Output file path (readme; changelog writes here when set)
  --push                       Push to GitHub (readme only)
  --apply                      Apply changes to GitHub (topics, describe)
  --merge                      Merge with existing topics (topics only)
  --dry-run                    Preview changes without applying
  --branch <name>              Target branch (default: auto-detect from repo)
  --since <tag>                Changelog start ref (default: latest tag)
  --raw                        Changelog: skip the AI polish, emit grouped commits
  --tone <voice>              Tone: casual, professional, minimal, technical (default: auto-detect)`;

const VALID_TONES = ["casual", "professional", "minimal", "technical"] as const;

function validateTone(tone: string | undefined): GrepoConfig["tone"] {
	if (!tone) {
		return undefined;
	}
	if (!VALID_TONES.includes(tone as (typeof VALID_TONES)[number])) {
		throw new GrepoValidationError({
			field: "tone",
			message: `Invalid tone "${tone}". Must be one of: ${VALID_TONES.join(", ")}`,
		});
	}
	return tone as GrepoConfig["tone"];
}

export function buildConfig(argv: string[]): GrepoConfig {
	const { options, positional } = parseArgs(argv, [...BOOLEAN_FLAGS]);

	if (positional.length < 2) {
		console.log(USAGE);
		process.exit(1);
	}

	const command = positional[0];
	const validCommands: Command[] = [
		"readme",
		"topics",
		"describe",
		"summary",
		"tech",
		"improve",
		"changelog",
	];
	if (!validCommands.includes(command as Command)) {
		console.error(`Unknown command: ${command}`);
		console.log(USAGE);
		process.exit(1);
	}

	const repoUrl = positional[1];
	if (!validation.isValidGitHubUrl(repoUrl)) {
		throw new GrepoValidationError({
			field: "repoUrl",
			message: "Invalid GitHub URL",
		});
	}

	const configFile = loadConfigFile();

	const geminiApiKey =
		process.env.GEMINI_API_KEY ??
		process.env.GOOGLE_API_KEY ??
		configFile.geminiApiKey ??
		"";
	if (!validation.isValidGeminiApiKey(geminiApiKey)) {
		throw new GrepoValidationError({
			message: "GEMINI_API_KEY is missing or invalid",
		});
	}

	const githubToken =
		process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? configFile.githubToken;
	const shouldApply = !!options.apply;
	const shouldPush = !!options.push;
	const shouldMerge = !!options.merge;

	if ((shouldApply || shouldPush || shouldMerge) && !githubToken) {
		throw new GrepoValidationError({
			message:
				"GitHub token (GITHUB_TOKEN or GH_TOKEN) is required for mutation operations",
		});
	}

	const format = (options.format as string) || "md";
	return {
		branch: (options.branch as string) || undefined,
		command: command as Command,
		geminiApiKey,
		githubToken,
		isDryRun: !!options["dry-run"],
		isRaw: !!options.raw,
		outputFile: (options.output as string) || `README.${format}`,
		outputFormat: format as OutputFormat,
		repoUrl,
		shouldApply,
		shouldMerge,
		shouldPush,
		since: (options.since as string) || undefined,
		style: ((options.style as string) || "standard") as DocumentationStyle,
		tone: validateTone(options.tone as string | undefined),
	};
}
