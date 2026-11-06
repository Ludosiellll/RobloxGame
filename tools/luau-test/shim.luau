--!nonstrict
-- Виртуальное дерево Roblox поверх файлов репозитория, чтобы модули игры
-- запускались в Node без изменений: game:GetService, script.Parent, require.
-- Функции readFile, listDir, compile, hostprint и setresult даёт run.mjs
-- (loadstring в luau-web отключён, поэтому код компилирует хост).

local MAPPING = {
	{ service = "ReplicatedStorage", child = "Shared", path = "src/shared" },
	{ service = "ServerScriptService", child = "Tests", path = "tests" },
}

local Node = {}
local NodeMethods = {}

local function newNode(name: string, className: string, parent, path: string?)
	local node = setmetatable({
		Name = name,
		ClassName = className,
		Parent = parent,
		__path = path,
		__children = {},
		__order = {},
	}, Node)
	if parent then
		parent.__children[name] = node
		table.insert(parent.__order, node)
	end
	return node
end

Node.__index = function(self, key)
	local method = NodeMethods[key]
	if method then
		return method
	end
	local child = rawget(self, "__children")[key]
	if child then
		return child
	end
	error(tostring(key) .. " is not a valid member of " .. rawget(self, "Name"), 2)
end

Node.__tostring = function(self)
	return rawget(self, "Name")
end

function NodeMethods.FindFirstChild(self, name)
	return rawget(self, "__children")[name]
end

function NodeMethods.WaitForChild(self, name)
	local child = rawget(self, "__children")[name]
	if not child then
		error("Infinite yield: " .. tostring(name) .. " is missing in " .. rawget(self, "Name"), 2)
	end
	return child
end

function NodeMethods.GetChildren(self)
	return table.clone(rawget(self, "__order"))
end

function NodeMethods.IsA(self, className)
	return rawget(self, "ClassName") == className
end

function NodeMethods.GetFullName(self)
	local parts = {}
	local n = self
	while n do
		table.insert(parts, 1, rawget(n, "Name"))
		n = rawget(n, "Parent")
	end
	return table.concat(parts, ".")
end

local function split(s: string): { string }
	local out = {}
	for line in string.gmatch(s, "[^\n]+") do
		table.insert(out, line)
	end
	return out
end

-- Строит детей узла из папки на диске по правилам Rojo:
-- папка → Folder (или ModuleScript, если внутри init.luau), X.luau → ModuleScript X,
-- X.server.luau / X.client.luau → Script / LocalScript (не загружаются в тестах).
local function populate(node, dir: string)
	for _, entry in split(listDir(dir)) do
		local isDir = string.sub(entry, -1) == "/"
		local name = if isDir then string.sub(entry, 1, -2) else entry
		local full = dir .. "/" .. name
		if isDir then
			local hasInit = false
			for _, inner in split(listDir(full)) do
				if inner == "init.luau" then
					hasInit = true
				end
			end
			local child = newNode(name, if hasInit then "ModuleScript" else "Folder", node, if hasInit then full .. "/init.luau" else nil)
			populate(child, full)
		elseif name ~= "init.luau" and string.sub(name, -5) == ".luau" then
			local base = string.sub(name, 1, -6)
			if string.sub(base, -7) == ".server" then
				newNode(string.sub(base, 1, -8), "Script", node, full)
			elseif string.sub(base, -7) == ".client" then
				newNode(string.sub(base, 1, -8), "LocalScript", node, full)
			else
				newNode(base, "ModuleScript", node, full)
			end
		end
	end
end

local game = newNode("Game", "DataModel", nil, nil)
for _, m in MAPPING do
	local service = rawget(game, "__children")[m.service] or newNode(m.service, m.service, game, nil)
	local folder = newNode(m.child, "Folder", service, nil)
	populate(folder, m.path)
end

function NodeMethods.GetService(self, name)
	local service = rawget(self, "__children")[name]
	if not service then
		service = newNode(name, name, self, nil)
	end
	return service
end

local cache = {}
local loading = {}
local requireModule

requireModule = function(node)
	if type(node) ~= "table" or rawget(node, "ClassName") ~= "ModuleScript" then
		error("require expects a ModuleScript, got " .. tostring(node), 2)
	end
	if cache[node] ~= nil then
		return cache[node]
	end
	if loading[node] then
		error("Cyclic require of " .. node:GetFullName(), 2)
	end
	loading[node] = true
	local path = rawget(node, "__path")
	local ok, fn = pcall(compile, readFile(path), "=" .. path)
	if not ok then
		error("Compile error in " .. path .. ": " .. tostring(fn), 2)
	end
	local env = setmetatable({ script = node, require = requireModule, game = game }, { __index = getfenv(1) })
	setfenv(fn, env)
	local result = fn()
	loading[node] = nil
	cache[node] = result
	return result
end

-- Запуск всех *.spec из ServerScriptService.Tests.
local tests = game:GetService("ServerScriptService").Tests
local TestKit = requireModule(tests.TestKit)
local specs = {}
for _, child in tests:GetChildren() do
	local name = rawget(child, "Name")
	if rawget(child, "ClassName") == "ModuleScript" and string.sub(name, -5) == ".spec" then
		table.insert(specs, child)
	end
end
table.sort(specs, function(a, b)
	return rawget(a, "Name") < rawget(b, "Name")
end)

local totalPassed, totalFailed = 0, 0
for _, spec in specs do
	local specName = string.sub(rawget(spec, "Name"), 1, -6)
	local t = TestKit.new()
	local ok, err = pcall(function()
		requireModule(spec)(t)
	end)
	if not ok then
		totalFailed += 1
		hostprint("FAIL " .. specName .. " › (loading): " .. tostring(err))
	end
	for _, r in t.results() do
		if r.ok then
			totalPassed += 1
			hostprint("PASS " .. specName .. " › " .. r.name)
		else
			totalFailed += 1
			hostprint("FAIL " .. specName .. " › " .. r.name .. ": " .. tostring(r.err))
		end
	end
end
hostprint(string.format("Tests: %d passed, %d failed", totalPassed, totalFailed))
setresult(totalFailed)
