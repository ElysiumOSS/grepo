declare global {
	namespace NodeJS {
		interface ProcessEnv {
			GEMINI_API_KEY?: string;
			GH_TOKEN?: string;
			GITHUB_TOKEN?: string;
			GOOGLE_API_KEY?: string;
		}
	}
}
export {};
