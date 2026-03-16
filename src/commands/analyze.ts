import { Effect } from "effect";

import type { GrepoConfig } from "../config.js";
import { Gemini, fetchRepo } from "../services.js";
import { SEPARATOR, displayHeader } from "../utils/args.js";
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
		const repoData = yield* fetchRepo(config.repoUrl);
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
