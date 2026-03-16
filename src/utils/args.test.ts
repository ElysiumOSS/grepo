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

import { parseArgs } from "./args.js";

describe("parseArgs", () => {
	it("parses positional arguments", () => {
		const result = parseArgs(["readme", "https://github.com/a/b"]);
		expect(result.positional).toEqual(["readme", "https://github.com/a/b"]);
		expect(result.options).toEqual({});
	});

	it("parses --key value options", () => {
		const result = parseArgs(["--format", "md", "--branch", "main"]);
		expect(result.options).toEqual({ format: "md", branch: "main" });
		expect(result.positional).toEqual([]);
	});

	it("parses --key=value options", () => {
		const result = parseArgs(["--format=mdx"]);
		expect(result.options).toEqual({ format: "mdx" });
	});

	it("handles --key=value with = in the value", () => {
		const result = parseArgs(["--query=a=b=c"]);
		expect(result.options).toEqual({ query: "a=b=c" });
	});

	it("treats boolean flags as true without consuming next arg", () => {
		const result = parseArgs(["--push", "readme"], ["push"]);
		expect(result.options).toEqual({ push: true });
		expect(result.positional).toEqual(["readme"]);
	});

	it("treats flags without a next arg as boolean true", () => {
		const result = parseArgs(["--verbose"]);
		expect(result.options).toEqual({ verbose: true });
	});

	it("treats flags followed by another flag as boolean true", () => {
		const result = parseArgs(["--push", "--merge"], []);
		expect(result.options).toEqual({ push: true, merge: true });
	});

	it("mixes positional args and options", () => {
		const result = parseArgs(
			["readme", "https://github.com/a/b", "--format", "md", "--push"],
			["push"],
		);
		expect(result.positional).toEqual(["readme", "https://github.com/a/b"]);
		expect(result.options).toEqual({ format: "md", push: true });
	});

	it("returns empty result for no arguments", () => {
		const result = parseArgs([]);
		expect(result.positional).toEqual([]);
		expect(result.options).toEqual({});
	});
});
