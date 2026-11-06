// Запуск Luau-тестов игры в Node через luau-web.
// Использование (из корня репозитория): node tools/luau-test/run.mjs
// Перед первым запуском: npm install --prefix tools/luau-test
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LuauState } from "luau-web";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

let failures = null;
let state;
state = await LuauState.createAsync({
	// Компилирует исходник в функцию этого же состояния Luau.
	compile: (source, chunkname) => state.loadstring(source, chunkname, true),
	// Пути относительно корня репозитория.
	readFile: (path) => readFileSync(join(root, path), "utf8"),
	// Имена через перевод строки; папки с завершающим "/".
	listDir: (path) =>
		readdirSync(join(root, path))
			.filter((name) => !name.startsWith("."))
			.map((name) => (statSync(join(root, path, name)).isDirectory() ? name + "/" : name))
			.join("\n"),
	hostprint: (...args) => console.log(args.join(" ")),
	setresult: (n) => {
		failures = Number(n);
	},
});

const shim = readFileSync(join(here, "shim.luau"), "utf8");
const main = state.loadstring(shim, "=shim.luau", true);
try {
	await main();
} catch (err) {
	console.error("Runner error:", err?.message ?? err);
	process.exit(2);
}
if (failures === null) {
	console.error("Runner error: tests did not finish");
	process.exit(2);
}
process.exit(failures > 0 ? 1 : 0);
