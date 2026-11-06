--!strict
-- Запускает тесты из ServerScriptService.Tests при Play в Studio.
-- В опубликованной игре ничего не делает.

local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")

if not RunService:IsStudio() then
	return
end

local tests = ServerScriptService:WaitForChild("Tests")
local TestKit = require(tests:WaitForChild("TestKit") :: ModuleScript) :: any

local specs = {}
for _, child in tests:GetChildren() do
	if child:IsA("ModuleScript") and string.sub(child.Name, -5) == ".spec" then
		table.insert(specs, child)
	end
end
table.sort(specs, function(a, b)
	return a.Name < b.Name
end)

local totalPassed, totalFailed = 0, 0
for _, spec in specs do
	local t = TestKit.new()
	local ok, err = pcall(function()
		(require(spec :: ModuleScript) :: any)(t)
	end)
	if not ok then
		totalFailed += 1
		warn(`[Tests] {spec.Name} failed to load: {err}`)
	end
	local passed, failed, errors = t.summary()
	totalPassed += passed
	totalFailed += failed
	for _, e in errors do
		warn(`[Tests] {string.sub(spec.Name, 1, -6)} › {e}`)
	end
end

print(`[Tests] {totalPassed} passed, {totalFailed} failed`)
