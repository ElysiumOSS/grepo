import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import { Effect, Schema } from "effect";

import { post } from "./fetcher.js";

const GITINGEST_API = "https://gitingest.com/api/ingest" as const;

export const GitIngestResponse = Schema.Struct({
	content: Schema.String,
	default_max_file_size: Schema.Number,
	digest_url: Schema.String,
	pattern: Schema.String,
	pattern_type: Schema.String,
	repo_url: Schema.String,
	short_repo_url: Schema.String,
	summary: Schema.String,
	tree: Schema.String,
});

export async function fetchRepositoryContent(
	repoUrl: string,
	maxFileSize: string = "1118",
): Promise<Schema.Schema.Type<typeof GitIngestResponse>> {
	return Effect.runPromise(
		Effect.provide(
			post(
				GITINGEST_API,
				{
					input_text: repoUrl,
					max_file_size: maxFileSize,
					pattern: "",
					pattern_type: "exclude",
					token: "",
				},
				{ schema: GitIngestResponse },
			),
			FetchHttpClient.layer,
		),
	);
}
