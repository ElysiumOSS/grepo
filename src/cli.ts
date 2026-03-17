#!/usr/bin/env node
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

import type { GrepoConfig } from "./config.js";
import { buildConfig, loadEnv } from "./config.js";
import type {
	GeminiError,
	GitHubError,
	GitIngestError,
	GrepoValidationError,
} from "./errors.js";
import type { Gemini, GitHub } from "./services.js";
import { GeminiLive, GitHubLive } from "./services.js";
import { loadConfigFile, promptConfigSetup } from "./utils/config-file.js";
import { Logger } from "./utils/logger.js";

const logger = new Logger("GREPO");

await loadEnv();

const argv = process.argv.slice(2);

// Interactive setup if no API keys are configured
if (argv.length > 0) {
	const hasGeminiKey = !!(
		process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
	);
	if (!hasGeminiKey) {
		const configFile = loadConfigFile();
		if (!configFile.geminiApiKey) {
			const setup = await promptConfigSetup();
			if (setup.geminiApiKey) {
				process.env.GEMINI_API_KEY = setup.geminiApiKey;
			}
			if (setup.githubToken) {
				process.env.GITHUB_TOKEN = setup.githubToken;
			}
		}
	}
}

if (argv.length === 0) {
	console.log(`Usage: grepo <command> <github-url> [options]

Commands:
  readme    Generate README documentation
  topics    Generate and apply repository topics
  describe  Generate repository description and homepage URL
  summary   Summarize repository
  tech      List technologies used
  improve   Suggest improvements

Run 'grepo <command> --help' for more information.`);
	process.exit(0);
}

const parsedConfig = buildConfig(argv);

// Auto-detect default branch from GitHub API if not explicitly set
let resolvedBranch = parsedConfig.branch;
if (!resolvedBranch) {
	try {
		const { GitHubClient } = await import("./utils/github.js");
		const { parseGitHubUrl } = await import("./utils/validation.js");
		const { owner, repo } = parseGitHubUrl(parsedConfig.repoUrl);
		const client = new GitHubClient(parsedConfig.githubToken);
		resolvedBranch = await client.getDefaultBranch(owner, repo);
		logger.info(`Detected default branch: ${resolvedBranch}`);
	} catch (err) {
		resolvedBranch = "main";
		logger.warn("Could not detect default branch, falling back to 'main'", {
			error: err instanceof Error ? err.message : String(err),
			repo: parsedConfig.repoUrl,
		});
	}
}

const config = { ...parsedConfig, branch: resolvedBranch };

const layers = Layer.merge(
	GeminiLive(config.geminiApiKey),
	GitHubLive(config.githubToken),
);

type CommandRunner = (
	config: GrepoConfig,
) => Effect.Effect<
	void,
	GeminiError | GitHubError | GitIngestError | GrepoValidationError,
	Gemini | GitHub
>;

let run: CommandRunner;

switch (config.command) {
	case "readme":
		run = (await import("./commands/readme.js")).run;
		break;
	case "topics":
		run = (await import("./commands/topics.js")).run;
		break;
	case "describe":
		run = (await import("./commands/describe.js")).run;
		break;
	case "summary":
	case "tech":
	case "improve":
		run = (await import("./commands/analyze.js")).run;
		break;
}

await Effect.runPromise(
	run(config).pipe(
		Effect.provide(layers),
		Effect.catchTags({
			GeminiError: (e) =>
				Effect.sync(() => {
					logger.error(`Gemini Error: ${e.message}`);
					process.exit(1);
				}),
			GitHubError: (e) =>
				Effect.sync(() => {
					logger.error(
						`GitHub Error (${e.endpoint}): ${e.message}`,
						undefined,
						{ status: e.statusCode },
					);
					process.exit(1);
				}),
			GitIngestError: (e) =>
				Effect.sync(() => {
					logger.error(`GitIngest Error: ${e.message}`);
					process.exit(1);
				}),
			GrepoValidationError: (e) =>
				Effect.sync(() => {
					logger.error(`Validation Error: ${e.message}`, undefined, {
						field: e.field,
					});
					process.exit(1);
				}),
		}),
	),
).catch((error) => {
	logger.error("An unexpected error occurred", error);
	process.exit(1);
});
