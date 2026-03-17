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

import type { Schema } from "effect";
import { Context, Effect, Layer } from "effect";

import { GeminiError, GitHubError, GitIngestError } from "./errors.js";
import { GeminiService as GeminiClient } from "./utils/gemini.js";
import { GitHubClient } from "./utils/github.js";
import {
	fetchRepositoryContent,
	type GitIngestResponse,
} from "./utils/gitingest.js";

// ============================================================================
// Gemini Service
// ============================================================================

export interface GeminiServiceApi {
	readonly generateContent: (
		prompt: string,
	) => Effect.Effect<string, GeminiError>;
}

export class Gemini extends Context.Tag("Gemini")<Gemini, GeminiServiceApi>() {}

export const GeminiLive = (apiKey: string) =>
	Layer.succeed(Gemini, {
		generateContent: (prompt: string) =>
			Effect.tryPromise({
				catch: (error) =>
					new GeminiError({
						cause: error,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => new GeminiClient(apiKey).generateContent(prompt),
			}),
	});

// ============================================================================
// GitHub Service
// ============================================================================

export interface GitHubServiceApi {
	readonly getDefaultBranch: (
		owner: string,
		repo: string,
	) => Effect.Effect<string, GitHubError>;
	readonly getTopics: (
		owner: string,
		repo: string,
	) => Effect.Effect<readonly string[], GitHubError>;
	readonly pushFile: (
		owner: string,
		repo: string,
		path: string,
		content: string,
		message: string,
		branch: string,
	) => Effect.Effect<void, GitHubError>;
	readonly setTopics: (
		owner: string,
		repo: string,
		topics: string[],
	) => Effect.Effect<void, GitHubError>;
	readonly updateRepo: (
		owner: string,
		repo: string,
		data: { description?: string; homepage?: string },
	) => Effect.Effect<void, GitHubError>;
}

export class GitHub extends Context.Tag("GitHub")<GitHub, GitHubServiceApi>() {}

export const GitHubLive = (token?: string) => {
	const client = new GitHubClient(token);
	return Layer.succeed(GitHub, {
		getDefaultBranch: (owner, repo) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.getDefaultBranch(owner, repo),
			}),
		getTopics: (owner, repo) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}/topics`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.getTopics(owner, repo),
			}),
		pushFile: (owner, repo, path, content, message, branch) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}/contents/${path}`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.pushFile(owner, repo, path, content, message, branch),
			}),
		setTopics: (owner, repo, topics) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}/topics`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.setTopics(owner, repo, topics),
			}),
		updateRepo: (owner, repo, data) =>
			Effect.tryPromise({
				catch: (error) =>
					new GitHubError({
						endpoint: `repos/${owner}/${repo}`,
						message: error instanceof Error ? error.message : String(error),
					}),
				try: () => client.updateRepo(owner, repo, data),
			}),
	});
};

// ============================================================================
// GitIngest Service
// ============================================================================

export type RepoData = Schema.Schema.Type<typeof GitIngestResponse>;

export const fetchRepo = (
	repoUrl: string,
	token?: string,
): Effect.Effect<RepoData, GitIngestError> =>
	Effect.tryPromise({
		catch: (error) =>
			new GitIngestError({
				cause: error,
				message: error instanceof Error ? error.message : String(error),
			}),
		try: () => fetchRepositoryContent(repoUrl, token),
	});
