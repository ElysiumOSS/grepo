import type { DocumentationStyle } from "../config.js";
import { Logger } from "../utils/logger.js";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AnalysisResult {
	diagrams: Array<{
		keyNodes: string[];
		purpose: string;
		scope: string;
		type: "c4-context" | "er" | "flowchart" | "sequence" | "state";
	}>;
	existingReadme: {
		improve: string[];
		missing: string[];
		preserve: string[];
		quality: "decent" | "good" | "none" | "poor";
	};
	identity: { differentiators: string[]; name: string; oneLiner: string };
	repoType: string;
	sections: {
		recommended: string[];
		skip: Array<{ reason: string; section: string }>;
	};
	tone: {
		detected: "casual" | "minimal" | "professional" | "technical";
		evidence: string;
	};
}

export type Tone = "casual" | "minimal" | "professional" | "technical";

export interface GenerationOptions {
	format: "md" | "mdx";
	style: DocumentationStyle;
	tone?: Tone;
}

// ============================================================================
// Repo Data type
// ============================================================================

export interface RepoData {
	content: string;
	repo_url: string;
	summary: string;
	tree: string;
}

// ============================================================================
// Default Fallback
// ============================================================================

export const DEFAULT_ANALYSIS: AnalysisResult = {
	diagrams: [],
	existingReadme: {
		improve: [],
		missing: [],
		preserve: [],
		quality: "none",
	},
	identity: {
		differentiators: [],
		name: "Unknown",
		oneLiner: "",
	},
	repoType: "library",
	sections: {
		recommended: [
			"hero",
			"overview",
			"installation",
			"quick-start",
			"usage",
			"development",
			"license",
		],
		skip: [],
	},
	tone: {
		detected: "professional",
		evidence: "fallback default",
	},
};

// ============================================================================
// Utilities
// ============================================================================

export function extractExistingReadme(content: string): string | null {
	const readmeMatch =
		/(?:^|\n)(?:={3,}|─{3,})?\s*README\.md\s*(?:={3,}|─{3,})?\n([\s\S]*?)(?=\n(?:={3,}|─{3,})\s*\S+\.\S+|$)/.exec(
			content,
		);
	if (readmeMatch?.[1] && readmeMatch[1].trim().length > 50) {
		return readmeMatch[1].trim();
	}
	return null;
}

export function parseAnalysis(raw: string): AnalysisResult {
	try {
		const stripped = raw
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```\s*$/, "")
			.trim();

		const parsed = JSON.parse(stripped) as Partial<AnalysisResult>;

		if (
			!parsed.repoType ||
			!parsed.identity?.name ||
			!parsed.tone?.detected ||
			!parsed.sections?.recommended?.length
		) {
			throw new Error("Missing required fields in analysis JSON");
		}

		return parsed as AnalysisResult;
	} catch (err) {
		const logger = new Logger("GREPO:README-PROMPT");
		logger.warn(
			`Failed to parse analysis JSON, falling back to DEFAULT_ANALYSIS. Error: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
		return DEFAULT_ANALYSIS;
	}
}

// ============================================================================
// Phase 1: Analysis Prompt
// ============================================================================

