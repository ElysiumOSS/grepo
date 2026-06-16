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

import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { localFileContent } from "./local-content.js";

describe("localFileContent", () => {
	it("lists git-tracked files and inlines package.json (no network)", async () => {
		const out = await localFileContent(process.cwd());
		expect(out).toContain("Project files:");
		expect(out).toContain("package.json");
		// the manifest body is inlined, not just listed
		expect(out).toContain("@elysiumoss/grepo");
	});

	it("falls back to a directory listing for a non-git path", async () => {
		const out = await localFileContent(tmpdir());
		expect(typeof out).toBe("string");
		expect(out).toContain("Project files:");
	});
});
