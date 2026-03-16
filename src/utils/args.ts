import { Schema } from "effect";

const ParsedArgs = Schema.Struct({
	options: Schema.Record({
		key: Schema.String,
		value: Schema.Union(Schema.String, Schema.Boolean),
	}),
	positional: Schema.Array(Schema.String),
});

export type ParsedArgs = Schema.Schema.Type<typeof ParsedArgs>;

export function parseArgs(
	args: string[],
	booleanFlags: string[] = [],
): ParsedArgs {
	const positional: string[] = [];
	const options: Record<string, boolean | string> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;

		if (arg.startsWith("--")) {
			const longArg = arg.slice(2);

			if (longArg.includes("=")) {
				const [key, ...valueParts] = longArg.split("=");
				if (key) {
					options[key] = valueParts.join("=");
				}
				continue;
			}

			const key = longArg;
			const nextArg = args[i + 1];

			if (booleanFlags.includes(key)) {
				options[key] = true;
				continue;
			}

			if (nextArg && !nextArg.startsWith("--")) {
				options[key] = nextArg;
				i++;
			} else {
				options[key] = true;
			}
		} else {
			positional.push(arg);
		}
	}

	return { options, positional };
}

export const SEPARATOR = "=".repeat(80);

export function displayHeader(
	title: string,
	details: Record<string, string>,
): void {
	console.log();
	console.log(SEPARATOR);
	console.log(`  🚀 ${title}`);
	console.log(SEPARATOR);
	for (const [key, value] of Object.entries(details)) {
		console.log(`  • ${key}: ${value}`);
	}
	console.log(SEPARATOR);
	console.log();
}
