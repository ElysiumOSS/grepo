import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import { Effect, Schema } from "effect";

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

export class GitHubClient {
	constructor(private readonly token?: string) {}

	private get headers(): Record<string, string> {
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": GITHUB_API_VERSION,
		};
		if (this.token) {
			headers["Authorization"] = `Bearer ${this.token}`;
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
}
