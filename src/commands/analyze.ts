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
import { fetchRepo, Gemini } from "../services.js";
import { displayHeader, SEPARATOR } from "../utils/args.js";
import { Logger } from "../utils/logger.js";

const logger = new Logger("GREPO:ANALYZE");

type AnalysisType = "improve" | "summary" | "tech";

const PROMPTS: Record<AnalysisType, string> = {
	improve: "Suggest 5 specific, actionable improvements for this repository.",
	summary: "Provide a comprehensive 2-3 paragraph summary of this repository.",
	tech: "List all technologies, frameworks, and tools used in this repository as a categorized markdown list.",
};

export const run = (config: GrepoConfig) =>
	Effect.gen(function* () {
		const gemini = yield* Gemini;
		const analysisType = config.command as AnalysisType;

		displayHeader(`grepo ${analysisType}`, {
			Repository: config.repoUrl,
		});

		logger.info("Fetching repository content via GitIngest...");
		const repoData = yield* fetchRepo(config.repoUrl, config.githubToken);
		logger.success("Content fetched successfully");

		logger.info(`Running ${analysisType} analysis via Gemini...`);
		const prompt = `${PROMPTS[analysisType]}\n\nTree:\n${repoData.tree}\n\nContent:\n${repoData.content.slice(0, 4000)}`;
		const result = yield* gemini.generateContent(prompt);
		logger.success("Analysis complete");

		console.log();
		console.log(SEPARATOR);
		console.log(result);
		console.log(SEPARATOR);
		console.log();
	});
