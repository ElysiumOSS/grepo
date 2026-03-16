#!/usr/bin/env bun
// @ts-check
export default (async () =>
	console.log(
		(await import("node:child_process"))
			.execFileSync("bun", ["run", "docs:types"], { stdio: "inherit" })
			.toString(),
	))();
