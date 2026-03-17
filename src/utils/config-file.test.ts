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
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockChmodSync = vi.fn();

vi.mock("node:fs", () => ({
	existsSync: mockExistsSync,
	readFileSync: mockReadFileSync,
	mkdirSync: mockMkdirSync,
	writeFileSync: mockWriteFileSync,
	chmodSync: mockChmodSync,
}));

const mockQuestion = vi.fn();
const mockClose = vi.fn();

vi.mock("node:readline", () => ({
	createInterface: vi.fn(() => ({
		question: mockQuestion,
		close: mockClose,
	})),
}));

const { loadConfigFile, writeConfigFile, promptConfigSetup, CONFIG_PATH } =
	await import("./config-file.js");

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

describe("writeConfigFile", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.clearAllMocks();
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it("creates config directory and writes file with 0600 permissions", () => {
		const config = {
			geminiApiKey: "test-gemini-key",
			githubToken: "ghp_testtoken123",
		};

		writeConfigFile(config);

		const dir = CONFIG_PATH.replace(/\/[^/]+$/, "");
		expect(mockMkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
		expect(mockWriteFileSync).toHaveBeenCalledWith(
			CONFIG_PATH,
			JSON.stringify(config, null, 2),
			"utf-8",
		);
		expect(mockChmodSync).toHaveBeenCalledWith(CONFIG_PATH, 0o600);
	});

	it("writes config with only geminiApiKey when githubToken is omitted", () => {
		const config = {
			geminiApiKey: "only-gemini-key",
		};

		writeConfigFile(config);

		expect(mockWriteFileSync).toHaveBeenCalledWith(
			CONFIG_PATH,
			JSON.stringify(config, null, 2),
			"utf-8",
		);
		expect(mockChmodSync).toHaveBeenCalledWith(CONFIG_PATH, 0o600);
	});
});

describe("promptConfigSetup", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.clearAllMocks();
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it("prompts for both keys, writes config, and returns result", async () => {
		mockQuestion
			.mockImplementationOnce((_q: string, cb: (answer: string) => void) =>
				cb("my-gemini-key"),
			)
			.mockImplementationOnce((_q: string, cb: (answer: string) => void) =>
				cb("ghp_mytoken"),
			);

		const result = await promptConfigSetup();

		expect(result).toEqual({
			geminiApiKey: "my-gemini-key",
			githubToken: "ghp_mytoken",
		});
		expect(mockWriteFileSync).toHaveBeenCalled();
		expect(mockClose).toHaveBeenCalled();
	});

	it("allows skipping GitHub token with empty input", async () => {
		mockQuestion
			.mockImplementationOnce((_q: string, cb: (answer: string) => void) =>
				cb("my-gemini-key"),
			)
			.mockImplementationOnce((_q: string, cb: (answer: string) => void) =>
				cb(""),
			);

		const result = await promptConfigSetup();

		expect(result).toEqual({
			geminiApiKey: "my-gemini-key",
			githubToken: undefined,
		});
		expect(mockWriteFileSync).toHaveBeenCalled();
		expect(mockClose).toHaveBeenCalled();
	});
});
