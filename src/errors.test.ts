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
	GeminiError,
	GitHubError,
	GitIngestError,
	GrepoValidationError,
} from "./errors.js";

describe("GrepoValidationError", () => {
	it("creates with message and field", () => {
		const err = new GrepoValidationError({
			message: "Invalid URL",
			field: "repoUrl",
		});
		expect(err.message).toBe("Invalid URL");
		expect(err.field).toBe("repoUrl");
		expect(err._tag).toBe("GrepoValidationError");
	});

	it("creates without field", () => {
		const err = new GrepoValidationError({ message: "Something wrong" });
		expect(err.field).toBeUndefined();
	});
});

describe("GeminiError", () => {
	it("creates with message and cause", () => {
		const cause = new Error("timeout");
		const err = new GeminiError({ message: "API failed", cause });
		expect(err.message).toBe("API failed");
		expect(err.cause).toBe(cause);
		expect(err._tag).toBe("GeminiError");
	});

	it("creates without cause", () => {
		const err = new GeminiError({ message: "No content" });
		expect(err.cause).toBeUndefined();
	});
});

describe("GitHubError", () => {
	it("creates with all fields", () => {
		const err = new GitHubError({
			message: "Not found",
			statusCode: 404,
			endpoint: "repos/owner/repo/topics",
		});
		expect(err.message).toBe("Not found");
		expect(err.statusCode).toBe(404);
		expect(err.endpoint).toBe("repos/owner/repo/topics");
		expect(err._tag).toBe("GitHubError");
	});

	it("creates with only message", () => {
		const err = new GitHubError({ message: "Auth failed" });
		expect(err.statusCode).toBeUndefined();
		expect(err.endpoint).toBeUndefined();
	});
});

describe("GitIngestError", () => {
	it("creates with message and cause", () => {
		const err = new GitIngestError({
			message: "Fetch failed",
			cause: "network error",
		});
		expect(err.message).toBe("Fetch failed");
		expect(err.cause).toBe("network error");
		expect(err._tag).toBe("GitIngestError");
	});
});
