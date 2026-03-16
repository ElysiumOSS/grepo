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
