--!strict
-- Точка входа сервера: запускает сервисы по порядку. Ошибка одного сервиса пишется в Output
-- и не останавливает остальные.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Services = script.Parent:WaitForChild("Services")

local function start(name: string)
	local ok, err = pcall(function()
		local service = require(Services:WaitForChild(name) :: ModuleScript) :: any
		service.start()
	end)
	if not ok then
		warn(`[Main] {name} failed to start: {err}`)
	end
end

Remotes.init()
start("AssetCheck")
start("PlayerData")
start("DebugService")

print(`[Server] Meteor Rain {Config.Version} started`)
