// Core
export {
	type Command,
	type DocumentationStyle,
	type GrepoConfig,
	type OutputFormat,
	buildConfig,
	loadEnv,
} from "./config.js";
export {
	type GrepoError,
	GeminiError,
	GitHubError,
	GitIngestError,
	GrepoValidationError,
} from "./errors.js";

// Services
export {
	type GeminiServiceApi,
	type GitHubServiceApi,
	type RepoData,
	Gemini,
	GeminiLive,
	GitHub,
	GitHubLive,
	fetchRepo,
} from "./services.js";

// Mermaid
export { extractMermaidBlocks, validateAndFixMermaid } from "./mermaid.js";

// Prompts
export {
	type AnalysisResult,
	type GenerationOptions,
	type Tone,
	DEFAULT_ANALYSIS,
	STYLE_GUIDANCE,
	buildAnalysisPrompt,
	buildExistingReadmeInstructions,
	buildGenerationPrompt,
	extractExistingReadme,
	parseAnalysis,
} from "./prompts/readme.js";

// Commands
export { run as readme } from "./commands/readme.js";
export { run as topics } from "./commands/topics.js";
export { run as describe } from "./commands/describe.js";
export { run as analyze } from "./commands/analyze.js";

// Utilities
export { Logger } from "./utils/logger.js";
export { GeminiService } from "./utils/gemini.js";
export { GitHubClient } from "./utils/github.js";
export { fetchRepositoryContent } from "./utils/gitingest.js";
