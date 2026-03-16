#!/usr/bin/env node

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
import { Logger } from "./utils/logger.js";

const logger = new Logger("GREPO");

await loadEnv();

const argv = process.argv.slice(2);

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

const config = buildConfig(argv);

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
