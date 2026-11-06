--!strict
-- Метеориты: падают в зонах, где есть игроки, и в соседних. Порядок жизни:
-- falling (круг на земле, TelegraphTime) → cooling (камень лежит, CoolTime) → ready (можно поднять)
-- → carried (несут) → dropped (выронили) → consume/удаление. Сервер — единственный источник правды.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Layout = require(Shared:WaitForChild("CraterLayout") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any
local Roll = require(Shared:WaitForChild("Roll") :: ModuleScript) :: any
local Zones = require(Shared:WaitForChild("Zones") :: ModuleScript) :: any

local Services = script.Parent
local AssetCheck = require(Services:WaitForChild("AssetCheck") :: ModuleScript) :: any
local DebugService = require(Services:WaitForChild("DebugService") :: ModuleScript) :: any
local MapService = require(Services:WaitForChild("MapService") :: ModuleScript) :: any

local M = Config.Meteor

export type MeteorState = {
	id: string,
	zone: number,
	rarity: string,
	mutation: string?,
	creatureId: string,
	position: Vector3,
	state: "falling" | "cooling" | "ready" | "carried" | "dropped",
	model: Model?,
	carrier: Player?,
	despawnAt: number,
}

local MeteorService = {}

-- Шторм и покупки меняют эти множители.
MeteorService.modifiers = { rateMult = 1, luck = 1 }

local meteors: { [string]: MeteorState } = {}
local nextSpawn: { [number]: number } = {}
local pickupHandlers: { (Player, string) -> () } = {}
local counter = 0
local rng = Random.new()

local SCALE_BY_RARITY = { 1, 1.15, 1.3, 1.5, 1.75, 2 }

local function rngFn(): number
	return rng:NextNumber()
end

local function folder(): Folder
	local runtime = workspace:FindFirstChild("Runtime")
	if not runtime then
		runtime = Instance.new("Folder")
		runtime.Name = "Runtime"
		runtime.Parent = workspace
	end
	local f = (runtime :: Instance):FindFirstChild("Meteors")
	if not f then
		f = Instance.new("Folder")
		f.Name = "Meteors"
		f.Parent = runtime
	end
	return f :: Folder
end

local function rarityColor(rarity: string): Color3
	local c = Rarity.Info[rarity].color
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function label(parent: BasePart, rarity: string, mutation: string?, size: number)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Label"
	gui.Size = UDim2.fromOffset(150, if mutation then 54 else 32)
	gui.StudsOffsetWorldSpace = Vector3.new(0, size * 0.6 + 2.5, 0)
	gui.MaxDistance = 160
	gui.AlwaysOnTop = true
	gui.Parent = parent
	local list = Instance.new("UIListLayout")
	list.HorizontalAlignment = Enum.HorizontalAlignment.Center
	list.Parent = gui
	local function line(text: string, color: Color3)
		local l = Instance.new("TextLabel")
		l.Size = UDim2.fromOffset(150, 28)
		l.BackgroundTransparency = 1
		l.Font = Enum.Font.FredokaOne
		l.TextScaled = true
		l.Text = text
		l.TextColor3 = color
		l.Parent = gui
		local s = Instance.new("UIStroke")
		s.Thickness = 2
		s.Parent = l
	end
	line(string.upper(rarity), rarityColor(rarity))
	if mutation then
		local m = Rarity.mutation(mutation)
		line(mutation, if m then Color3.fromRGB(m.color[1], m.color[2], m.color[3]) else Color3.new(1, 1, 1))
	end
end

local function buildModel(m: MeteorState): Model
	local scale = SCALE_BY_RARITY[Rarity.index(m.rarity)] or 1
	local model = Instance.new("Model")
	model.Name = "Meteor_" .. m.id
	local source = AssetCheck.meteorRock()
	local rock: BasePart
	if source then
		rock = source:Clone()
		rock.Size *= scale
	else
		local ball = Instance.new("Part")
		ball.Shape = Enum.PartType.Ball
		ball.Material = Enum.Material.Basalt
		ball.Color = Color3.fromRGB(60, 52, 48)
		ball.Size = Vector3.one * 4 * scale
		rock = ball
	end
	rock.Name = "Rock"
	rock.Anchored = true
	rock.CanCollide = true
	local size = rock.Size.Y
	rock.CFrame = CFrame.new(m.position + Vector3.new(0, size * 0.35, 0))
	rock.Parent = model
	local color = rarityColor(m.rarity)
	local glow = Instance.new("Part")
	glow.Name = "Glow"
	glow.Shape = Enum.PartType.Ball
	glow.Material = Enum.Material.Neon
	glow.Color = color
	glow.Transparency = 0.55
	glow.Size = Vector3.one * size * 1.08
	glow.CFrame = rock.CFrame
	glow.Anchored = true
	glow.CanCollide = false
	glow.CanQuery = false
	glow.CanTouch = false
	glow.CastShadow = false
	glow.Parent = model
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 10 + 4 * scale
	light.Brightness = 2
	light.Parent = rock
	label(rock, m.rarity, m.mutation, size)
	model.PrimaryPart = rock
	model:SetAttribute("MeteorId", m.id)
	model:SetAttribute("Rarity", m.rarity)
	if m.mutation then
		model:SetAttribute("Mutation", m.mutation)
	end
	CollectionService:AddTag(model, "Meteor")
	model.Parent = folder()
	return model
end

local function addPrompt(m: MeteorState)
	local rock = m.model and m.model.PrimaryPart
	if not rock or rock:FindFirstChild("Pickup") then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "Pickup"
	prompt.ActionText = "Pick up"
	prompt.ObjectText = m.rarity .. (if m.mutation then " " .. m.mutation else "")
	prompt.MaxActivationDistance = M.PickupDistance
	prompt.HoldDuration = 0
	prompt.RequiresLineOfSight = false
	prompt.Parent = rock
	prompt.Triggered:Connect(function(player)
		if meteors[m.id] ~= m or m.state ~= "ready" and m.state ~= "dropped" then
			return
		end
		for _, fn in pickupHandlers do
			task.spawn(fn, player, m.id)
		end
	end)
end

local function removePrompt(m: MeteorState)
	local rock = m.model and m.model.PrimaryPart
	local prompt = rock and rock:FindFirstChild("Pickup")
	if prompt then
		prompt:Destroy()
	end
end

local function remove(id: string)
	local m = meteors[id]
	if not m then
		return
	end
	meteors[id] = nil
	if m.model then
		m.model:Destroy()
	end
	Remotes.get("MeteorRemoved"):FireAllClients(id)
end

local function zoneName(zone: number): string
	local def = Zones.List[zone]
	return if def then def.display else "the crater"
end

function MeteorService.spawn(zoneIndex: number, opts: { rarity: string?, mutation: string?, position: Vector3? }?): string?
	local o = opts or {}
	local position = o.position
	if not position then
		local avoid = {}
		for _, other in meteors do
			if other.zone == zoneIndex then
				table.insert(avoid, other.position)
			end
		end
		position = MapService.findSpawnPoint(zoneIndex, rng, avoid)
	end
	if not position then
		return nil
	end
	-- удача: общий множитель × бонус питомцев ближайшего игрока
	local personal = 1
	local nearest = math.huge
	for _, p in Players:GetPlayers() do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root then
			local d = (root.Position - (position :: Vector3)).Magnitude
			if d < nearest then
				nearest = d
				personal = 1 + ((p:GetAttribute("BonusLuck") :: number?) or 0)
			end
		end
	end
	local rolled = Roll.meteor(zoneIndex, MeteorService.modifiers.luck * personal, rngFn)
	local rarity = o.rarity or rolled.rarity
	local mutation = if o.rarity then o.mutation else rolled.mutation
	local creatureId = if o.rarity then Roll.creature(rarity, rngFn) else rolled.creatureId
	counter += 1
	local id = "m" .. counter
	local now = workspace:GetServerTimeNow()
	local m: MeteorState = {
		id = id,
		zone = zoneIndex,
		rarity = rarity,
		mutation = mutation,
		creatureId = creatureId,
		position = position :: Vector3,
		state = "falling",
		model = nil,
		carrier = nil,
		despawnAt = math.huge,
	}
	meteors[id] = m
	Remotes.get("MeteorIncoming"):FireAllClients({ id = id, position = position, rarity = rarity, mutation = mutation, impactAt = now + M.TelegraphTime })
	if Rarity.index(rarity) >= Rarity.index(Config.Announce.RarityMin) then
		Remotes.get("Announce"):FireAllClients({
			text = `A {string.upper(rarity)}{if mutation then " " .. string.upper(mutation) else ""} meteor is falling in {zoneName(zoneIndex)}!`,
			rarity = rarity,
		})
	end
	task.delay(M.TelegraphTime, function()
		if meteors[id] ~= m then
			return
		end
		m.model = buildModel(m)
		m.state = "cooling"
		m.despawnAt = workspace:GetServerTimeNow() + M.DespawnUntouched
		Remotes.get("MeteorImpact"):FireAllClients({ id = id, position = m.position, rarity = rarity, mutation = mutation })
		task.delay(M.CoolTime, function()
			if meteors[id] == m and m.state == "cooling" then
				m.state = "ready"
				addPrompt(m)
			end
		end)
	end)
	return id
end

function MeteorService.get(id: string): MeteorState?
	return meteors[id]
end

-- Подписка на нажатие «Pick up» (CarryService решает, можно ли поднять).
function MeteorService.onPickup(fn: (Player, string) -> ())
	table.insert(pickupHandlers, fn)
end

function MeteorService.setCarried(id: string, player: Player)
	local m = meteors[id]
	if not m then
		return
	end
	m.state = "carried"
	m.carrier = player
	m.despawnAt = math.huge
	removePrompt(m)
end

function MeteorService.drop(id: string, position: Vector3)
	local m = meteors[id]
	if not m then
		return
	end
	m.state = "dropped"
	m.carrier = nil
	m.position = position
	m.zone = Layout.nearestZone(position.X, position.Z)
	m.despawnAt = Formulas.dropDespawnAt(workspace:GetServerTimeNow())
	local model = m.model
	if model and model.PrimaryPart then
		for _, d in model:GetDescendants() do
			if d:IsA("BasePart") then
				d.Anchored = true
				for _, j in d:GetChildren() do
					if j:IsA("WeldConstraint") or j:IsA("Weld") then
						j:Destroy()
					end
				end
			end
		end
		local size = model.PrimaryPart.Size.Y
		model:PivotTo(CFrame.new(position + Vector3.new(0, size * 0.35, 0)))
		model.PrimaryPart.CanCollide = true
	end
	task.delay(Config.Push.DroppedPickupDelay, function()
		if meteors[id] == m and m.state == "dropped" then
			addPrompt(m)
		end
	end)
end

function MeteorService.consume(id: string)
	remove(id)
end

local function countIn(zone: number): number
	local n = 0
	for _, m in meteors do
		if m.zone == zone and m.state ~= "carried" then
			n += 1
		end
	end
	return n
end

local function tick()
	local now = workspace:GetServerTimeNow()
	for id, m in meteors do
		if m.state ~= "carried" and m.state ~= "falling" and now >= m.despawnAt then
			remove(id)
		end
	end
	local playerZones = {}
	for _, player in Players:GetPlayers() do
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root then
			table.insert(playerZones, Layout.nearestZone(root.Position.X, root.Position.Z))
		end
	end
	local active = {}
	for _, z in Layout.activeZones(playerZones) do
		active[z] = true
	end
	for zone in nextSpawn do
		if not active[zone] then
			nextSpawn[zone] = nil
		end
	end
	local rate = math.max(MeteorService.modifiers.rateMult, 0.01)
	for zone in active do
		local due = nextSpawn[zone]
		if not due then
			nextSpawn[zone] = now + rng:NextNumber(M.SpawnIntervalMin, M.SpawnIntervalMax) / rate
		elseif now >= due then
			if countIn(zone) < M.MaxPerZone then
				MeteorService.spawn(zone)
			end
			nextSpawn[zone] = now + rng:NextNumber(M.SpawnIntervalMin, M.SpawnIntervalMax) / rate
		end
	end
end

local function registerDebug()
	DebugService.register("meteor", "<Rarity> [Mutation]", function(player, args)
		local rarity = args[1] or "Common"
		assert(Rarity.Info[rarity], "unknown rarity " .. rarity)
		local mutation = args[2]
		assert(mutation == nil or Rarity.mutation(mutation), "unknown mutation " .. tostring(mutation))
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		assert(root, "no character")
		local ahead = (root.CFrame * CFrame.new(0, 0, -15)).Position
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { player.Character :: Model, folder() }
		local hit = workspace:Raycast(ahead + Vector3.new(0, 50, 0), Vector3.new(0, -200, 0), params)
		local position = if hit then hit.Position else ahead
		local zone = Layout.nearestZone(position.X, position.Z)
		local id = MeteorService.spawn(zone, { rarity = rarity, mutation = mutation, position = position })
		return `Meteor {id} ({rarity}{if mutation then " " .. mutation else ""}) in {zoneName(zone)}`
	end)
	DebugService.register("fast", "", function(_player, _args)
		MeteorService.modifiers.rateMult = if MeteorService.modifiers.rateMult == 1 then 4 else 1
		return "Meteor rate ×" .. MeteorService.modifiers.rateMult
	end)
end

function MeteorService.start()
	folder()
	registerDebug()
	task.spawn(function()
		while true do
			task.wait(0.5)
			local ok, err = pcall(tick)
			if not ok then
				warn("[Meteor] tick failed: " .. tostring(err))
			end
		end
	end)
end

return MeteorService
