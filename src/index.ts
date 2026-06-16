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

// Core

export { run as analyze } from "./commands/analyze.js";
export { run as changelog } from "./commands/changelog.js";
export { run as describe } from "./commands/describe.js";
// Commands
export { run as readme } from "./commands/readme.js";
export { run as topics } from "./commands/topics.js";
export {
	buildConfig,
	type Command,
	type DocumentationStyle,
	type GrepoConfig,
	loadEnv,
	type OutputFormat,
} from "./config.js";
export {
	GeminiError,
	GitHubError,
	GitIngestError,
	type GrepoError,
	GrepoValidationError,
} from "./errors.js";
// Mermaid
export { extractMermaidBlocks, validateAndFixMermaid } from "./mermaid.js";
// Prompts
export {
	type AnalysisResult,
	buildAnalysisPrompt,
	buildExistingReadmeInstructions,
	buildGenerationPrompt,
	DEFAULT_ANALYSIS,
	extractExistingReadme,
	type GenerationOptions,
	parseAnalysis,
	STYLE_GUIDANCE,
	type Tone,
} from "./prompts/readme.js";
// Services
export {
	fetchRepo,
	Gemini,
	GeminiLive,
	type GeminiServiceApi,
	GitHub,
	GitHubLive,
	type GitHubServiceApi,
	type RepoData,
} from "./services.js";
export {
	buildChangelogPrompt,
	type CommitInfo,
	isNoiseCommit,
	type ParsedCommit,
	parseConventionalCommit,
	type RenderOptions,
	renderChangelog,
} from "./utils/changelog.js";
export { GeminiService } from "./utils/gemini.js";
export { GitHubClient } from "./utils/github.js";
export { fetchRepositoryContent } from "./utils/gitingest.js";
export { localFileContent } from "./utils/local-content.js";
// Utilities
export { Logger } from "./utils/logger.js";
