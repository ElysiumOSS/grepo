import {
	HttpClient,
	HttpClientRequest,
	type HttpClientResponse,
} from "@effect/platform";
import { Duration, Effect, ParseResult, pipe, Schedule, Schema } from "effect";

export interface FetcherOptions<T = unknown> {
	bodyType?: "json" | "text";
	headers?: Record<string, string>;
	onError?: (error: unknown) => void;
	retries?: number;
	retryDelay?: number;
	// biome-ignore lint/suspicious/noExplicitAny: Effect Schema invariance requires `any` for Encoded type
	schema?: Schema.Schema<T, any, never>;
	signal?: AbortSignal;
	timeout?: number;
}

export type HttpMethod =
	| "DELETE"
	| "GET"
	| "HEAD"
	| "OPTIONS"
	| "PATCH"
	| "POST"
	| "PUT";
export type QueryParams = Record<
	string,
	| boolean
	| null
	| number
	| string
	| undefined
	| Array<boolean | number | string>
>;
export type RequestBody =
	| boolean
	| null
	| number
	| string
	| unknown[]
	| Record<string, unknown>;

const EMPTY = "";

const safeStringify = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
};

export class ValidationError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly problems: string,
		public readonly responseData: unknown,
		public readonly attempt?: number,
	) {
		super(message);
		this.name = "ValidationError";
		Object.setPrototypeOf(this, ValidationError.prototype);
	}

	override toString(): string {
		const attemptStr = this.attempt ? `, Attempt: ${this.attempt}` : "";
		return `ValidationError: ${this.message} (URL: ${this.url}${attemptStr})`;
	}

	getProblemsString(): string {
		return this.problems;
	}
}

export class FetcherError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly status?: number,
		public readonly responseData?: unknown,
		public readonly attempt?: number,
	) {
		super(message);
		this.name = "FetcherError";
		Object.setPrototypeOf(this, FetcherError.prototype);
	}

	override toString(): string {
		const statusStr = this.status ? `, Status: ${this.status}` : "";
		const attemptStr = this.attempt ? `, Attempt: ${this.attempt}` : "";
		return `FetcherError: ${this.message} (URL: ${this.url}${statusStr}${attemptStr})`;
	}
}

const buildQueryString = (params?: QueryParams): string => {
	if (!params) {
		return EMPTY;
	}
	const urlParams = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value == null) {
			return;
		}
		if (Array.isArray(value)) {
			value
				.filter((item): item is boolean | number | string => item != null)
				.forEach((item) => {
					urlParams.append(key, String(item));
				});
		} else {
			urlParams.append(key, String(value));
		}
	});
	return urlParams.toString();
};

const buildRequest = (
	method: HttpMethod,
	url: string,
): HttpClientRequest.HttpClientRequest => {
	switch (method) {
		case "GET":
			return HttpClientRequest.get(url);
		case "POST":
			return HttpClientRequest.post(url);
		case "PUT":
			return HttpClientRequest.put(url);
		case "PATCH":
			return HttpClientRequest.patch(url);
		case "DELETE":
			return HttpClientRequest.del(url);
		case "OPTIONS":
			return HttpClientRequest.options(url);
		case "HEAD":
			return HttpClientRequest.head(url);
	}
};

const validateResponse = <T>(
	data: unknown,
	attempt: number,
	url: string,
	// biome-ignore lint/suspicious/noExplicitAny: Effect Schema invariance requires `any` for Encoded type
	schema?: Schema.Schema<T, any, never>,
	onError?: (error: unknown) => void,
): Effect.Effect<T, ValidationError, never> => {
	if (!schema) {
		return Effect.succeed(data as T);
	}
	const result = Schema.decodeUnknownEither(schema)(data);
	if (result._tag === "Left") {
		const problems = ParseResult.TreeFormatter.formatIssueSync(
			result.left.issue,
		);
		const validationError = new ValidationError(
			"Response validation failed",
			url,
			problems,
			data,
			attempt,
		);
		if (onError) {
			onError(validationError);
		}
		return Effect.fail(validationError);
	}
	return Effect.succeed(result.right);
};

const withTimeout = <A, E, R>(
	eff: Effect.Effect<A, E, R>,
	timeout: number,
	url: string,
	attempt: number,
): Effect.Effect<A, E | FetcherError, R> =>
	pipe(
		eff,
		Effect.timeoutFail({
			duration: Duration.millis(timeout),
			onTimeout: () =>
				new FetcherError(
					"Request timed out",
					url,
					undefined,
					undefined,
					attempt,
				),
		}),
	);

const createRetrySchedule = (retries: number, retryDelay: number) =>
	pipe(
		Schedule.exponential(Duration.millis(retryDelay)),
		Schedule.intersect(Schedule.recurs(retries)),
		Schedule.whileInput((error: FetcherError | ValidationError) => {
			if (error instanceof ValidationError) {
				return false;
			}
			if (error instanceof FetcherError && error.status) {
				if (error.status === 429) {
					return true;
				}
				if (error.status >= 400 && error.status < 500) {
					return false;
				}
			}
			return true;
		}),
	);

