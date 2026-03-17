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

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("node:fs", () => ({
	existsSync: mockExistsSync,
	readFileSync: mockReadFileSync,
}));

const { loadConfigFile } = await import("./config-file.js");

describe("loadConfigFile", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.clearAllMocks();
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("returns empty object when file doesn't exist", () => {
		mockExistsSync.mockReturnValue(false);

		const result = loadConfigFile();
		expect(result).toEqual({});
		expect(mockReadFileSync).not.toHaveBeenCalled();
	});

	it("reads both keys from valid config", () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				geminiApiKey: "test-gemini-key",
				githubToken: "ghp_testtoken123",
			}),
		);

		const result = loadConfigFile();
		expect(result).toEqual({
			geminiApiKey: "test-gemini-key",
			githubToken: "ghp_testtoken123",
		});
	});

	it("returns empty object on malformed JSON", () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue("{ not valid json!!!");

		const result = loadConfigFile();
		expect(result).toEqual({});
	});

	it("returns partial config when only one key is present", () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				geminiApiKey: "only-gemini",
			}),
		);

		const result = loadConfigFile();
		expect(result).toEqual({
			geminiApiKey: "only-gemini",
		});
	});

	it("ignores unknown extra keys in the JSON", () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				geminiApiKey: "key123",
				githubToken: "tok456",
				unknownField: "should-be-ignored",
				nested: { deep: true },
			}),
		);

		const result = loadConfigFile();
		expect(result).toEqual({
			geminiApiKey: "key123",
			githubToken: "tok456",
		});
		expect(result).not.toHaveProperty("unknownField");
		expect(result).not.toHaveProperty("nested");
	});
});
