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

import { describe, expect, it } from "vitest";

import {
	type CommitInfo,
	isNoiseCommit,
	parseConventionalCommit,
	renderChangelog,
} from "./changelog.js";

describe("parseConventionalCommit", () => {
	it("parses type, scope, and subject", () => {
		const parsed = parseConventionalCommit("feat(cli): add changelog command");
		expect(parsed.type).toBe("feat");
		expect(parsed.scope).toBe("cli");
		expect(parsed.subject).toBe("add changelog command");
		expect(parsed.breaking).toBe(false);
	});

	it("detects a breaking change via the ! marker", () => {
		const parsed = parseConventionalCommit("feat!: drop node 18 support");
		expect(parsed.type).toBe("feat");
		expect(parsed.breaking).toBe(true);
	});

	it("detects a breaking change via the body footer", () => {
		const parsed = parseConventionalCommit(
			"fix: adjust api\n\nBREAKING CHANGE: response shape changed",
		);
		expect(parsed.breaking).toBe(true);
	});

	it("returns a null type for non-conventional messages", () => {
		const parsed = parseConventionalCommit("update readme");
		expect(parsed.type).toBeNull();
		expect(parsed.subject).toBe("update readme");
	});
});

describe("isNoiseCommit", () => {
	it("flags merge commits", () => {
		expect(isNoiseCommit("Merge pull request #3 from owner/branch")).toBe(true);
	});

	it("flags release-bump commits", () => {
		expect(isNoiseCommit("chore: release v0.4.2")).toBe(true);
	});

	it("does not flag normal commits", () => {
		expect(isNoiseCommit("feat: add thing")).toBe(false);
	});
});

describe("renderChangelog", () => {
	const commits: CommitInfo[] = [
		{ message: "feat(cli): add changelog command", sha: "aaaaaaa1" },
		{ message: "fix: handle empty tag list", sha: "bbbbbbb2" },
		{ message: "Merge pull request #3 from owner/branch", sha: "ccccccc3" },
		{ message: "chore: release v0.4.2", sha: "ddddddd4" },
		{ message: "totally freeform note", sha: "eeeeeee5" },
	];

	it("groups commits into conventional sections and drops noise", () => {
		const md = renderChangelog(commits, { version: "0.5.0" });
		expect(md).toContain("## 0.5.0");
		expect(md).toContain("### Features");
		expect(md).toContain("**cli:** add changelog command (aaaaaaa)");
		expect(md).toContain("### Bug Fixes");
		expect(md).toContain("handle empty tag list (bbbbbbb)");
		expect(md).toContain("### Other Changes");
		expect(md).toContain("totally freeform note (eeeeeee)");
		expect(md).not.toContain("Merge pull request");
		expect(md).not.toContain("release v0.4.2");
	});

	it("surfaces a leading breaking-changes section", () => {
		const md = renderChangelog([
			{ message: "feat!: redo the api", sha: "f0f0f0f0" },
		]);
		expect(md).toContain("BREAKING CHANGES");
		expect(md).toContain("redo the api (f0f0f0f)");
	});

	it("renders a placeholder when nothing is notable", () => {
		const md = renderChangelog([
			{ message: "Merge branch 'main'", sha: "1111111" },
		]);
		expect(md).toContain("_No notable changes._");
	});

	it("defaults the heading to Unreleased", () => {
		const md = renderChangelog([{ message: "feat: x", sha: "2222222" }]);
		expect(md).toContain("## Unreleased");
	});
});
