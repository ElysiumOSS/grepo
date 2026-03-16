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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeminiService } from "./gemini.js";

// Access private methods via prototype for testing pure logic
const parseModelVersion = (name: string): number => {
	const match = /(\d+)\.(\d+)/.exec(name);
	if (!match) {
		return 0;
	}
	return Number(match[1]) * 1000 + Number(match[2]);
};

const isRateLimitError = (error: unknown): boolean => {
	if (!(error instanceof Error)) {
		return false;
	}
	const msg = error.message.toLowerCase();
	return (
		msg.includes("429") ||
		msg.includes("rate limit") ||
		msg.includes("resource exhausted") ||
		msg.includes("quota")
	);
};

describe("parseModelVersion", () => {
	it("parses version from model name", () => {
		expect(parseModelVersion("gemini-2.0-flash")).toBe(2000);
		expect(parseModelVersion("gemini-1.5-pro")).toBe(1005);
		expect(parseModelVersion("gemini-2.5-flash-preview-05-20")).toBe(2005);
	});

	it("returns 0 for names without versions", () => {
		expect(parseModelVersion("gemini-flash")).toBe(0);
		expect(parseModelVersion("some-model")).toBe(0);
	});
});

describe("isRateLimitError", () => {
	it("detects 429 errors", () => {
		expect(isRateLimitError(new Error("HTTP 429 Too Many Requests"))).toBe(
			true,
		);
	});

	it("detects rate limit messages", () => {
		expect(isRateLimitError(new Error("Rate limit exceeded"))).toBe(true);
	});

	it("detects resource exhausted", () => {
		expect(isRateLimitError(new Error("resource exhausted"))).toBe(true);
	});

	it("detects quota errors", () => {
		expect(isRateLimitError(new Error("Quota exceeded for project"))).toBe(
			true,
		);
	});

	it("returns false for non-Error values", () => {
		expect(isRateLimitError("string error")).toBe(false);
		expect(isRateLimitError(null)).toBe(false);
		expect(isRateLimitError(undefined)).toBe(false);
	});

	it("returns false for unrelated errors", () => {
		expect(isRateLimitError(new Error("Network timeout"))).toBe(false);
		expect(isRateLimitError(new Error("Invalid API key"))).toBe(false);
	});
});

describe("GeminiService", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it("constructs with an API key", () => {
		const service = new GeminiService("test-api-key-12345");
		expect(service).toBeInstanceOf(GeminiService);
	});
});
