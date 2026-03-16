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

import { Logger, LogLevel } from "./logger.js";

describe("Logger", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "group").mockImplementation(() => {});
		vi.spyOn(console, "groupEnd").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates an instance with a context", () => {
		const logger = new Logger("TEST");
		expect(logger).toBeInstanceOf(Logger);
	});

	describe("log level filtering", () => {
		it("suppresses info when minLevel is ERROR", () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.ERROR });
			logger.info("should not log");
			expect(logSpy).not.toHaveBeenCalled();
		});

		it("suppresses warn when minLevel is ERROR", () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.ERROR });
			logger.warn("should not log");
			expect(logSpy).not.toHaveBeenCalled();
		});

		it("suppresses debug when minLevel is INFO", () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.INFO });
			logger.debug("should not log");
			expect(logSpy).not.toHaveBeenCalled();
		});

		it("suppresses all when minLevel is NONE", () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.NONE });
			logger.info("no");
			logger.warn("no");
			logger.error("no");
			logger.debug("no");
			logger.trace("no");
			logger.action("no");
			logger.success("no");
			expect(logSpy).not.toHaveBeenCalled();
		});

		it("logs info when minLevel is ALL", () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.ALL });
			logger.info("hello");
			expect(logSpy).toHaveBeenCalled();
		});
	});

	describe("singleton pattern", () => {
		it("returns the same instance for the same context", () => {
			const a = Logger.getLogger("SINGLETON_TEST");
			const b = Logger.getLogger("SINGLETON_TEST");
			expect(a).toBe(b);
		});

		it("returns different instances for different contexts", () => {
			const a = Logger.getLogger("CTX_A");
			const b = Logger.getLogger("CTX_B");
			expect(a).not.toBe(b);
		});
	});

	describe("group", () => {
		it("calls console.group when level allows", () => {
			const groupSpy = vi.spyOn(console, "group");
			const logger = new Logger("TEST", { minLevel: LogLevel.ALL });
			logger.group("my group");
			expect(groupSpy).toHaveBeenCalledWith("my group");
		});

		it("suppresses group when level is NONE", () => {
			const groupSpy = vi.spyOn(console, "group");
			const logger = new Logger("TEST", { minLevel: LogLevel.NONE });
			logger.group("my group");
			expect(groupSpy).not.toHaveBeenCalled();
		});
	});

	describe("time", () => {
		it("returns the function result", async () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.ALL });
			const result = await logger.time("op", () => 42);
			expect(result).toBe(42);
		});

		it("returns the function result even when debug is suppressed", async () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.ERROR });
			const result = await logger.time("op", () => "value");
			expect(result).toBe("value");
		});

		it("rethrows errors from the timed function", async () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.ALL });
			await expect(
				logger.time("op", () => {
					throw new Error("boom");
				}),
			).rejects.toThrow("boom");
		});

		it("works with async functions", async () => {
			const logger = new Logger("TEST", { minLevel: LogLevel.ALL });
			const result = await logger.time("async op", async () => "async result");
			expect(result).toBe("async result");
		});
	});
});
