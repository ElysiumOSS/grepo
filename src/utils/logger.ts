import {
	Effect,
	Logger as EffectLogger,
	LogLevel as EffectLogLevel,
	Schema,
} from "effect";

export enum LogLevel {
	NONE = 0,
	ERROR = 1,
	WARN = 2,
	INFO = 3,
	DEBUG = 4,
	TRACE = 5,
	ALL = 6,
}

export type ColorKey =
	| "blue"
	| "bold"
	| "cyan"
	| "gray"
	| "green"
	| "magenta"
	| "red"
	| "reset"
	| "white"
	| "yellow";

export const LogDataSchema = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type LogData = Schema.Schema.Type<typeof LogDataSchema>;

export const LoggerOptionsSchema = Schema.Struct({
	colorize: Schema.optional(Schema.Boolean),
	filePath: Schema.optional(Schema.String),
	includeTimestamp: Schema.optional(Schema.Boolean),
	logToFile: Schema.optional(Schema.Boolean),
	minLevel: Schema.optional(
		Schema.Literal(
			LogLevel.NONE,
			LogLevel.ERROR,
			LogLevel.WARN,
			LogLevel.INFO,
			LogLevel.DEBUG,
			LogLevel.TRACE,
			LogLevel.ALL,
		),
	),
});
export type LoggerOptions = Schema.Schema.Type<typeof LoggerOptionsSchema>;

export class Logger {
	private readonly context: string;
	private minLevel: LogLevel;
	private static readonly instances: Map<string, Logger> = new Map();

	constructor(context: string, options: LoggerOptions = {}) {
		this.context = context;
		this.minLevel =
			options.minLevel ??
			(process.env.NODE_ENV === "production" ? LogLevel.ERROR : LogLevel.ALL);
	}

	public static getLogger(context: string, options?: LoggerOptions): Logger {
		let instance = Logger.instances.get(context);
		if (!instance) {
			instance = new Logger(context, options);
			Logger.instances.set(context, instance);
		}
		return instance;
	}

	public static setGlobalLogLevel(level: LogLevel): void {
		Logger.instances.forEach((logger) => {
			logger.minLevel = level;
		});
	}

	private getEffectLogLevel(level: LogLevel): EffectLogLevel.LogLevel {
		switch (level) {
			case LogLevel.NONE:
				return EffectLogLevel.None;
			case LogLevel.ERROR:
				return EffectLogLevel.Error;
			case LogLevel.WARN:
				return EffectLogLevel.Warning;
			case LogLevel.INFO:
				return EffectLogLevel.Info;
			case LogLevel.DEBUG:
				return EffectLogLevel.Debug;
			case LogLevel.TRACE:
				return EffectLogLevel.Debug;
			case LogLevel.ALL:
				return EffectLogLevel.All;
			default:
				return EffectLogLevel.Info;
		}
	}

	private run(effect: Effect.Effect<void>) {
		const minEffectLevel = this.getEffectLogLevel(this.minLevel);
		const program = effect.pipe(
			Effect.annotateLogs({ context: this.context }),
			EffectLogger.withMinimumLogLevel(minEffectLevel),
		);

		try {
			Effect.runSync(Effect.scoped(program));
		} catch (error) {
			console.error("Logger failed:", error);
		}
	}

	info(message: string, data?: LogData): void {
		if (this.minLevel < LogLevel.INFO) {
			return;
		}
		this.run(Effect.logInfo(message).pipe(Effect.annotateLogs(data ?? {})));
	}

	error(message: string, error?: unknown, data?: LogData): void {
		if (this.minLevel < LogLevel.ERROR) {
			return;
		}
		let errorObj: unknown = error;
		if (error instanceof Error) {
			errorObj = {
				message: error.message,
				name: error.name,
				stack: error.stack,
			};
		}
		this.run(
			Effect.logError(message).pipe(
				Effect.annotateLogs({ ...data, error: errorObj }),
			),
		);
	}

	warn(message: string, data?: LogData): void {
		if (this.minLevel < LogLevel.WARN) {
			return;
		}
		this.run(Effect.logWarning(message).pipe(Effect.annotateLogs(data ?? {})));
	}

	debug(message: string, data?: LogData): void {
		if (this.minLevel < LogLevel.DEBUG) {
			return;
		}
		this.run(Effect.logDebug(message).pipe(Effect.annotateLogs(data ?? {})));
	}

	trace(message: string, data?: LogData): void {
		if (this.minLevel < LogLevel.TRACE) {
			return;
		}
		this.run(
			Effect.logDebug(message).pipe(
				Effect.annotateLogs({ ...data, level: "TRACE" }),
			),
		);
	}

	action(message: string, data?: LogData): void {
		if (this.minLevel < LogLevel.INFO) {
			return;
		}
		this.run(
			Effect.logInfo(message).pipe(
				Effect.annotateLogs({ ...data, type: "ACTION" }),
			),
		);
	}

	success(message: string, data?: LogData): void {
		if (this.minLevel < LogLevel.INFO) {
			return;
		}
		this.run(
			Effect.logInfo(message).pipe(
				Effect.annotateLogs({ ...data, type: "SUCCESS" }),
			),
		);
	}

	group(label: string): void {
		if (this.minLevel < LogLevel.INFO) {
			return;
		}
		console.group(label);
	}

	groupEnd(): void {
		if (this.minLevel < LogLevel.INFO) {
			return;
		}
		console.groupEnd();
	}

	async time<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
		if (this.minLevel < LogLevel.DEBUG) {
			return fn();
		}
		const startTime = performance.now();
		try {
			const result = await fn();
			const endTime = performance.now();
			const duration = (endTime - startTime).toFixed(2);
			this.info(`${label} completed`, { duration: `${duration}ms` });
			return result;
		} catch (error) {
			const endTime = performance.now();
			const duration = (endTime - startTime).toFixed(2);
			this.error(`${label} failed`, error, { duration: `${duration}ms` });
			throw error;
		}
	}
}