export function buildAnalysisPrompt(
	repoData: RepoData,
	existingReadme?: string,
): string {
	const existingReadmeBlock = existingReadme
		? `
<existing_readme>
${existingReadme.slice(0, 4000)}
</existing_readme>`
		: "";

	return `You are an expert technical analyst. Analyze the repository below and return ONLY valid JSON — no markdown fences, no commentary, no extra text.

<output_schema>
{
  "repoType": "string — e.g. cli-tool, library, web-app, api, monorepo, config, data-pipeline, etc.",
  "identity": {
    "name": "string — canonical project name",
    "oneLiner": "string — one sentence describing what it does",
    "differentiators": ["string — unique selling points"]
  },
  "tone": {
    "detected": "casual | professional | minimal | technical",
    "evidence": "string — quote or observation that led to this conclusion"
  },
  "sections": {
    "recommended": ["string — section keys from the catalog below, in logical order"],
    "skip": [{ "section": "string", "reason": "string" }]
  },
  "diagrams": [
    {
      "type": "flowchart | sequence | c4-context | er | state",
      "purpose": "string — what this diagram explains",
      "scope": "string — what subsystem or flow it covers",
      "keyNodes": ["string — important nodes or actors"]
    }
  ],
  "existingReadme": {
    "quality": "good | decent | poor | none",
    "preserve": ["string — sections or content worth keeping verbatim"],
    "improve": ["string — sections that exist but need rework"],
    "missing": ["string — important topics not covered"]
  }
}
</output_schema>

<section_catalog>
hero           — project name, tagline, badges
overview       — what it does and why it exists
features       — bullet list of capabilities
architecture   — system design, component overview
installation   — how to install/setup
quick-start    — minimal working example
usage          — detailed usage instructions
cli-reference  — CLI flags and subcommands
api-reference  — public API docs
configuration  — env vars, config files
development    — local dev setup, contributing workflow
deployment     — how to deploy/release
contributing   — contribution guidelines
license        — license info
</section_catalog>

<rules>
- Only recommend sections that have real supporting content in the repository.
- Recommend at most 2 diagrams. Choose diagram types based on:
  - c4-context: multi-service architectures with external dependencies
  - sequence: request/response workflows or multi-actor interactions
  - flowchart: data pipelines, build processes, or decision trees
  - state: object lifecycle or state machine logic
  - er: data models with relationships
- Detect tone from existing docs, comments, and README style (if present).
- Be conservative: fewer well-chosen sections beat a bloated list.
</rules>

<repository_context>
url: ${repoData.repo_url}
summary: ${repoData.summary}

<tree>
${repoData.tree}
</tree>

<content>
${repoData.content.slice(0, 8000)}
</content>
</repository_context>
${existingReadmeBlock}`;
}

// ============================================================================
// Phase 2: Generation Helpers
// ============================================================================

export const STYLE_GUIDANCE: Record<DocumentationStyle, string> = {
	comprehensive:
		"Be thorough. Multiple examples, edge cases, full API surface. Expand every recommended section fully.",
	minimal:
		"Keep it concise. Favor short sentences and small sections. Omit exhaustive examples. Badge count ≤ 3.",
	standard:
		"Balance depth and brevity. One code example per major section. Moderate badge set. Include a quick-start.",
};

export function buildExistingReadmeInstructions(
	analysis: AnalysisResult,
): string {
	if (analysis.existingReadme.quality === "none") {
		return "No existing README was found. Generate the document from scratch.";
	}

	const lines: string[] = [
		`Existing README quality: ${analysis.existingReadme.quality}.`,
	];

	if (analysis.existingReadme.preserve.length > 0) {
		lines.push(
			`Preserve the following content verbatim where possible:\n${analysis.existingReadme.preserve.map((s) => `  - ${s}`).join("\n")}`,
		);
	}

	if (analysis.existingReadme.improve.length > 0) {
		lines.push(
			`Improve (rewrite/expand) these sections:\n${analysis.existingReadme.improve.map((s) => `  - ${s}`).join("\n")}`,
		);
	}

	if (analysis.existingReadme.missing.length > 0) {
		lines.push(
			`Add these missing topics:\n${analysis.existingReadme.missing.map((s) => `  - ${s}`).join("\n")}`,
		);
	}

	return lines.join("\n");
}

// ============================================================================
// Phase 2: Generation Prompt
// ============================================================================

