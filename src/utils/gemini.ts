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

import { GoogleGenAI, type Model } from "@google/genai";
import { Schema } from "effect";

import { Logger } from "./logger.js";
import { ApiError } from "./validation.js";

export const GenerationOptions = Schema.Struct({
	model: Schema.optional(Schema.String),
	temperature: Schema.optional(Schema.Number),
	topK: Schema.optional(Schema.Number),
	topP: Schema.optional(Schema.Number),
});
export type GenerationOptions = Schema.Schema.Type<typeof GenerationOptions>;

export class GeminiService {
	private readonly genAI: GoogleGenAI;
	private readonly logger: Logger;

	constructor(apiKey: string) {
		this.genAI = new GoogleGenAI({ apiKey });
		this.logger = new Logger("GeminiService");
	}

	private cachedModels: string[] | null = null;

	private async fetchAvailableModels(): Promise<string[]> {
		if (this.cachedModels) {
			return this.cachedModels;
		}

		try {
			const modelsPager = await this.genAI.models.list();
			const allModels: Model[] = [];
			for await (const model of modelsPager) {
				allModels.push(model);
			}

			const names = allModels
				.filter(
					(m) => m.name && m.supportedActions?.includes("generateContent"),
				)
				.map((m) => (m.name ?? "").replace("models/", ""));

			this.cachedModels = names;
			return names;
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.warn(
				`Failed to fetch models list, falling back to hardcoded defaults`,
				{ error: errorMsg },
			);
			return [];
		}
	}

	private parseModelVersion(name: string): number {
		const match = /(\d+)\.(\d+)/.exec(name);
		if (!match) {
			return 0;
		}
		return Number(match[1]) * 1000 + Number(match[2]);
	}

	private async getModelFallbackChain(preferred?: string): Promise<string[]> {
		const available = await this.fetchAvailableModels();

		const tierOf = (name: string) => {
			if (name.includes("flash-lite")) {
				return 0;
			}
			if (name.includes("flash")) {
				return 1;
			}
			if (name.includes("pro")) {
				return 2;
			}
			return 3;
		};

		const ranked = available
			.filter(
				(m) =>
					!m.includes("embedding") &&
					!m.includes("aqa") &&
					!m.includes("imagen") &&
					!m.includes("veo") &&
					!m.includes("tts"),
			)
			.sort((a, b) => {
				const tierDiff = tierOf(a) - tierOf(b);
				if (tierDiff !== 0) {
					return tierDiff;
				}
				return this.parseModelVersion(b) - this.parseModelVersion(a);
			});

		if (preferred) {
			return [preferred, ...ranked.filter((m) => m !== preferred)];
		}

		return ranked.length > 0
			? ranked
			: ["gemini-2.0-flash", "gemini-1.5-flash"];
	}

	private isRateLimitError(error: unknown): boolean {
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
	}

	async generateContent(
		prompt: string,
		options: GenerationOptions = {},
	): Promise<string> {
		const models = await this.getModelFallbackChain(options.model);

		for (let i = 0; i < models.length; i++) {
			const modelName = models[i];
			if (!modelName) continue;
			try {
				const result = await this.genAI.models.generateContent({
					contents: [{ parts: [{ text: prompt }], role: "user" }],
					model: modelName,
				});

				const text = result.text;

				if (!text) {
					throw new ApiError(
						"Gemini returned empty content",
						undefined,
						"Gemini API",
					);
				}

				return text;
			} catch (error) {
				const nextModel = models[i + 1];
				if (this.isRateLimitError(error) && nextModel) {
					this.logger.warn(
						`Rate limited on ${modelName}, falling back to ${nextModel}`,
						{ model: modelName, fallback: nextModel },
					);
					continue;
				}
				const message =
					error instanceof Error ? error.message : "Unknown error";
				throw new ApiError(
					`Gemini generation failed (${modelName}): ${message}`,
					undefined,
					"Gemini API",
				);
			}
		}

		this.logger.warn("All Gemini models exhausted", {
			modelsAttempted: models.join(", "),
		});
		throw new ApiError("All Gemini models exhausted", undefined, "Gemini API");
	}
}
