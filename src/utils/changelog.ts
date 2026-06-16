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

/**
 * Pure changelog helpers. No network, no GitHub token, no third-party service —
 * the `changelog` command feeds these commits pulled straight from the GitHub
 * REST API (compare / commits), keeping the privacy posture of localFileContent.
 */

/** A single commit, normalized from the GitHub API. */
export interface CommitInfo {
	sha: string;
	message: string;
	author?: string;
	date?: string;
}

/** A commit message parsed against the Conventional Commits grammar. */
export interface ParsedCommit {
	type: string | null;
	scope: string | null;
	breaking: boolean;
	subject: string;
}

// Note: capture the subject as `.*` directly after the colon (no leading `\s*`)
// and trim it in code. A `\s*` followed by `.+` both match spaces, which CodeQL
// flags as polynomial ReDoS (js/polynomial-redos) on untrusted commit messages.
const CONVENTIONAL_RE =
	/^(?<type>\w+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:(?<subject>.*)$/;

const SECTIONS: ReadonlyArray<{ type: string; title: string }> = [
	{ title: "Features", type: "feat" },
	{ title: "Bug Fixes", type: "fix" },
	{ title: "Performance Improvements", type: "perf" },
	{ title: "Reverts", type: "revert" },
	{ title: "Refactoring", type: "refactor" },
	{ title: "Documentation", type: "docs" },
	{ title: "Build System", type: "build" },
	{ title: "Continuous Integration", type: "ci" },
	{ title: "Tests", type: "test" },
	{ title: "Styles", type: "style" },
	{ title: "Chores", type: "chore" },
];

const OTHER_TITLE = "Other Changes";
const BREAKING_TITLE = "⚠ BREAKING CHANGES";

/**
 * Whether a commit is noise in a changelog: merge commits and release-bump
 * commits (release-it's "chore: release vX") add nothing for readers.
 */
export function isNoiseCommit(message: string): boolean {
	const first = (message.split("\n", 1)[0] ?? "").trim();
	return (
		/^Merge (pull request|branch|remote-tracking)/i.test(first) ||
		/^chore(\([^)]*\))?:\s*release\b/i.test(first)
	);
}

/** Parse the first line of a commit message as a Conventional Commit. */
export function parseConventionalCommit(message: string): ParsedCommit {
	const first = (message.split("\n", 1)[0] ?? "").trim();
	const breakingBody = /^BREAKING[ -]CHANGE/m.test(message);
	const match = CONVENTIONAL_RE.exec(first);
	if (!match?.groups) {
		return { breaking: breakingBody, scope: null, subject: first, type: null };
	}
	return {
		breaking: breakingBody || match.groups.breaking === "!",
		scope: match.groups.scope ?? null,
		subject: (match.groups.subject ?? "").trim(),
		type: (match.groups.type ?? "").toLowerCase(),
	};
}

function renderEntry(parsed: ParsedCommit, sha: string): string {
	const scope = parsed.scope ? `**${parsed.scope}:** ` : "";
	const ref = sha ? ` (${sha.slice(0, 7)})` : "";
	return `- ${scope}${parsed.subject}${ref}`;
}

export interface RenderOptions {
	version?: string;
	date?: string;
}

/**
 * Render commits into a Markdown changelog grouped by Conventional Commit type.
 * Breaking changes are surfaced in their own leading section. Merge/release
 * commits are dropped; unrecognized types fall under "Other Changes".
 */
export function renderChangelog(
	commits: ReadonlyArray<CommitInfo>,
	options: RenderOptions = {},
): string {
	const buckets = new Map<string, string[]>();
	const breaking: string[] = [];

	for (const commit of commits) {
		if (isNoiseCommit(commit.message)) {
			continue;
		}
		const parsed = parseConventionalCommit(commit.message);
		const entry = renderEntry(parsed, commit.sha);
		if (parsed.breaking) {
			breaking.push(entry);
		}
		const title =
			SECTIONS.find((section) => section.type === parsed.type)?.title ??
			OTHER_TITLE;
		const list = buckets.get(title) ?? [];
		list.push(entry);
		buckets.set(title, list);
	}

	const heading = `## ${options.version ?? "Unreleased"}`;
	const dated = options.date ? `${heading} (${options.date})` : heading;
	const lines: string[] = [dated, ""];

	if (breaking.length === 0 && buckets.size === 0) {
		lines.push("_No notable changes._");
		return `${lines.join("\n")}\n`;
	}

	if (breaking.length > 0) {
		lines.push(`### ${BREAKING_TITLE}`, "", ...breaking, "");
	}
	for (const title of [
		...SECTIONS.map((section) => section.title),
		OTHER_TITLE,
	]) {
		const entries = buckets.get(title);
		if (entries && entries.length > 0) {
			lines.push(`### ${title}`, "", ...entries, "");
		}
	}

	return `${lines.join("\n").trimEnd()}\n`;
}

/** Build a Gemini prompt that polishes a generated changelog into release notes. */
export function buildChangelogPrompt(
	rendered: string,
	repoUrl: string,
): string {
	return `You are writing release notes for the GitHub repository ${repoUrl}.

Below is an auto-generated changelog grouped from conventional commits. Rewrite it
into a polished, user-facing changelog in Markdown:
- Keep the section structure (Features, Bug Fixes, etc.) and the short commit SHAs.
- Tighten wording, fix grammar, and phrase each entry as a clear, present-tense benefit.
- Do NOT invent changes that are not present, and do NOT add a preamble or commentary.
- Return ONLY the Markdown changelog, with no surrounding code fences.

<changelog>
${rendered}
</changelog>`;
}
