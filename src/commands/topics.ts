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

import type { GrepoConfig } from "../config.js";
import { fetchRepo, Gemini, GitHub } from "../services.js";
import { displayHeader, SEPARATOR } from "../utils/args.js";
import { Logger } from "../utils/logger.js";
import * as validation from "../utils/validation.js";

const logger = new Logger("GREPO:TOPICS");

const TOPICS_PROMPT = `Analyze this repository and suggest 5-8 relevant GitHub topics.
Return ONLY a JSON array of lowercase, hyphenated strings. Example: ["typescript", "cli-tool", "ai-powered"]`;

export const run = (config: GrepoConfig) =>
	Effect.gen(function* () {
		const gemini = yield* Gemini;
		const github = yield* GitHub;

		displayHeader("grepo topics", {
			Apply: config.shouldApply ? "Yes" : "No",
			"Dry Run": config.isDryRun ? "Yes" : "No",
			Merge: config.shouldMerge ? "Yes" : "No",
			Repository: config.repoUrl,
		});

		logger.info("Fetching repository content via GitIngest...");
		const repoData = yield* fetchRepo(config.repoUrl);
		logger.success("Content fetched successfully");

		logger.info("Running topics analysis via Gemini...");
		const prompt = `${TOPICS_PROMPT}\n\nTree:\n${repoData.tree}\n\nContent:\n${repoData.content.slice(0, 4000)}`;
		const result = yield* gemini.generateContent(prompt);
		logger.success("Analysis complete");

		console.log();
		console.log(SEPARATOR);
		console.log(result);
		console.log(SEPARATOR);
		console.log();

		const jsonMatch = /\[[\s\S]*?\]/.exec(result);
		if (!jsonMatch) {
			logger.warn("Could not find topics list in AI response");
			return;
		}

		const suggested = (JSON.parse(jsonMatch[0]) as string[]).map((t) =>
			t.toLowerCase().trim().replaceAll(/\s+/g, "-"),
		);

		const { owner, repo } = validation.parseGitHubUrl(config.repoUrl);

		let finalTopics = suggested;
		if (config.shouldMerge && config.githubToken) {
			logger.info("Fetching current topics from GitHub...");
			const current = yield* github.getTopics(owner, repo);
			finalTopics = [...new Set([...current, ...suggested])].sort((a, b) =>
				a.localeCompare(b),
			);
		}

		if (config.isDryRun) {
			logger.info("DRY RUN: Would apply these topics:", {
				topics: finalTopics,
			});
			return;
		}

		if (config.shouldApply) {
			logger.info("Applying topics to GitHub...");
			yield* github.setTopics(owner, repo, finalTopics);
			logger.success("Topics applied successfully");
		} else {
			logger.info("Use --apply to set these topics on GitHub");
		}
	});
