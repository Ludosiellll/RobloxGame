--!strict
-- Модель питомца или яйца из пака KNOCK OUT (ReplicatedStorage.Packs.Pets): чистая копия без
-- скриптов и Humanoid, неподвижная, без столкновений, нужного роста. Нет пака — шарик с именем.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any

local PetModel = {}

local warned = false

local function pack(): Instance?
	local packs = ReplicatedStorage:FindFirstChild("Packs")
	local pets = packs and packs:FindFirstChild("Pets")
	if not pets and not warned then
		warned = true
		warn("[Pets] ReplicatedStorage.Packs.Pets not found — copy the KNOCK OUT pack there (docs/ASSET_SETUP.md); using placeholders")
	end
	return pets
end

-- В паке у некоторых имён есть и MeshPart, и Model: берём Model.
local function find(name: string): Instance?
	local folder = pack()
	if not folder then
		return nil
	end
	local fallback: Instance? = nil
	for _, c in folder:GetChildren() do
		if c.Name == name then
			if c:IsA("Model") then
				return c
			end
			fallback = fallback or c
		end
	end
	return fallback
end

local function placeholder(name: string, rarity: string?, height: number): Model
	local info = Rarity.Info[rarity or "Common"] or Rarity.Info.Common
	local model = Instance.new("Model")
	model.Name = name
	local ball = Instance.new("Part")
	ball.Shape = Enum.PartType.Ball
	ball.Size = Vector3.one * height
	ball.Material = Enum.Material.SmoothPlastic
	ball.Color = Color3.fromRGB(info.color[1], info.color[2], info.color[3])
	ball.Anchored = true
	ball.CanCollide = false
	ball.CanQuery = false
	ball.CanTouch = false
	ball.Parent = model
	model.PrimaryPart = ball
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(120, 30)
	gui.StudsOffset = Vector3.new(0, height * 0.8, 0)
	gui.MaxDistance = 60
	gui.Parent = ball
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = name
	label.TextScaled = true
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Parent = gui
	return model
end

function PetModel.build(name: string, rarity: string?, height: number): Model
	local src = find(name)
	local model: Model
	if src and src:IsA("Model") then
		model = src:Clone()
	elseif src and src:IsA("BasePart") then
		model = Instance.new("Model")
		model.Name = name
		src:Clone().Parent = model
	else
		return placeholder(name, rarity, height)
	end
	for _, d in model:GetDescendants() do
		if d:IsA("LuaSourceContainer") or d:IsA("Humanoid") or d:IsA("Highlight") then
			d:Destroy()
		elseif d:IsA("BasePart") then
			d.Anchored = true
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
			d.CastShadow = false
			if d.Name == "HitBox" then
				d.Transparency = 1
			end
		end
	end
	if not model.PrimaryPart then
		model.PrimaryPart = model:FindFirstChildWhichIsA("BasePart", true) :: BasePart?
	end
	local size = model:GetExtentsSize()
	local big = math.max(size.X, size.Y, size.Z)
	if big > 0 then
		model:ScaleTo(model:GetScale() * height / big)
	end
	return model
end

return PetModel
