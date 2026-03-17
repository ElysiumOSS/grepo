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

import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { Schema } from "effect";

import { Logger } from "./logger.js";

const logger = Logger.getLogger("GREPO:CONFIG");

export const CONFIG_PATH = join(homedir(), ".config", "grepo", "config.json");

export const ConfigFileSchema = Schema.Struct({
	geminiApiKey: Schema.optional(Schema.String),
	githubToken: Schema.optional(Schema.String),
});

export type ConfigFile = Schema.Schema.Type<typeof ConfigFileSchema>;

export function writeConfigFile(config: ConfigFile): void {
	const dir = CONFIG_PATH.replace(/\/[^/]+$/, "");
	mkdirSync(dir, { recursive: true });
	const content = JSON.stringify(config, null, 2);
	writeFileSync(CONFIG_PATH, content, "utf-8");
	chmodSync(CONFIG_PATH, 0o600);
	logger.info("Config file written", { path: CONFIG_PATH });
}

function ask(rl: Interface, question: string): Promise<string> {
	return new Promise((resolve) => {
		rl.question(question, (answer: string) => {
			resolve(answer);
		});
	});
}

export async function promptConfigSetup(): Promise<ConfigFile> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stderr,
	});

	try {
		logger.info("No API keys found. Let's set up your config.");

		const geminiApiKey = await ask(rl, "  Gemini API key: ");
		const githubToken = await ask(
			rl,
			"  GitHub token (optional, press Enter to skip): ",
		);

		const config: ConfigFile = {
			geminiApiKey: geminiApiKey || undefined,
			githubToken: githubToken || undefined,
		};

		writeConfigFile(config);

		return config;
	} finally {
		rl.close();
	}
}

export function loadConfigFile(): ConfigFile {
	if (!existsSync(CONFIG_PATH)) {
		return {};
	}

	try {
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		return Schema.decodeUnknownSync(ConfigFileSchema)(parsed);
	} catch (error) {
		logger.warn("Failed to read config file", {
			path: CONFIG_PATH,
			error: error instanceof Error ? error.message : String(error),
		});
		return {};
	}
}
