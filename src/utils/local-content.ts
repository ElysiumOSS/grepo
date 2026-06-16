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

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SEPARATOR = "-".repeat(80);

/**
 * Manifests worth inlining verbatim — enough for an LLM to understand the
 * project's stack/intent without shipping the whole tree. Hardcoded allowlist;
 * never interpolated into a shell.
 */
const IMPORTANT_FILES = [
	"package.json",
	"README.md",
	"README",
	"tsconfig.json",
	"pyproject.toml",
	"Cargo.toml",
	"go.mod",
	"deno.json",
] as const;

/**
 * Gather a project's content LOCALLY — a privacy-preserving, network-free
 * alternative to {@link fetchRepositoryContent} (gitingest). Nothing leaves the
 * machine: no third-party service, no GitHub token. Use this for private /
 * sensitive repos, or as a fallback when gitingest is unavailable.
 *
 * Lists git-tracked files (so node_modules, build output, and anything in
 * `.gitignore` such as `.env` are excluded by construction) and inlines a few
 * key manifests. Uses `execFile` (no shell) + `fs` reads — no command injection
 * surface; the only argument is the directory path, never interpolated.
 *
 * @param dir Project directory to read (defaults to the current working dir).
 */
export async function localFileContent(
	dir: string = process.cwd(),
): Promise<string> {
	let listing: string;
	try {
		// git-tracked files only — excludes node_modules, build artifacts, and
		// .gitignored secrets (e.g. .env) by construction.
		const { stdout } = await execFileAsync("git", ["-C", dir, "ls-files"], {
			maxBuffer: 16 * 1024 * 1024,
		});
		listing = stdout.trim();
	} catch {
		// Not a git repo (or git unavailable) — fall back to a shallow listing of
		// regular files in the directory root.
		const entries = await fs.readdir(dir, { withFileTypes: true });
		listing = entries
			.filter((e) => e.isFile())
			.map((e) => e.name)
			.join("\n");
	}

	let content = `Project files:\n${listing}\n`;
	for (const file of IMPORTANT_FILES) {
		try {
			const text = await fs.readFile(path.join(dir, file), "utf8");
			content += `\n${SEPARATOR}\n${file}:\n${SEPARATOR}\n${text}\n`;
		} catch {
			// Missing or unreadable — skip silently; the allowlist is best-effort.
		}
	}
	return content;
}
