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

import { FetcherError, ValidationError } from "./fetcher.js";

describe("FetcherError", () => {
	it("stores all properties", () => {
		const err = new FetcherError(
			"timeout",
			"https://api.example.com",
			408,
			{ detail: "slow" },
			2,
		);
		expect(err.message).toBe("timeout");
		expect(err.url).toBe("https://api.example.com");
		expect(err.status).toBe(408);
		expect(err.responseData).toEqual({ detail: "slow" });
		expect(err.attempt).toBe(2);
		expect(err.name).toBe("FetcherError");
	});

	it("works with only required fields", () => {
		const err = new FetcherError("failed", "https://api.example.com");
		expect(err.status).toBeUndefined();
		expect(err.responseData).toBeUndefined();
		expect(err.attempt).toBeUndefined();
	});

	it("formats toString with status and attempt", () => {
		const err = new FetcherError("timeout", "https://x.com", 500, undefined, 3);
		expect(err.toString()).toBe(
			"FetcherError: timeout (URL: https://x.com, Status: 500, Attempt: 3)",
		);
	});

	it("formats toString without optional fields", () => {
		const err = new FetcherError("failed", "https://x.com");
		expect(err.toString()).toBe("FetcherError: failed (URL: https://x.com)");
	});

	it("is an instance of Error", () => {
		const err = new FetcherError("oops", "https://x.com");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(FetcherError);
	});
});

describe("ValidationError", () => {
	it("stores all properties", () => {
		const err = new ValidationError(
			"schema mismatch",
			"https://api.example.com",
			"expected string, got number",
			{ bad: "data" },
			1,
		);
		expect(err.message).toBe("schema mismatch");
		expect(err.url).toBe("https://api.example.com");
		expect(err.problems).toBe("expected string, got number");
		expect(err.responseData).toEqual({ bad: "data" });
		expect(err.attempt).toBe(1);
		expect(err.name).toBe("ValidationError");
	});

	it("formats toString with attempt", () => {
		const err = new ValidationError("bad", "https://x.com", "issue", null, 2);
		expect(err.toString()).toBe(
			"ValidationError: bad (URL: https://x.com, Attempt: 2)",
		);
	});

	it("formats toString without attempt", () => {
		const err = new ValidationError("bad", "https://x.com", "issue", null);
		expect(err.toString()).toBe("ValidationError: bad (URL: https://x.com)");
	});

	it("returns problems via getProblemsString", () => {
		const err = new ValidationError(
			"bad",
			"https://x.com",
			"field is required",
			null,
		);
		expect(err.getProblemsString()).toBe("field is required");
	});

	it("is an instance of Error", () => {
		const err = new ValidationError("bad", "https://x.com", "", null);
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(ValidationError);
	});
});
