--!strict
-- Карта-кратер на сервере: зоны, точки падения метеоритов, места баз, появление игроков,
-- ворота по перерождениям (возврат тех, кто прошёл в закрытую зону) и отметка гейзеров.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Layout = require(Shared:WaitForChild("CraterLayout") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any
local Zones = require(Shared:WaitForChild("Zones") :: ModuleScript) :: any

local DebugService = require(script.Parent:WaitForChild("DebugService") :: ModuleScript) :: any

local MapService = {}

local spawnResolver: ((Player) -> CFrame?)? = nil
local lastAllowed: { [Player]: Vector3 } = {}
local lastNotice: { [Player]: number } = {}

local function runtimeFolder(): Folder
	local f = workspace:FindFirstChild("Runtime")
	if not f then
		f = Instance.new("Folder")
		f.Name = "Runtime"
		f.Parent = workspace
	end
	return f :: Folder
end

function MapService.zoneOf(position: Vector3): number?
	return Layout.zoneAt(position.X, position.Z)
end

function MapService.canEnter(rebirths: number, zone: number?): boolean
	return Layout.canEnter(rebirths, zone)
end

local function rayParams(): RaycastParams
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local exclude: { Instance } = { runtimeFolder() }
	for _, p in Players:GetPlayers() do
		if p.Character then
			table.insert(exclude, p.Character)
		end
	end
	params.FilterDescendantsInstances = exclude
	return params
end

-- Точка на земле внутри зоны: не вода, не лава, не ближе MinSpacing к точкам из avoid.
function MapService.findSpawnPoint(zone: number, rng: Random, avoid: { Vector3 }?): Vector3?
	local M = Config.Meteor
	local params = rayParams()
	for _ = 1, M.SpawnMaxTries do
		local x, z = Layout.randomPoint(zone, function()
			return rng:NextNumber()
		end)
		local top = Layout.heightAt(math.sqrt(x * x + z * z)) + M.SpawnRayHeight
		local hit = workspace:Raycast(Vector3.new(x, top, z), Vector3.new(0, -M.SpawnRayHeight * 2, 0), params)
		if hit and Formulas.isSpawnHitAllowed(hit.Instance.Name) and hit.Material ~= Enum.Material.CrackedLava and hit.Material ~= Enum.Material.Water and Layout.zoneAt(hit.Position.X, hit.Position.Z) == zone then
			local ok = true
			for _, p in avoid or {} do
				if (p - hit.Position).Magnitude < M.MinSpacing then
					ok = false
					break
				end
			end
			if ok then
				return hit.Position
			end
		end
	end
	return nil
end

-- 8 мест баз на краю кратера: из BaseSlots генератора, иначе по раскладке.
function MapService.baseFrames(): { CFrame }
	local frames: { CFrame } = {}
	local slots = workspace:FindFirstChild("Crater") and (workspace :: any).Crater:FindFirstChild("BaseSlots")
	for i, b in Layout.bases() do
		local slot = slots and slots:FindFirstChild("BaseSlot" .. i)
		if slot and slot:IsA("BasePart") then
			frames[i] = slot.CFrame
		else
			local y = Config.Crater.RimY + 0.5
			frames[i] = CFrame.lookAt(Vector3.new(b.x, y, b.z), Vector3.new(0, y, 0))
		end
	end
	return frames
end

-- BaseService сообщает, где появляется игрок (на его базе).
function MapService.setSpawnResolver(fn: (Player) -> CFrame?)
	spawnResolver = fn
end

local function spawnFrame(player: Player): CFrame
	local cf = spawnResolver and spawnResolver(player)
	return cf or MapService.baseFrames()[1]
end

local function onCharacter(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10) :: Humanoid?
	if humanoid then
		humanoid.MaxSlopeAngle = Config.Crater.MaxSlopeAngle
	end
	character:WaitForChild("HumanoidRootPart", 10)
	task.defer(function()
		if character.Parent then
			character:PivotTo(spawnFrame(player) * CFrame.new(0, 6, 0))
		end
	end)
end

local function notifyGate(player: Player, zone: number)
	local now = os.clock()
	if (lastNotice[player] or 0) + 2 > now then
		return
	end
	lastNotice[player] = now
	local def = Zones.List[zone]
	Remotes.get("Notify"):FireClient(player, `Rebirth {def.gate} required to enter {def.display}`)
end

local function enforceGates()
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if root and humanoid and humanoid.Health > 0 then
			local zone = MapService.zoneOf(root.Position)
			local rebirths = (player:GetAttribute("Rebirths") :: number?) or 0
			if MapService.canEnter(rebirths, zone) then
				if humanoid.FloorMaterial ~= Enum.Material.Air then
					lastAllowed[player] = root.Position
				end
			else
				local back = lastAllowed[player]
				local target = if back then CFrame.new(back + Vector3.new(0, 4, 0)) else spawnFrame(player) * CFrame.new(0, 6, 0)
				character:PivotTo(target)
				notifyGate(player, zone :: number)
			end
		end
	end
end

-- Сервер отмечает касание гейзера: проверка скорости при переноске не должна срабатывать на полёт.
local function watchGeyser(part: Instance)
	if not part:IsA("BasePart") then
		return
	end
	part.Touched:Connect(function(hit)
		local character = hit:FindFirstAncestorOfClass("Model")
		local player = character and Players:GetPlayerFromCharacter(character)
		if player then
			player:SetAttribute("LaunchedAt", workspace:GetServerTimeNow())
		end
	end)
end

local function registerDebug()
	DebugService.register("zone", "", function(player, _args)
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if not root then
			return "No character"
		end
		local zone = MapService.zoneOf(root.Position)
		if not zone then
			return "Not in a zone (rim, slope or cliff)"
		end
		local def = Zones.List[zone]
		return `Zone {zone}: {def.display}, gate {def.gate}`
	end)
	DebugService.register("tp", "<zone 1-17>", function(player, args)
		local zone = tonumber(args[1])
		assert(zone and Zones.List[zone], "zone must be 1..17")
		local point = MapService.findSpawnPoint(zone, Random.new(), {})
		assert(point, "no ground found in zone " .. zone .. " — is the crater built?")
		lastAllowed[player] = point
		if player.Character then
			player.Character:PivotTo(CFrame.new(point + Vector3.new(0, 5, 0)))
		end
		return "Teleported to " .. Zones.List[zone].display
	end)
end

function MapService.start()
	runtimeFolder()
	registerDebug()
	local function onPlayer(player: Player)
		player.CharacterAdded:Connect(function(character)
			onCharacter(player, character)
		end)
		if player.Character then
			task.spawn(onCharacter, player, player.Character)
		end
	end
	Players.PlayerAdded:Connect(onPlayer)
	for _, p in Players:GetPlayers() do
		onPlayer(p)
	end
	Players.PlayerRemoving:Connect(function(player)
		lastAllowed[player] = nil
		lastNotice[player] = nil
	end)
	for _, part in CollectionService:GetTagged("Geyser") do
		watchGeyser(part)
	end
	CollectionService:GetInstanceAddedSignal("Geyser"):Connect(watchGeyser)
	task.spawn(function()
		while true do
			task.wait(0.25)
			local ok, err = pcall(enforceGates)
			if not ok then
				warn("[Map] gate check failed: " .. tostring(err))
			end
		end
	end)
	if not workspace:FindFirstChild("Crater") then
		warn("[Map] workspace.Crater not found — build the crater (docs/ASSET_SETUP.md)")
	end
end

return MapService
