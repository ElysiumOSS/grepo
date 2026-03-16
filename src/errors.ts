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

import { Data } from "effect";

export class GrepoValidationError extends Data.TaggedError(
	"GrepoValidationError",
)<{
	readonly message: string;
	readonly field?: string;
}> {}

export class GeminiError extends Data.TaggedError("GeminiError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class GitHubError extends Data.TaggedError("GitHubError")<{
	readonly message: string;
	readonly statusCode?: number;
	readonly endpoint?: string;
}> {}

export class GitIngestError extends Data.TaggedError("GitIngestError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export type GrepoError =
	| GeminiError
	| GitHubError
	| GitIngestError
	| GrepoValidationError;
