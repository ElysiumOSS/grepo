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

import { writeFile } from "node:fs/promises";
import { Effect } from "effect";

import type { GrepoConfig } from "../config.js";
import { validateAndFixMermaid } from "../mermaid.js";
import {
	buildAnalysisPrompt,
	buildGenerationPrompt,
	extractExistingReadme,
	parseAnalysis,
} from "../prompts/readme.js";
import { fetchRepo, Gemini, GitHub } from "../services.js";
import { displayHeader } from "../utils/args.js";
import { Logger } from "../utils/logger.js";
import * as validation from "../utils/validation.js";

const logger = new Logger("GREPO:README");

export const run = (config: GrepoConfig) =>
	Effect.gen(function* () {
		const gemini = yield* Gemini;
		const github = yield* GitHub;

		displayHeader("grepo readme", {
			Format: config.outputFormat,
			Output: config.outputFile,
			Push: config.shouldPush ? `Yes (${config.branch})` : "No",
			Repository: config.repoUrl,
			Style: config.style,
		});

		logger.info("Fetching repository content via GitIngest...");
		const repoData = yield* fetchRepo(config.repoUrl);
		logger.success("Content fetched successfully");

		// Phase 1: Analysis
		logger.info("Analyzing repository structure...");
		const existingReadme = extractExistingReadme(repoData.content);
		const analysisPrompt = buildAnalysisPrompt(
			repoData,
			existingReadme ?? undefined,
		);
		const analysisRaw = yield* gemini.generateContent(analysisPrompt);
		const analysis = parseAnalysis(analysisRaw);
		logger.success("Analysis complete");

		// Phase 2: Generation
		logger.info("Generating README content via Gemini...");
		const generationPrompt = buildGenerationPrompt(analysis, repoData, {
			format: config.outputFormat,
			style: config.style,
			tone: config.tone,
		});
		const rawContent = yield* gemini.generateContent(generationPrompt);
		logger.success("README generated successfully");

		// Phase 3: Mermaid validation
		const content = yield* validateAndFixMermaid(rawContent, gemini);

		if (config.outputFile) {
			logger.info(`Saving README to ${config.outputFile}...`);
			yield* Effect.promise(() => writeFile(config.outputFile, content));
			logger.success("File saved locally");
		}

		if (config.shouldPush) {
			const { owner, repo } = validation.parseGitHubUrl(config.repoUrl);
			logger.info(`Pushing README to GitHub (${owner}/${repo})...`);
			yield* github.pushFile(
				owner,
				repo,
				config.outputFile,
				content,
				"docs: update README with AI-generated content",
				config.branch,
			);
			logger.success("Pushed to GitHub successfully");
		}
	});
