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

import { ApiError } from "./validation.js";

// Mock @google/genai at module level
const mockGenerateContent = vi.fn();
const mockModelsList = vi.fn();

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn().mockImplementation(() => ({
		models: {
			generateContent: mockGenerateContent,
			list: mockModelsList,
		},
	})),
}));

const { GeminiService } = await import("./gemini.js");

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

function makeModelsIterable(
	models: Array<{ name: string; supportedActions?: string[] }>,
) {
	return {
		[Symbol.asyncIterator]: async function* () {
			for (const m of models) {
				yield m;
			}
		},
	};
}

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
		vi.clearAllMocks();
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it("constructs with an API key", () => {
		const service = new GeminiService("test-api-key-12345");
		expect(service).toBeInstanceOf(GeminiService);
	});

	describe("generateContent", () => {
		it("returns generated text on success", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
				]),
			);
			mockGenerateContent.mockResolvedValue({ text: "Hello world" });

			const service = new GeminiService("test-key");
			const result = await service.generateContent("Say hello");
			expect(result).toBe("Hello world");
		});

		it("throws ApiError when Gemini returns empty content", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
				]),
			);
			mockGenerateContent.mockResolvedValue({ text: "" });

			const service = new GeminiService("test-key");
			await expect(service.generateContent("Say hello")).rejects.toThrow(
				ApiError,
			);
			await expect(service.generateContent("Say hello")).rejects.toThrow(
				/empty content/,
			);
		});

		it("falls back to next model on rate limit", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
					{
						name: "models/gemini-1.5-flash",
						supportedActions: ["generateContent"],
					},
				]),
			);
			mockGenerateContent
				.mockRejectedValueOnce(new Error("HTTP 429 Too Many Requests"))
				.mockResolvedValueOnce({ text: "Fallback response" });

			const service = new GeminiService("test-key");
			const result = await service.generateContent("test prompt");
			expect(result).toBe("Fallback response");
			expect(mockGenerateContent).toHaveBeenCalledTimes(2);
		});

		it("throws on non-rate-limit error without falling back", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
					{
						name: "models/gemini-1.5-flash",
						supportedActions: ["generateContent"],
					},
				]),
			);
			mockGenerateContent.mockRejectedValueOnce(new Error("Invalid API key"));

			const service = new GeminiService("test-key");
			await expect(service.generateContent("test")).rejects.toThrow(
				/Invalid API key/,
			);
			expect(mockGenerateContent).toHaveBeenCalledTimes(1);
		});

		it("throws when all models are exhausted via rate limits", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
				]),
			);
			mockGenerateContent.mockRejectedValue(
				new Error("HTTP 429 Too Many Requests"),
			);

			const service = new GeminiService("test-key");
			await expect(service.generateContent("test")).rejects.toThrow(
				/Gemini generation failed/,
			);
		});

		it("uses preferred model first when specified", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
					{
						name: "models/gemini-1.5-pro",
						supportedActions: ["generateContent"],
					},
				]),
			);
			mockGenerateContent.mockResolvedValue({ text: "result" });

			const service = new GeminiService("test-key");
			await service.generateContent("test", { model: "gemini-1.5-pro" });

			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({ model: "gemini-1.5-pro" }),
			);
		});

		it("uses hardcoded defaults when model list fetch fails", async () => {
			mockModelsList.mockRejectedValue(new Error("Network error"));
			mockGenerateContent.mockResolvedValue({ text: "result" });

			const service = new GeminiService("test-key");
			const result = await service.generateContent("test");
			expect(result).toBe("result");
			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({ model: "gemini-2.0-flash" }),
			);
		});

		it("filters out non-generation models", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
					{
						name: "models/text-embedding-004",
						supportedActions: ["embedContent"],
					},
					{ name: "models/imagen-3.0", supportedActions: ["generateImage"] },
				]),
			);
			mockGenerateContent.mockResolvedValue({ text: "result" });

			const service = new GeminiService("test-key");
			await service.generateContent("test");

			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({ model: "gemini-2.0-flash" }),
			);
		});

		it("caches model list across calls", async () => {
			mockModelsList.mockResolvedValue(
				makeModelsIterable([
					{
						name: "models/gemini-2.0-flash",
						supportedActions: ["generateContent"],
					},
				]),
			);
			mockGenerateContent.mockResolvedValue({ text: "result" });

			const service = new GeminiService("test-key");
			await service.generateContent("first");
			await service.generateContent("second");

			expect(mockModelsList).toHaveBeenCalledTimes(1);
		});
	});
});
