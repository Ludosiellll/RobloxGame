// Компилирует (без запуска) все .luau в src/ и tests/ — ловит синтаксические ошибки
// в коде, который работает только в Roblox и не покрыт тестами.
// Использование (из корня репозитория): node tools/luau-test/check-syntax.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LuauState } from "luau-web";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (name.endsWith(".luau")) out.push(full);
	}
	return out;
}

const state = await LuauState.createAsync({});
let bad = 0;
const files = [...walk(join(root, "src")), ...walk(join(root, "tests"))];
for (const file of files) {
	const rel = relative(root, file);
	const result = state.loadstring(readFileSync(file, "utf8"), "=" + rel, false);
	if (typeof result === "string") {
		bad += 1;
		console.log("SYNTAX " + result);
	}
}
console.log(`Syntax: ${files.length - bad} ok, ${bad} with errors`);
process.exit(bad > 0 ? 1 : 0);
