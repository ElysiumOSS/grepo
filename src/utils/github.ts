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

import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import { Effect, Schema } from "effect";

import type { CommitInfo } from "./changelog.js";
import { get, patch, put } from "./fetcher.js";
import { ApiError } from "./validation.js";

const GITHUB_API = "https://api.github.com" as const;
const GITHUB_API_VERSION = "2022-11-28" as const;

export const GitHubFileContent = Schema.Struct({
	content: Schema.String,
	encoding: Schema.String,
	name: Schema.String,
	path: Schema.String,
	sha: Schema.String,
	size: Schema.Number,
});

const GitHubCommit = Schema.Struct({
	commit: Schema.Struct({
		author: Schema.optional(
			Schema.Struct({
				date: Schema.optional(Schema.String),
				name: Schema.optional(Schema.String),
			}),
		),
		message: Schema.String,
	}),
	sha: Schema.String,
});

function normalizeCommit(
	raw: Schema.Schema.Type<typeof GitHubCommit>,
): CommitInfo {
	return {
		author: raw.commit.author?.name,
		date: raw.commit.author?.date,
		message: raw.commit.message,
		sha: raw.sha,
	};
}

export class GitHubClient {
	constructor(private readonly token?: string) {}

	private get headers(): Record<string, string> {
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": GITHUB_API_VERSION,
		};
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}
		return headers;
	}

	async getFile(
		owner: string,
		repo: string,
		path: string,
	): Promise<Schema.Schema.Type<typeof GitHubFileContent> | null> {
		try {
			return Effect.runPromise(
				Effect.provide(
					get(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
						headers: this.headers,
						schema: GitHubFileContent,
					}),
					FetchHttpClient.layer,
				),
			);
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"status" in error &&
				error.status === 404
			) {
				return null;
			}
			throw new ApiError(
				`GitHub API error: ${error instanceof Error ? error.message : String(error)}`,
				undefined,
				"GitHub API",
			);
		}
	}

	async pushFile(
		owner: string,
		repo: string,
		path: string,
		content: string,
		message: string,
		branch: string,
	): Promise<void> {
		if (!this.token) {
			throw new Error("GitHub token is required for push operations");
		}

		const existingFile = await this.getFile(owner, repo, path);

		await Effect.runPromise(
			Effect.provide(
				put(
					`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
					{
						branch,
						content: Buffer.from(content).toString("base64"),
						message,
						...(existingFile && { sha: existingFile.sha }),
					},
					{
						headers: {
							...this.headers,
							"Content-Type": "application/json",
						},
					},
				),
				FetchHttpClient.layer,
			),
		);
	}

	async getTopics(owner: string, repo: string): Promise<readonly string[]> {
		const TopicsResponse = Schema.Struct({
			names: Schema.Array(Schema.String),
		});
		const result = await Effect.runPromise(
			Effect.provide(
				get(`${GITHUB_API}/repos/${owner}/${repo}/topics`, {
					headers: this.headers,
					schema: TopicsResponse,
				}),
				FetchHttpClient.layer,
			),
		);
		return result.names;
	}

	async setTopics(
		owner: string,
		repo: string,
		topics: string[],
	): Promise<void> {
		if (!this.token) {
			throw new Error("GitHub token is required for setting topics");
		}

		await Effect.runPromise(
			Effect.provide(
				put(
					`${GITHUB_API}/repos/${owner}/${repo}/topics`,
					{ names: topics },
					{
						headers: {
							...this.headers,
							"Content-Type": "application/json",
						},
					},
				),
				FetchHttpClient.layer,
			),
		);
	}

	async getDefaultBranch(owner: string, repo: string): Promise<string> {
		const RepoResponse = Schema.Struct({
			default_branch: Schema.String,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				get(`${GITHUB_API}/repos/${owner}/${repo}`, {
					headers: this.headers,
					schema: RepoResponse,
				}),
				FetchHttpClient.layer,
			),
		);
		return result.default_branch;
	}

	async updateRepo(
		owner: string,
		repo: string,
		data: { description?: string; homepage?: string },
	): Promise<void> {
		if (!this.token) {
			throw new Error("GitHub token is required for updating repository");
		}

		await Effect.runPromise(
			Effect.provide(
				patch(`${GITHUB_API}/repos/${owner}/${repo}`, data, {
					headers: {
						...this.headers,
						"Content-Type": "application/json",
					},
				}),
				FetchHttpClient.layer,
			),
		);
	}

	async listTags(
		owner: string,
		repo: string,
	): Promise<{ name: string; sha: string }[]> {
		const TagsResponse = Schema.Array(
			Schema.Struct({
				commit: Schema.Struct({ sha: Schema.String }),
				name: Schema.String,
			}),
		);
		const result = await Effect.runPromise(
			Effect.provide(
				get(`${GITHUB_API}/repos/${owner}/${repo}/tags?per_page=100`, {
					headers: this.headers,
					schema: TagsResponse,
				}),
				FetchHttpClient.layer,
			),
		);
		return result.map((tag) => ({ name: tag.name, sha: tag.commit.sha }));
	}

	async compareCommits(
		owner: string,
		repo: string,
		base: string,
		head: string,
	): Promise<CommitInfo[]> {
		const CompareResponse = Schema.Struct({
			commits: Schema.Array(GitHubCommit),
		});
		const result = await Effect.runPromise(
			Effect.provide(
				get(
					`${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
					{ headers: this.headers, schema: CompareResponse },
				),
				FetchHttpClient.layer,
			),
		);
		return result.commits.map(normalizeCommit);
	}

	async listCommits(
		owner: string,
		repo: string,
		ref: string,
		perPage = 100,
	): Promise<CommitInfo[]> {
		const CommitsResponse = Schema.Array(GitHubCommit);
		const result = await Effect.runPromise(
			Effect.provide(
				get(
					`${GITHUB_API}/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(ref)}&per_page=${perPage}`,
					{ headers: this.headers, schema: CommitsResponse },
				),
				FetchHttpClient.layer,
			),
		);
		return result.map(normalizeCommit);
	}
}
