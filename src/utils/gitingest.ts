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
	token?: string,
	maxFileSize: string = "1118",
): Promise<Schema.Schema.Type<typeof GitIngestResponse>> {
	// Privacy: do NOT forward the GitHub token to the third-party gitingest.com
	// service by default. gitingest only needs a token for PRIVATE repos; sending
	// it unconditionally leaked a (possibly write-scoped) PAT to a third party on
	// every call. Public repos — the common case — need no token. To ingest a
	// private repo via gitingest you must explicitly opt in with
	// GITINGEST_SHARE_TOKEN=1 (and accept that your token + private source leave
	// your machine); otherwise prefer the local content path (localFileContent).
	const shareToken = process.env.GITINGEST_SHARE_TOKEN === "1";
	const body = {
		input_text: repoUrl,
		max_file_size: maxFileSize,
		pattern: "",
		pattern_type: "exclude",
		...(shareToken && token ? { token } : {}),
	};
	return Effect.runPromise(
		Effect.provide(
			post(GITINGEST_API, body, { schema: GitIngestResponse }),
			FetchHttpClient.layer,
		),
	);
}
