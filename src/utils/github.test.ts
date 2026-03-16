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

import { GitHubClient } from "./github.js";

describe("GitHubClient", () => {
	describe("constructor", () => {
		it("creates an instance without a token", () => {
			const client = new GitHubClient();
			expect(client).toBeInstanceOf(GitHubClient);
		});

		it("creates an instance with a token", () => {
			const client = new GitHubClient("ghp_test123");
			expect(client).toBeInstanceOf(GitHubClient);
		});
	});

	describe("token guards", () => {
		it("throws when pushFile is called without a token", async () => {
			const client = new GitHubClient();
			await expect(
				client.pushFile("owner", "repo", "README.md", "content", "msg", "main"),
			).rejects.toThrow("GitHub token is required for push operations");
		});

		it("throws when setTopics is called without a token", async () => {
			const client = new GitHubClient();
			await expect(client.setTopics("owner", "repo", ["test"])).rejects.toThrow(
				"GitHub token is required for setting topics",
			);
		});

		it("throws when updateRepo is called without a token", async () => {
			const client = new GitHubClient();
			await expect(
				client.updateRepo("owner", "repo", { description: "test" }),
			).rejects.toThrow("GitHub token is required for updating repository");
		});
	});
});
