--!strict
-- Раскрытие существа на площадке: вспышка и искры цвета редкости, звук, существо «выпрыгивает»
-- (масштаб 0.2 → 1.15 → 1 за 0.35 с). Масштаб меняется только у этого клиента, сервер не трогаем.

local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Creatures = require(Shared:WaitForChild("Catalog"):WaitForChild("Creatures") :: ModuleScript) :: any

local FxUtil = require(script.Parent:WaitForChild("FxUtil") :: ModuleScript) :: any
local CameraFx = require(script.Parent:WaitForChild("CameraFx") :: ModuleScript) :: any

local Reveal = {}

local function findModel(position: Vector3, creatureId: string): Model?
	local runtime = workspace:FindFirstChild("Runtime")
	local bases = runtime and runtime:FindFirstChild("Bases")
	if not bases then
		return nil
	end
	for _, d in bases:GetDescendants() do
		if d:IsA("Model") and d:GetAttribute("CreatureId") == creatureId and (d:GetPivot().Position - position).Magnitude < 12 then
			return d
		end
	end
	return nil
end

local function pop(model: Model)
	local base = model:GetScale()
	local t0 = os.clock()
	local conn: RBXScriptConnection
	conn = RunService.RenderStepped:Connect(function()
		local t = (os.clock() - t0) / 0.35
		if not model.Parent then
			conn:Disconnect()
			return
		end
		local k
		if t >= 1 then
			k = 1
		elseif t < 0.6 then
			k = 0.2 + (1.15 - 0.2) * (t / 0.6)
		else
			k = 1.15 - 0.15 * ((t - 0.6) / 0.4)
		end
		model:ScaleTo(base * k)
		if t >= 1 then
			conn:Disconnect()
		end
	end)
	model:ScaleTo(base * 0.2)
end

local function sparks(position: Vector3, color: Color3)
	local holder = FxUtil.part({ Transparency = 1, Size = Vector3.one, CFrame = CFrame.new(position + Vector3.new(0, 2, 0)) })
	local e = Instance.new("ParticleEmitter")
	e.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	e.Color = ColorSequence.new(color, Color3.new(1, 1, 1))
	e.LightEmission = 1
	e.Size = NumberSequence.new(1.2, 0)
	e.Lifetime = NumberRange.new(0.5, 1)
	e.Speed = NumberRange.new(12, 24)
	e.SpreadAngle = Vector2.new(180, 180)
	e.Rate = 0
	e.Parent = holder
	e:Emit(45)
	Debris:AddItem(holder, 1.2)
end

function Reveal.play(position: Vector3, creatureId: string, _mutation: string?, action: string?)
	local def = Creatures.byId(creatureId)
	local color = FxUtil.rarityColor(if def then def.rarity else "Common")
	local ball = FxUtil.part({ Shape = Enum.PartType.Ball, Material = Enum.Material.Neon, Color = Color3.new(1, 1, 1), Transparency = 0.1, Size = Vector3.one * 2, CFrame = CFrame.new(position + Vector3.new(0, 2, 0)) })
	FxUtil.tween(ball, 0.35, { Size = Vector3.one * 12, Transparency = 1, Color = color })
	Debris:AddItem(ball, 0.4)
	local hit = FxUtil.findGround(position)
	if hit then
		local ring = FxUtil.part({ Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon, Color = color, Transparency = 0.1, Size = Vector3.new(0.12, 2, 2), CFrame = FxUtil.surfaceFrame(hit.Position, hit.Normal) * CFrame.new(0.1, 0, 0) })
		FxUtil.tween(ring, 0.5, { Size = Vector3.new(0.12, 18, 18), Transparency = 1 })
		Debris:AddItem(ring, 0.55)
	end
	sparks(position, color)
	FxUtil.soundAt(Config.Fx.Sounds.Reveal, position)
	if FxUtil.closeness(position, 40) > 0.2 then
		CameraFx.flash(0.2, 0.3, color)
	end
	if action == "sell" then
		return
	end
	task.spawn(function()
		local model: Model? = nil
		local t0 = os.clock()
		while not model and os.clock() - t0 < 1.5 do
			model = findModel(position, creatureId)
			if not model then
				task.wait(0.05)
			end
		end
		if model then
			pop(model)
		end
	end)
end

return Reveal
