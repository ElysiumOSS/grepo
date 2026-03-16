#!/usr/bin/env bun
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

// @ts-check
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageJson } from "type-fest";

const rootDir = join(__dirname, "..", "..");
const packageJsonPath = join(rootDir, "package.json");

const packageJson = JSON.parse(
	readFileSync(packageJsonPath, "utf-8"),
) as PackageJson;

const dependencies =
	packageJson.dependencies ||
	(() => {
		throw new Error("No dependencies found");
	})();

const devDependencies =
	packageJson.devDependencies ||
	(() => {
		throw new Error("No dev dependencies found");
	})();

const picked = {
	...Object.entries(dependencies)
		.filter(([key, _]) => {
			return !devDependencies[key];
		})
		.map(([key, value]) => {
			return [key, value];
		})
		.reduce(
			(acc, [key, value]) => {
				if (!key || !value || acc[key]) {
					return acc;
				}
				acc[key] = value;
				return acc;
			},
			{} as Record<string, string>,
		),
} as const;

(async () => {
	try {
		packageJson.dependencies = picked;
		writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
	} catch (error) {
		if (error instanceof Error) {
			console.error(error.message);
		} else {
			console.error(error);
		}
	} finally {
		process.exit(0);
	}
})();
