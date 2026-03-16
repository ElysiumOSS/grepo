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

const logger = new Logger("GREPO:DESCRIBE");

const DESCRIBE_PROMPT = `Analyze this repository and generate:
1. A concise repository description (max 350 characters) suitable for GitHub's "About" section
2. A homepage URL if you can detect one from the repository content

Look for homepage URLs in:
- package.json "homepage" field
- docs site configurations (docusaurus, vitepress, mkdocs, etc.)
- deployment configs referencing domains (vercel.json, netlify.toml, CNAME files)
- GitHub Pages configuration
- README badges or links pointing to live demos, docs, or package registries (npm, PyPI, crates.io, etc.)

Return ONLY a JSON object with this shape:
{
  "description": "the description here",
  "homepage": "https://example.com or null if not found"
}`;

export const run = (config: GrepoConfig) =>
	Effect.gen(function* () {
		const gemini = yield* Gemini;
		const github = yield* GitHub;

		displayHeader("grepo describe", {
			Apply: config.shouldApply ? "Yes" : "No",
			"Dry Run": config.isDryRun ? "Yes" : "No",
			Repository: config.repoUrl,
		});

		logger.info("Fetching repository content via GitIngest...");
		const repoData = yield* fetchRepo(config.repoUrl);
		logger.success("Content fetched successfully");

		logger.info("Generating description and detecting homepage via Gemini...");
		const prompt = `${DESCRIBE_PROMPT}\n\nURL: ${repoData.repo_url}\nSummary: ${repoData.summary}\nTree:\n${repoData.tree}\n\nContent:\n${repoData.content.slice(0, 6000)}`;
		const result = yield* gemini.generateContent(prompt);
		logger.success("Analysis complete");

		const jsonMatch = /\{[\s\S]*?\}/.exec(result);
		if (!jsonMatch) {
			logger.warn("Could not parse AI response");
			console.log();
			console.log(SEPARATOR);
			console.log(result);
			console.log(SEPARATOR);
			return;
		}

		const parsed = JSON.parse(jsonMatch[0]) as {
			description: string;
			homepage: string | null;
		};

		console.log();
		console.log(SEPARATOR);
		console.log(`  Description: ${parsed.description}`);
		console.log(`  Homepage:    ${parsed.homepage || "(none detected)"}`);
		console.log(SEPARATOR);
		console.log();

		if (parsed.description.length > 350) {
			logger.warn(
				`Description is ${parsed.description.length} chars (max 350), it will be truncated by GitHub`,
			);
		}

		const { owner, repo } = validation.parseGitHubUrl(config.repoUrl);

		const updateData: { description?: string; homepage?: string } = {
			description: parsed.description,
		};
		if (parsed.homepage) {
			updateData.homepage = parsed.homepage;
		}

		if (config.isDryRun) {
			logger.info("DRY RUN: Would set:", updateData);
			return;
		}

		if (config.shouldApply) {
			logger.info(`Updating ${owner}/${repo} on GitHub...`);
			yield* github.updateRepo(owner, repo, updateData);
			logger.success(
				"Repository description and homepage updated successfully",
			);
		} else {
			logger.info("Use --apply to set description and homepage on GitHub");
		}
	});
