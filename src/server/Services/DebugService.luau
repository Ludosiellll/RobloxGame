--!strict
-- Отладочные команды, только в Studio. Другие сервисы добавляют свои через register().
-- Клиентская панель (DebugPanel) запрашивает список командой "list" и запускает команды по имени.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local DataSchema = require(Shared:WaitForChild("DataSchema") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local PlayerData = require(script.Parent:WaitForChild("PlayerData") :: ModuleScript) :: any

type Command = { hint: string, fn: (Player, { string }) -> string?, order: number }

local DebugService = {}

local registry: { [string]: Command } = {}
local nextOrder = 0

function DebugService.register(name: string, argsHint: string, fn: (Player, { string }) -> string?)
	nextOrder += 1
	registry[name] = { hint = argsHint, fn = fn, order = nextOrder }
end

local afterHooks: { (Player, string) -> () } = {}

-- Вызывается после каждой успешной команды (например, база перерисовывает себя после reset).
function DebugService.after(fn: (Player, string) -> ())
	table.insert(afterHooks, fn)
end

local function number(args: { string }, i: number): number
	local n = tonumber(args[i])
	assert(n, "expected a number")
	return n
end

local function registerBuiltIns()
	DebugService.register("money", "<n>", function(player, args)
		local n = math.max(0, math.floor(number(args, 1)))
		PlayerData.update(player, function(save)
			save.money = n
		end)
		player:SetAttribute("Money", n)
		return "Money = " .. n
	end)

	DebugService.register("rebirths", "<n>", function(player, args)
		local n = math.max(0, math.floor(number(args, 1)))
		PlayerData.update(player, function(save)
			save.rebirths = n
		end)
		player:SetAttribute("Rebirths", n)
		return "Rebirths = " .. n
	end)

	DebugService.register("speed", "<n>", function(player, args)
		local n = math.max(0, math.floor(number(args, 1)))
		PlayerData.update(player, function(save)
			save.speed = n
		end)
		local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.WalkSpeed = Config.BaseWalkSpeed + n
		end
		return "Speed bonus = " .. n
	end)

	DebugService.register("reset", "", function(player, _args)
		PlayerData.update(player, function(save)
			local fresh = DataSchema.default()
			for k, v in fresh do
				if k ~= "lock" then
					save[k] = v
				end
			end
		end)
		player:SetAttribute("Money", 0)
		player:SetAttribute("Rebirths", 0)
		player:LoadCharacter()
		return "Progress reset"
	end)
end

function DebugService.start()
	registerBuiltIns()
	if not RunService:IsStudio() then
		return
	end
	local remote = Remotes.get("Debug")
	local notify = Remotes.get("Notify")
	remote.OnServerEvent:Connect(function(player: Player, msg: any)
		if type(msg) ~= "table" or type(msg.cmd) ~= "string" then
			return
		end
		if msg.cmd == "list" then
			local list = {}
			for name, c in registry do
				table.insert(list, { name = name, hint = c.hint, order = c.order })
			end
			table.sort(list, function(a, b)
				return a.order < b.order
			end)
			remote:FireClient(player, { list = list })
			return
		end
		local command = registry[msg.cmd]
		if not command then
			notify:FireClient(player, "Unknown command " .. msg.cmd)
			return
		end
		local args: { string } = {}
		if type(msg.args) == "table" then
			for i = 1, math.min(#msg.args, 6) do
				if type(msg.args[i]) == "string" then
					table.insert(args, msg.args[i])
				end
			end
		end
		local ok, result = pcall(command.fn, player, args)
		if ok then
			for _, hook in afterHooks do
				local hookOk, hookErr = pcall(hook, player, msg.cmd)
				if not hookOk then
					warn("[Debug] after-hook failed: " .. tostring(hookErr))
				end
			end
		end
		local text = if ok then (result or ("OK: " .. msg.cmd)) else ("Error in " .. msg.cmd .. ": " .. tostring(result))
		print("[Debug] " .. player.Name .. " › " .. msg.cmd .. " " .. table.concat(args, " ") .. " → " .. text)
		notify:FireClient(player, text)
	end)
	print("[Debug] commands ready (Studio only)")
end

return DebugService
