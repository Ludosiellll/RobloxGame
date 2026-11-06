--!strict
-- Толчок. Клиент шлёт Push без аргументов, всё остальное решает сервер по своим позициям:
-- ближайшая цель в конусе перед толкающим, кулдаун, на базах толкать нельзя.
-- Цель с метеоритом роняет его и оглушена, без метеорита — только отлетает.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Services = script.Parent
local PlayerData = require(Services:WaitForChild("PlayerData") :: ModuleScript) :: any
local BaseService = require(Services:WaitForChild("BaseService") :: ModuleScript) :: any
local CarryService = require(Services:WaitForChild("CarryService") :: ModuleScript) :: any

local PushService = {}

local readyAt: { [Player]: number } = {}

local function rootOf(player: Player): (BasePart?, Humanoid?)
	local character = player.Character
	if not character then
		return nil, nil
	end
	return character:FindFirstChild("HumanoidRootPart") :: BasePart?, character:FindFirstChildOfClass("Humanoid")
end

local function onPush(pusher: Player)
	local now = os.clock()
	local root, humanoid = rootOf(pusher)
	if not root or not humanoid or humanoid.Health <= 0 or CarryService.isStunned(pusher) then
		return
	end
	local cooldownLeft = math.max(0, (readyAt[pusher] or 0) - now)
	if cooldownLeft > 0 then
		return
	end
	local look = root.CFrame.LookVector
	local best: Player? = nil
	local bestDist = math.huge
	for _, other in Players:GetPlayers() do
		if other ~= pusher then
			local r, h = rootOf(other)
			if r and h and h.Health > 0 then
				local dx, dz = r.Position.X - root.Position.X, r.Position.Z - root.Position.Z
				local safe = BaseService.isInSafeZone(r.Position)
				if Formulas.pushAllowed(dx, dz, look.X, look.Z, 0, safe) then
					local d = math.sqrt(dx * dx + dz * dz)
					if d < bestDist then
						best, bestDist = other, d
					end
				end
			end
		end
	end
	readyAt[pusher] = now + Config.Push.Cooldown
	Remotes.get("Push"):FireAllClients(pusher, best)
	if not best then
		return
	end
	local target = best :: Player
	local tRoot = rootOf(target) :: BasePart
	local flat = Vector3.new(tRoot.Position.X - root.Position.X, 0, tRoot.Position.Z - root.Position.Z)
	local dir = if flat.Magnitude > 1e-3 then flat.Unit else Vector3.new(look.X, 0, look.Z).Unit
	PlayerData.update(pusher, function(save)
		save.stats.pushes += 1
	end)
	if CarryService.carrying(target) then
		CarryService.forceDrop(target, "push")
		CarryService.stun(target, Config.Push.StunTime)
	end
	Remotes.get("Knockback"):FireClient(target, dir + Vector3.new(0, 0.35, 0))
end

function PushService.start()
	Remotes.get("Push").OnServerEvent:Connect(onPush)
	Players.PlayerRemoving:Connect(function(player)
		readyAt[player] = nil
	end)
end

return PushService
