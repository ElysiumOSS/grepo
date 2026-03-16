export function isValidGitHubUrl(url: string): url is string {
	try {
		const parsed = new URL(url);
		return (
			(parsed.protocol === "https:" || parsed.protocol === "http:") &&
			parsed.hostname === "github.com" &&
			parsed.pathname.split("/").filter(Boolean).length >= 2
		);
	} catch {
		return false;
	}
}

export function isValidGitHubToken(token: string): boolean {
	return (
		typeof token === "string" &&
		(token.startsWith("ghp_") ||
			token.startsWith("github_pat_") ||
			token.startsWith("gho_") ||
			token.startsWith("ghu_") ||
			token.startsWith("ghs_") ||
			token.startsWith("ghr_"))
	);
}

export function isValidGeminiApiKey(apiKey: string): boolean {
	return typeof apiKey === "string" && apiKey.length >= 20;
}

export function isValidBranchName(branch: string): boolean {
	return /^[a-zA-Z0-9._-]+$/.test(branch) && branch.length <= 255;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } {
	const parsed = new URL(url);
	const parts = parsed.pathname.split("/").filter(Boolean);
	if (parts.length < 2) {
		throw new Error(`Invalid GitHub URL: ${url}`);
	}
	return { owner: parts[0]!, repo: parts[1]! };
}

export class ValidationError extends Error {
	constructor(
		message: string,
		public readonly field?: string,
	) {
		super(message);
		this.name = "ValidationError";
	}
}

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly endpoint?: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}