const parseResponse = (
	response: HttpClientResponse.HttpClientResponse,
	url: string,
	attempt: number,
): Effect.Effect<unknown, FetcherError, never> => {
	if (response.status < 200 || response.status >= 300) {
		return Effect.gen(function* () {
			const errorData = yield* pipe(
				response.json,
				Effect.catchAll(() => Effect.succeed(undefined)),
			);
			const errorText = yield* pipe(
				response.text,
				Effect.catchAll(() => Effect.succeed("Request failed")),
			);
			const errorMessage =
				response.status === 429
					? `Rate limit exceeded (429). Please slow down requests to ${url}`
					: `HTTP ${response.status}: ${errorText}`;
			return yield* Effect.fail(
				new FetcherError(
					errorMessage,
					url,
					response.status,
					errorData,
					attempt,
				),
			);
		});
	}
	return pipe(
		response.json,
		Effect.catchAll((error) =>
			pipe(
				response.text,
				Effect.flatMap((text) => {
					const errorMessage = `Failed to parse JSON response. Status: ${response.status}, Body: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`;
					return Effect.fail(
						new FetcherError(
							errorMessage,
							url,
							response.status,
							{ originalError: error, responseText: text },
							attempt,
						),
					);
				}),
				Effect.catchAll(() =>
					Effect.fail(
						new FetcherError(
							`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
							url,
							response.status,
							undefined,
							attempt,
						),
					),
				),
			),
		),
	);
};

export function fetcher<T = unknown>(
	input: string,
	method: HttpMethod = "GET",
	options: FetcherOptions<T> = {},
	params?: QueryParams,
	body?: RequestBody,
): Effect.Effect<T, FetcherError | ValidationError, HttpClient.HttpClient> {
	const {
		bodyType = "json",
		headers = {},
		onError,
		retries = 0,
		retryDelay = 1_000,
		schema,
		timeout = 10_000,
	} = options;

	const queryString = buildQueryString(params);
	const url = queryString ? `${input}?${queryString}` : input;

	return Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		let attempt = 0;

		let req = buildRequest(method, url);

		if (
			body != null &&
			(method === "POST" || method === "PUT" || method === "PATCH")
		) {
			if (bodyType === "text") {
				const textBody =
					typeof body === "object" && body !== null
						? JSON.stringify(body)
						: String(body);
				req = HttpClientRequest.bodyText(textBody)(req);
			} else {
				req = yield* pipe(
					HttpClientRequest.bodyJson(body)(req),
					Effect.mapError(
						(error) =>
							new FetcherError(
								`Failed to serialize request body: ${safeStringify(error)}`,
								url,
								undefined,
								undefined,
								attempt,
							),
					),
				);
			}
		}

		req = HttpClientRequest.setHeaders(headers)(req);
		const retrySchedule = createRetrySchedule(retries, retryDelay);

		const executeRequest = Effect.gen(function* () {
			attempt++;
			const response = yield* pipe(
				client.execute(req),
				(eff) => withTimeout(eff, timeout, url, attempt),
				Effect.mapError((error) => {
					if (error instanceof FetcherError) {
						return error;
					}
					return new FetcherError(
						error instanceof Error ? error.message : String(error),
						url,
						undefined,
						undefined,
						attempt,
					);
				}),
			);
			const rawData = yield* parseResponse(response, url, attempt);
			const validatedData = yield* validateResponse(
				rawData,
				attempt,
				url,
				schema,
				onError,
			);
			return validatedData;
		});

		return yield* pipe(
			executeRequest,
			Effect.retry(retrySchedule),
			Effect.catchAll((error) => {
				if (error instanceof FetcherError || error instanceof ValidationError) {
					if (onError) {
						onError(error);
					}
					return Effect.fail(error);
				}
				const fetcherError = new FetcherError(
					String(error),
					url,
					undefined,
					undefined,
					attempt,
				);
				if (onError) {
					onError(fetcherError);
				}
				return Effect.fail(fetcherError);
			}),
		);
	});
}

export function get<T = unknown>(
	url: string,
	options?: FetcherOptions<T>,
	params?: QueryParams,
) {
	return fetcher<T>(url, "GET", options, params);
}

export function post<T = unknown>(
	url: string,
	body?: RequestBody,
	options?: FetcherOptions<T>,
	params?: QueryParams,
) {
	return fetcher<T>(url, "POST", options, params, body);
}

export function put<T = unknown>(
	url: string,
	body?: RequestBody,
	options?: FetcherOptions<T>,
	params?: QueryParams,
) {
	return fetcher<T>(url, "PUT", options, params, body);
}

export function patch<T = unknown>(
	url: string,
	body?: RequestBody,
	options?: FetcherOptions<T>,
	params?: QueryParams,
) {
	return fetcher<T>(url, "PATCH", options, params, body);
}

export function del<T = unknown>(
	url: string,
	options?: FetcherOptions<T>,
	params?: QueryParams,
) {
	return fetcher<T>(url, "DELETE", options, params);
}
