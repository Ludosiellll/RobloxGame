--!strict
-- Подключает эффекты к событиям сервера: падение метеорита, раскрытие существа, толчок.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Fx = script.Parent.Parent:WaitForChild("Fx")
local FxUtil = require(Fx:WaitForChild("FxUtil") :: ModuleScript) :: any
local MeteorFall = require(Fx:WaitForChild("MeteorFall") :: ModuleScript) :: any
local Reveal = require(Fx:WaitForChild("Reveal") :: ModuleScript) :: any

local Effects = {}

local function pushFx(pusher: Player, target: Player?)
	local root = pusher.Character and pusher.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return
	end
	local ring = FxUtil.part({ Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon, Color = Color3.fromRGB(180, 220, 255), Transparency = 0.3, Size = Vector3.new(0.2, 2, 2), CFrame = root.CFrame * CFrame.new(0, 0, -2) * CFrame.Angles(0, math.rad(90), 0) })
	FxUtil.tween(ring, 0.3, { Size = Vector3.new(0.1, 9, 9), Transparency = 1 })
	Debris:AddItem(ring, 0.35)
	local tRoot = target and target.Character and target.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if tRoot then
		local flash = FxUtil.part({ Shape = Enum.PartType.Ball, Material = Enum.Material.Neon, Color = Color3.new(1, 1, 1), Size = Vector3.one, CFrame = tRoot.CFrame })
		FxUtil.tween(flash, 0.15, { Size = Vector3.one * 6, Transparency = 1 })
		Debris:AddItem(flash, 0.2)
	end
end

function Effects.start()
	Remotes.get("MeteorIncoming").OnClientEvent:Connect(function(info: any)
		if type(info) == "table" and typeof(info.position) == "Vector3" and type(info.rarity) == "string" then
			MeteorFall.play(info)
		end
	end)
	Remotes.get("CreatureRevealed").OnClientEvent:Connect(function(_owner: Player, position: Vector3, creatureId: string, mutation: string?, action: string?)
		if typeof(position) == "Vector3" and type(creatureId) == "string" then
			Reveal.play(position, creatureId, mutation, action)
		end
	end)
	Remotes.get("Push").OnClientEvent:Connect(function(pusher: Player, target: Player?)
		if typeof(pusher) == "Instance" then
			pushFx(pusher, target)
		end
	end)
end

return Effects