export function buildGenerationPrompt(
	analysis: AnalysisResult,
	repoData: RepoData,
	options: GenerationOptions,
): string {
	const effectiveTone: Tone = options.tone ?? analysis.tone.detected;

	const toneDescriptions: Record<Tone, string> = {
		casual:
			"Friendly, approachable, first-person plural ('we'). Use contractions. Short paragraphs. Light humor is fine.",
		minimal:
			"Extremely terse. Bullet points over prose. No introductory fluff. Every word must earn its place.",
		professional:
			"Clear, precise, authoritative. Third-person or imperative. No jargon without definition. Avoid filler words.",
		technical:
			"Assume a developer audience. Use correct terminology. Include type signatures, flags, and internals where relevant.",
	};

	return `You are a senior technical writer generating a README for a software project.

<output_rules>
- Output ONLY the raw ${options.format.toUpperCase()} content. No preamble, no explanation, no markdown fences wrapping the whole document.
- Only generate the sections listed in recommended_sections below. Do not add extras.
- No generic filler phrases like "In this section we will…" or "This project is a…".
- Mermaid diagrams must follow diagram_rules exactly.
</output_rules>

<analysis>
${JSON.stringify(analysis, null, 2)}
</analysis>

<recommended_sections>
${analysis.sections.recommended.join(", ")}
</recommended_sections>

<tone>
Style: ${effectiveTone}
Description: ${toneDescriptions[effectiveTone]}
</tone>

<diagram_rules>
CRITICAL SYNTAX RULES (violations cause render errors):
- Wrap ALL node labels in quotes if they contain spaces, special chars, or parentheses: A["My Label"]
- NEVER use bare parentheses in labels — use quotes: A["Deploy (prod)"] NOT A[Deploy (prod)]
- NEVER use colons in labels without quotes: A["Step: Init"] NOT A[Step: Init]
- Arrow syntax: use --> for solid, -.-> for dotted. NEVER use -> alone in flowcharts.
- Subgraph IDs must not contain spaces: subgraph auth_flow["Auth Flow"]
- Semicolons are NOT terminators — do not end lines with ;
- Each node definition must be on its own line.

STYLE RULES:
- Use descriptive labels on all nodes — never single letters like A, B, C.
- Add meaningful labels on edges to describe data flow or actions.
- Use subgraphs to group related nodes into logical clusters.
- Limit diagrams to 15 nodes maximum.

TYPE-SPECIFIC TEMPLATES (follow these exactly):

flowchart (always TD):
\`\`\`mermaid
flowchart TD
    A["User Request"] --> B{"Auth Valid?"}
    B -->|Yes| C["Process Request"]
    B -->|No| D["Return 401"]
    C --> E["Send Response"]
\`\`\`

sequence:
\`\`\`mermaid
sequenceDiagram
    actor User
    participant API
    participant DB
    User->>API: POST /login
    activate API
    API->>DB: Query user
    DB-->>API: User record
    API-->>User: JWT token
    deactivate API
\`\`\`

c4-context (use C4Context):
\`\`\`mermaid
C4Context
    Person(user, "Developer", "Uses the CLI tool")
    System(cli, "CLI", "Command-line interface")
    System_Ext(api, "GitHub API", "Repository management")
    Rel(user, cli, "Runs commands")
    Rel(cli, api, "REST calls")
\`\`\`

er:
\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
\`\`\`

state:
\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : start
    Processing --> Done : complete
    Processing --> Failed : error
    Failed --> Idle : retry
    Done --> [*]
\`\`\`

COMMON MISTAKES TO AVOID:
- Using "graph" instead of "flowchart"
- Missing quotes around labels with special characters
- Using C4_Context instead of C4Context
- Forgetting "activate/deactivate" in sequence diagrams
- Using --> in sequence diagrams (use ->> or -->> instead)
</diagram_rules>

<existing_readme_handling>
${buildExistingReadmeInstructions(analysis)}
</existing_readme_handling>

<style_profile>
Documentation style: ${options.style}
${STYLE_GUIDANCE[options.style]}
</style_profile>

<repository_context>
url: ${repoData.repo_url}
summary: ${repoData.summary}

<tree>
${repoData.tree}
</tree>

<content>
${repoData.content}
</content>
</repository_context>`;
}
