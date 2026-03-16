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

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { GitIngestResponse } from "./gitingest.js";

describe("GitIngestResponse schema", () => {
	const validResponse = {
		content: "const x = 1;",
		default_max_file_size: 1118,
		digest_url: "https://gitingest.com/digest/abc",
		pattern: "",
		pattern_type: "exclude",
		repo_url: "https://github.com/owner/repo",
		short_repo_url: "owner/repo",
		summary: "A test repo",
		tree: "src/\n  index.ts",
	};

	it("validates a correct response", () => {
		const result = Schema.decodeUnknownEither(GitIngestResponse)(validResponse);
		expect(result._tag).toBe("Right");
	});

	it("rejects a response missing required fields", () => {
		const { content, ...incomplete } = validResponse;
		const result = Schema.decodeUnknownEither(GitIngestResponse)(incomplete);
		expect(result._tag).toBe("Left");
	});

	it("rejects a response with wrong types", () => {
		const badResponse = {
			...validResponse,
			default_max_file_size: "not a number",
		};
		const result = Schema.decodeUnknownEither(GitIngestResponse)(badResponse);
		expect(result._tag).toBe("Left");
	});
});
