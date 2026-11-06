--!strict
-- Сборка существа из пака: чистая копия модели нужного роста, мутация видна по материалу,
-- метки для клиента (тег Creature, атрибуты CreatureId, Mutation, Rarity, AnimScale).
-- Модели нет в паке — серый куб с именем, игра не падает.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Creatures = require(Shared:WaitForChild("Catalog"):WaitForChild("Creatures") :: ModuleScript) :: any

local Services = script.Parent
local AssetCheck = require(Services:WaitForChild("AssetCheck") :: ModuleScript) :: any
local AnimLibrary = require(Services:WaitForChild("AnimLibrary") :: ModuleScript) :: any
local DebugService = require(Services:WaitForChild("DebugService") :: ModuleScript) :: any
local MapService = require(Services:WaitForChild("MapService") :: ModuleScript) :: any

local CreatureFactory = {}

local STRIP = { InitialPoses = true, AnimSaves = true, AnimationController = true }

local function color(rgb: { number }): Color3
	return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
end

local function placeholder(creatureId: string): Model
	local model = Instance.new("Model")
	model.Name = creatureId
	local part = Instance.new("Part")
	part.Name = "Body"
	part.Size = Vector3.new(4, 4, 4)
	part.Color = Color3.fromRGB(120, 120, 120)
	part.Parent = model
	model.PrimaryPart = part
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(160, 40)
	gui.StudsOffset = Vector3.new(0, 3.5, 0)
	gui.AlwaysOnTop = true
	gui.Parent = part
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = creatureId
	label.TextScaled = true
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Parent = gui
	return model
end

local function lavaFire(part: BasePart, size: number)
	local fx = Instance.new("ParticleEmitter")
	fx.Name = "LavaFire"
	fx.Texture = "rbxasset://textures/particles/fire_main.dds"
	fx.Color = ColorSequence.new(Color3.fromRGB(255, 170, 40), Color3.fromRGB(255, 40, 10))
	fx.LightEmission = 1
	fx.Size = NumberSequence.new(size * 0.25, 0)
	fx.Transparency = NumberSequence.new(0.2, 1)
	fx.Lifetime = NumberRange.new(0.5, 0.9)
	fx.Speed = NumberRange.new(2, 4)
	fx.SpreadAngle = Vector2.new(25, 25)
	fx.Rate = 18
	fx.Parent = part
end

local function applyMutation(model: Model, mutation: string)
	local def = Rarity.mutation(mutation)
	if not def then
		return
	end
	local tint = color(def.color)
	for _, d in model:GetDescendants() do
		if d:IsA("SurfaceAppearance") then
			d:Destroy()
		end
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			if d:IsA("MeshPart") then
				d.TextureID = ""
			end
			d.Color = tint
			if mutation == "Golden" then
				d.Material = Enum.Material.Foil
			elseif mutation == "Diamond" then
				d.Material = Enum.Material.Glass
				d.Transparency = 0.15
			elseif mutation == "Lava" then
				d.Material = Enum.Material.Neon
			elseif mutation == "Galaxy" then
				d.Material = Enum.Material.ForceField
			elseif mutation == "Rainbow" then
				d.Material = Enum.Material.SmoothPlastic
			end
		end
	end
	if mutation == "Lava" and model.PrimaryPart then
		lavaFire(model.PrimaryPart, Config.Base.CreatureHeight)
	end
	if mutation == "Rainbow" then
		model:SetAttribute("Rainbow", true)
	end
	-- золотое сияние из пака VFX (ReplicatedStorage.VFX.GoldenAtmosphere) вокруг Golden
	local vfx = ReplicatedStorage:FindFirstChild("VFX")
	local golden = vfx and vfx:FindFirstChild("GoldenAtmosphere")
	if mutation == "Golden" and golden and model.PrimaryPart then
		for _, e in golden:GetDescendants() do
			if e:IsA("ParticleEmitter") then
				local c = e:Clone()
				c.Rate = math.min(c.Rate, 6)
				c.Enabled = true
				c.Parent = model.PrimaryPart
			end
		end
	end
end

function CreatureFactory.build(creatureId: string, mutation: string?): Model
	local def = Creatures.byId(creatureId)
	local src = AssetCheck.brainrot(creatureId)
	local model: Model
	if src then
		model = src:Clone()
		for _, child in model:GetChildren() do
			if STRIP[child.Name] then
				child:Destroy()
			end
		end
	else
		model = placeholder(creatureId)
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = true
			d.CanCollide = false
			d.CanTouch = false
		end
	end
	if not model.PrimaryPart then
		model.PrimaryPart = model:FindFirstChildWhichIsA("BasePart", true) :: BasePart?
	end
	local height = model:GetExtentsSize().Y
	local k = if height > 0 then Config.Base.CreatureHeight / height else 1
	if src and math.abs(k - 1) > 1e-3 then
		model:ScaleTo(model:GetScale() * k)
	end
	model:SetAttribute("AnimScale", if src then k else 1)
	model:SetAttribute("CreatureId", creatureId)
	model:SetAttribute("Rarity", if def then def.rarity else "Common")
	if mutation and Rarity.mutation(mutation) then
		model:SetAttribute("Mutation", mutation)
		applyMutation(model, mutation)
	end
	if src then
		AnimLibrary.ensure(creatureId)
	end
	-- модель приходит к клиенту целиком: иначе кости могут догрузиться позже или смениться при стриминге
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	CollectionService:AddTag(model, "Creature")
	return model
end

-- Ставит модель так, чтобы её низ касался точки cf, с поворотом cf.
function CreatureFactory.placeOn(model: Model, cf: CFrame)
	model:PivotTo(cf)
	local box, size = model:GetBoundingBox()
	local lift = cf.Position.Y - (box.Position.Y - size.Y / 2)
	model:PivotTo(cf + Vector3.new(0, lift, 0))
end

local function registerZoo()
	DebugService.register("zoo", "[mutation | clear]", function(_player, args)
		local runtime = workspace:FindFirstChild("Runtime") or workspace
		local old = runtime:FindFirstChild("Zoo")
		if old then
			old:Destroy()
		end
		if args[1] == "clear" then
			return "Zoo cleared"
		end
		local mutation = args[1]
		assert(mutation == nil or Rarity.mutation(mutation), "unknown mutation (Golden, Diamond, Lava, Galaxy, Rainbow)")
		local zoo = Instance.new("Folder")
		zoo.Name = "Zoo"
		zoo.Parent = runtime
		local base = MapService.baseFrames()[1]
		local cols, spacing = 8, 14
		local missing = {}
		for i, def in Creatures.List do
			local model = CreatureFactory.build(def.id, mutation)
			if not AssetCheck.brainrot(def.id) then
				table.insert(missing, def.id)
			end
			local col, row = (i - 1) % cols, (i - 1) // cols
			local cf = base * CFrame.new((col - (cols - 1) / 2) * spacing, 0, 40 + row * spacing)
			CreatureFactory.placeOn(model, cf)
			model.Parent = zoo
		end
		if #missing > 0 then
			warn("[Zoo] no model in pack for: " .. table.concat(missing, ", "))
		end
		return `Zoo: {#Creatures.List} creatures behind base 1, {#missing} missing models`
	end)
end

function CreatureFactory.start()
	registerZoo()
end

return CreatureFactory
