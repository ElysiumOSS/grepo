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
	ApiError,
	isValidBranchName,
	isValidGeminiApiKey,
	isValidGitHubToken,
	isValidGitHubUrl,
	parseGitHubUrl,
	ValidationError,
} from "./validation.js";

describe("isValidGitHubUrl", () => {
	it("accepts a valid HTTPS GitHub URL", () => {
		expect(isValidGitHubUrl("https://github.com/owner/repo")).toBe(true);
	});

	it("accepts a URL with extra path segments", () => {
		expect(isValidGitHubUrl("https://github.com/owner/repo/tree/main")).toBe(
			true,
		);
	});

	it("accepts HTTP URLs", () => {
		expect(isValidGitHubUrl("http://github.com/owner/repo")).toBe(true);
	});

	it("rejects a URL with only one path segment", () => {
		expect(isValidGitHubUrl("https://github.com/owner")).toBe(false);
	});

	it("rejects non-GitHub hosts", () => {
		expect(isValidGitHubUrl("https://gitlab.com/owner/repo")).toBe(false);
	});

	it("rejects non-URL strings", () => {
		expect(isValidGitHubUrl("not a url")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isValidGitHubUrl("")).toBe(false);
	});
});

describe("isValidGitHubToken", () => {
	it.each([
		"ghp_",
		"github_pat_",
		"gho_",
		"ghu_",
		"ghs_",
		"ghr_",
	])("accepts tokens starting with %s", (prefix) => {
		expect(isValidGitHubToken(`${prefix}abc123`)).toBe(true);
	});

	it("rejects tokens without a known prefix", () => {
		expect(isValidGitHubToken("invalid_token")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isValidGitHubToken("")).toBe(false);
	});
});

describe("isValidGeminiApiKey", () => {
	it("accepts a key of 20+ characters", () => {
		expect(isValidGeminiApiKey("a".repeat(20))).toBe(true);
	});

	it("rejects a key shorter than 20 characters", () => {
		expect(isValidGeminiApiKey("short")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isValidGeminiApiKey("")).toBe(false);
	});
});

describe("isValidBranchName", () => {
	it("accepts valid branch names", () => {
		expect(isValidBranchName("main")).toBe(true);
		expect(isValidBranchName("feature-branch")).toBe(true);
		expect(isValidBranchName("release_1.0")).toBe(true);
	});

	it("rejects branches with spaces", () => {
		expect(isValidBranchName("my branch")).toBe(false);
	});

	it("rejects branches with special characters", () => {
		expect(isValidBranchName("branch/name")).toBe(false);
	});

	it("rejects branches longer than 255 characters", () => {
		expect(isValidBranchName("a".repeat(256))).toBe(false);
	});

	it("accepts branches at exactly 255 characters", () => {
		expect(isValidBranchName("a".repeat(255))).toBe(true);
	});
});

describe("parseGitHubUrl", () => {
	it("extracts owner and repo from a standard URL", () => {
		expect(parseGitHubUrl("https://github.com/octocat/hello-world")).toEqual({
			owner: "octocat",
			repo: "hello-world",
		});
	});

	it("extracts owner and repo from a URL with extra path segments", () => {
		expect(
			parseGitHubUrl("https://github.com/octocat/hello-world/tree/main"),
		).toEqual({
			owner: "octocat",
			repo: "hello-world",
		});
	});

	it("throws for a URL with insufficient path segments", () => {
		expect(() => parseGitHubUrl("https://github.com/owner")).toThrow(
			"Invalid GitHub URL",
		);
	});
});

describe("ValidationError", () => {
	it("stores message and field", () => {
		const err = new ValidationError("bad input", "email");
		expect(err.message).toBe("bad input");
		expect(err.field).toBe("email");
		expect(err.name).toBe("ValidationError");
	});

	it("works without a field", () => {
		const err = new ValidationError("generic error");
		expect(err.field).toBeUndefined();
	});
});

describe("ApiError", () => {
	it("stores message, statusCode, and endpoint", () => {
		const err = new ApiError("not found", 404, "/api/users");
		expect(err.message).toBe("not found");
		expect(err.statusCode).toBe(404);
		expect(err.endpoint).toBe("/api/users");
		expect(err.name).toBe("ApiError");
	});

	it("works without optional fields", () => {
		const err = new ApiError("server error");
		expect(err.statusCode).toBeUndefined();
		expect(err.endpoint).toBeUndefined();
	});
});
