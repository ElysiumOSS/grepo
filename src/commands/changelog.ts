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

import { writeFileSync } from "node:fs";
import { Effect } from "effect";

import type { GrepoConfig } from "../config.js";
import { GrepoValidationError } from "../errors.js";
import { Gemini, GitHub } from "../services.js";
import { displayHeader, SEPARATOR } from "../utils/args.js";
import {
	buildChangelogPrompt,
	type CommitInfo,
	renderChangelog,
} from "../utils/changelog.js";
import { Logger } from "../utils/logger.js";
import * as validation from "../utils/validation.js";

const logger = new Logger("GREPO:CHANGELOG");

export const run = (config: GrepoConfig) =>
	Effect.gen(function* () {
		const github = yield* GitHub;

		displayHeader("grepo changelog", {
			Raw: config.isRaw ? "Yes" : "No",
			Repository: config.repoUrl,
			Since: config.since ?? "latest tag",
		});

		const { owner, repo } = validation.parseGitHubUrl(config.repoUrl);
		const head = config.branch || "HEAD";

		let base = config.since;
		if (!base) {
			logger.info("Resolving the latest tag...");
			const tags = yield* github.listTags(owner, repo);
			base = tags[0]?.name;
		}

		logger.info(
			base
				? `Collecting commits ${base}..${head}...`
				: `No tags found; collecting recent commits on ${head}...`,
		);
		const commits: readonly CommitInfo[] = base
			? yield* github.compareCommits(owner, repo, base, head)
			: yield* github.listCommits(owner, repo, head);
		logger.success(`Collected ${commits.length} commit(s)`);

		let output = renderChangelog(commits, {});
		if (!config.isRaw) {
			logger.info("Polishing changelog via Gemini...");
			const gemini = yield* Gemini;
			output = yield* gemini.generateContent(
				buildChangelogPrompt(output, config.repoUrl),
			);
		}

		console.log();
		console.log(SEPARATOR);
		console.log(output);
		console.log(SEPARATOR);
		console.log();

		// buildConfig defaults outputFile to README.<fmt>; only write when the
		// user passed an explicit, non-README --output path.
		if (config.outputFile && !config.outputFile.startsWith("README.")) {
			const target = config.outputFile;
			yield* Effect.try({
				catch: (error) =>
					new GrepoValidationError({
						field: "output",
						message: `Failed to write ${target}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					}),
				try: () => writeFileSync(target, output, "utf8"),
			});
			logger.success(`Wrote changelog to ${target}`);
		}
	});
