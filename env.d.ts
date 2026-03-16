declare global {
	namespace NodeJS {
		interface ProcessEnv {
			GEMINI_API_KEY: string;
		}
	}
}
export {};
