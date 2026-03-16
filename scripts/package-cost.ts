#!/usr/bin/env tsx
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

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageJson } from "type-fest";

const isNotNull = <Value>(value: Value): value is Exclude<Value, null> =>
	value !== null;

const packageJsonPath = join(process.cwd(), "package.json");
const packageJson = JSON.parse(
	readFileSync(packageJsonPath, "utf-8"),
) as PackageJson;
const dependencies = Object.keys(packageJson.dependencies || {});
const devDependencies = Object.keys(packageJson.devDependencies || {});
const allDependencies = [...dependencies, ...devDependencies] as [
	string,
	...string[],
];
const OUTPUT_DIR = `${process.cwd()}/out`;

const getPackageSize = (
	packageName: string,
): { name: string; size: number } | null => {
	try {
		const result = execSync(
			`npm view ${packageName} dist.unpackedSize --json`,
			{
				encoding: "utf-8",
			},
		);
		const size = JSON.parse(result) as number;
		return {
			name: packageName,
			size: size,
		};
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to get size for ${packageName}:`, error.message);
		} else {
			console.error(`Failed to get size for ${packageName}:`, error);
		}
		return null;
	}
};

const packageSizes = allDependencies
	.map((packageName) => getPackageSize(packageName))
	.filter(Boolean)
	.filter(isNotNull);

const sortedPackageSizes = packageSizes.sort((a, b) => b.size - a.size);

writeFileSync(
	`${OUTPUT_DIR}/package-sizes.json`,
	JSON.stringify(sortedPackageSizes, null, 2),
);
