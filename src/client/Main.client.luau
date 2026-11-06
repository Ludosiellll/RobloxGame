--!strict
-- Точка входа клиента: запускает контроллеры. Ошибка одного не останавливает остальные.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config") :: ModuleScript) :: any

local Controllers = script.Parent:WaitForChild("Controllers")

local function start(name: string)
	local ok, err = pcall(function()
		local controller = require(Controllers:WaitForChild(name) :: ModuleScript) :: any
		controller.start()
	end)
	if not ok then
		warn(`[Client] {name} failed to start: {err}`)
	end
end

start("Hud")
start("Menus")
start("Gates")
start("Geysers")
start("AnimationPlayer")
start("Input")
start("CharacterAnims")
start("Effects")
start("Profile")
start("PetFollow")
start("Treadmills")
start("DebugPanel")

print(`[Client] Meteor Rain {Config.Version} started`)
