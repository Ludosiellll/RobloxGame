--!strict
-- Генератор карты-кратера. Только для Studio, в режиме редактирования.
-- Биомы берутся из Workspace.Biomes или ServerStorage.BiomeSource (Rojo кладёт туда assets/biomes).
-- Запуск из Command Bar (View → Command Bar):
--   require(game.ServerStorage.StudioTools.CraterBuilder).build()
-- Повторный запуск пересобирает всё: биомы после первого раза лежат в ServerStorage.BiomeSource.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local StarterPlayer = game:GetService("StarterPlayer")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Zones = require(Shared:WaitForChild("Zones") :: ModuleScript) :: any
local Layout = require(Shared:WaitForChild("CraterLayout") :: ModuleScript) :: any

local C = Config.Crater
local TAU = 2 * math.pi
local terrain = workspace.Terrain

local CraterBuilder = {}

local function material(name: string): Enum.Material
	local ok, m = pcall(function()
		return (Enum.Material :: any)[name]
	end)
	assert(ok and m, "unknown material " .. name)
	return m
end

local function rgb(c: { number }): Color3
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function folder(name: string, parent: Instance): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

local ops = 0
local function breathe()
	ops += 1
	if ops % 40 == 0 then
		task.wait()
	end
end

-- Рамка плиты: локальная Z смотрит наружу от центра под углом a, наклон pitch (вверх наружу).
local function radialFrame(a: number, r: number, y: number, pitch: number): CFrame
	return CFrame.new(math.cos(a) * r, y, math.sin(a) * r) * CFrame.Angles(0, math.pi / 2 - a, 0) * CFrame.Angles(-pitch, 0, 0)
end

-- Слой Terrain толщиной SlabThickness под отрезком профиля (rOut, yOut) → (rIn, yIn) на дуге [a0, a1].
local function paintBand(rOut: number, yOut: number, rIn: number, yIn: number, a0: number, a1: number, mat: Enum.Material)
	local T = C.SlabThickness
	local dr, dy = rOut - rIn, yOut - yIn
	local len = math.sqrt(dr * dr + dy * dy)
	local pitch = math.atan2(dy, dr)
	local steps = math.max(1, math.ceil((a1 - a0) * rOut / C.SlabStep))
	local dA = (a1 - a0) / steps
	local width = rOut * dA * 1.25 + 4
	for i = 1, steps do
		local a = a0 + (i - 0.5) * dA
		local cf = radialFrame(a, (rOut + rIn) / 2, (yOut + yIn) / 2, pitch) * CFrame.new(0, -T / 2, 0)
		terrain:FillBlock(cf, Vector3.new(width, T, len + 8), mat)
		breathe()
	end
end

local function buildTerrain()
	terrain:Clear()
	for name, c in C.MaterialColors do
		pcall(function()
			terrain:SetMaterialColor(material(name), rgb(c))
		end)
	end
	local rings = C.Rings
	-- равнина и пологий склон к кольцу 1
	paintBand(C.PlainRadius, C.RimY, C.RimRadius, C.RimY, 0, TAU, material(C.Materials.Plain))
	paintBand(C.RimRadius, C.RimY, rings[1].outer, rings[1].y, 0, TAU, material(C.Materials.Slope))
	-- кольца по секторам и обрывы между ними
	for k, ring in rings do
		for slot, zone in ring.zones do
			local s = Layout.sector(zone)
			paintBand(ring.outer, ring.y, ring.inner, ring.y, s.a0, s.a1, material(C.ZoneMaterials[Zones.List[zone].folder]))
		end
		local nextOuter = if rings[k + 1] then rings[k + 1].outer else C.Core.radius
		local nextY = if rings[k + 1] then rings[k + 1].y else C.Core.y
		local mat = if rings[k + 1] then C.Materials.Cliff else C.Materials.Moat
		paintBand(ring.inner, ring.y, nextOuter, nextY, 0, TAU, material(mat))
	end
	-- ядро
	local T = C.SlabThickness
	terrain:FillCylinder(CFrame.new(0, C.Core.y - T / 2, 0), T, C.Core.radius + 6, material(C.ZoneMaterials.NuclearWasteland))
	-- спуски
	for _, ramp in Layout.ramps() do
		local dr, dy = ramp.fromR - ramp.toR, ramp.fromY - ramp.toY
		local cf = radialFrame(ramp.angle, (ramp.fromR + ramp.toR) / 2, (ramp.fromY + ramp.toY) / 2, math.atan2(dy, dr)) * CFrame.new(0, -4, 0)
		terrain:FillBlock(cf, Vector3.new(C.Ramps.width, 8, math.sqrt(dr * dr + dy * dy) + 10), material(C.Materials.Ramp))
		breathe()
	end
end

local SKIP: { [string]: boolean } = {}
for _, n in C.SkipNames do
	SKIP[n] = true
end

type Bounds = { minX: number, maxX: number, minZ: number, maxZ: number, groundY: number }

-- Детали декора биома и границы его коридора.
local function collectDecor(source: Instance): ({ BasePart }, Bounds)
	local parts: { BasePart } = {}
	local b = { minX = math.huge, maxX = -math.huge, minZ = math.huge, maxZ = -math.huge, groundY = math.huge }
	for _, d in source:GetDescendants() do
		if d:IsA("BasePart") then
			local s, p = d.Size, d.Position
			b.minX = math.min(b.minX, p.X - s.X / 2)
			b.maxX = math.max(b.maxX, p.X + s.X / 2)
			b.minZ = math.min(b.minZ, p.Z - s.Z / 2)
			b.maxZ = math.max(b.maxZ, p.Z + s.Z / 2)
			local flat = s.X * s.Z > 3000 and s.Y <= 3
			if flat then
				b.groundY = math.min(b.groundY, p.Y + s.Y / 2)
			end
			if not flat and not SKIP[d.Name] and d.Transparency < 0.95 then
				table.insert(parts, d)
			end
		end
	end
	if b.groundY == math.huge then
		b.groundY = 0
	end
	return parts, b
end

local function placeClone(part: BasePart, frame: CFrame, rel: CFrame, parent: Instance)
	local clone = part:Clone()
	-- связи со старыми деталями не нужны: всё закреплено
	for _, d in clone:GetDescendants() do
		if d:IsA("JointInstance") or d:IsA("WeldConstraint") or d:IsA("NoCollisionConstraint") then
			d:Destroy()
		end
	end
	clone.Anchored = true
	clone.CFrame = frame * rel
	clone.Parent = parent
end

-- Декор биома кусками по ChunkLength, разложенными по дуге сектора.
local function placeBiome(source: Instance, zone: number, out: Instance): number
	local s = Layout.sector(zone)
	local parts, b = collectDecor(source)
	local L = C.ChunkLength
	local n = math.max(1, math.ceil((b.maxZ - b.minZ) / L))
	local buckets: { { BasePart } } = {}
	for k = 1, n do
		buckets[k] = {}
	end
	for _, part in parts do
		local k = math.clamp(math.floor((part.Position.Z - b.minZ) / L) + 1, 1, n)
		table.insert(buckets[k], part)
	end
	local rMid = (s.inner + s.outer) / 2
	local sx = math.min(1, (s.outer - s.inner - 30) / math.max(1, b.maxX - b.minX))
	local cx = (b.minX + b.maxX) / 2
	local angles = Layout.chunkAngles(s.a0, s.a1, rMid, n)
	local zoneFolder = folder(source.Name, out)
	local count = 0
	for k = 1, n do
		local theta = angles[k]
		local zMid = b.minZ + (k - 0.5) * L
		local frame = CFrame.new(math.cos(theta) * rMid, s.y, math.sin(theta) * rMid) * CFrame.Angles(0, -theta, 0)
		local model = Instance.new("Model")
		model.Name = source.Name .. "_" .. k
		for _, part in buckets[k] do
			local rel = CFrame.new(-cx, -b.groundY, -zMid) * part.CFrame
			local p = rel.Position
			rel = rel - p + Vector3.new(p.X * sx, p.Y, p.Z)
			placeClone(part, frame, rel, model)
			count += 1
		end
		model.Parent = zoneFolder
		breathe()
	end
	return count
end

-- Ядро: декор Nuclear Wasteland вокруг башен, по центру кратера.
local function placeCore(source: Instance, out: Instance): number
	local parts, b = collectDecor(source)
	local sumZ, nT = 0, 0
	for _, part in parts do
		if part.Name == "Tower" then
			sumZ += part.Position.Z
			nT += 1
		end
	end
	local tz = if nT > 0 then sumZ / nT else (b.minZ + b.maxZ) / 2
	local cx = (b.minX + b.maxX) / 2
	local limit = C.Core.radius - 40
	local model = Instance.new("Model")
	model.Name = "NuclearCore"
	local frame = CFrame.new(0, C.Core.y, 0)
	local count = 0
	for _, part in parts do
		local p = part.Position
		local dx, dz = p.X - cx, p.Z - tz
		if dx * dx + dz * dz < limit * limit and part.Size.X * part.Size.Z < 60000 then
			placeClone(part, frame, CFrame.new(-cx, -b.groundY, -tz) * part.CFrame, model)
			count += 1
		end
	end
	model.Parent = out
	return count
end

local function makePart(props: { [string]: any }, parent: Instance): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		(p :: any)[k] = v
	end
	p.Parent = parent
	return p
end

-- Дамбы через лавовый ров к ядру.
local function buildPaths(out: Instance)
	for _, path in Layout.paths() do
		local dr, dy = path.fromR - path.toR, path.fromY - path.toY
		local len = math.sqrt(dr * dr + dy * dy)
		local cf = radialFrame(path.angle, (path.fromR + path.toR) / 2, (path.fromY + path.toY) / 2, math.atan2(dy, dr)) * CFrame.new(0, -2, 0)
		local name = Zones.List[path.zone].folder
		local deck = makePart({ Name = name, Size = Vector3.new(C.PathWidth, 4, len), CFrame = cf, Material = material(C.ZoneMaterials[name]), Color = Color3.fromRGB(120, 96, 70) }, out)
		for _, side in { -1, 1 } do
			makePart({ Name = "Rail", Size = Vector3.new(2, 4, len), CFrame = cf * CFrame.new(side * (C.PathWidth / 2 - 1), 4, 0), Material = Enum.Material.Wood, Color = Color3.fromRGB(90, 64, 40) }, deck)
		end
	end
end

local function buildGeysers(out: Instance)
	for i, g in Layout.geysers() do
		local pad = makePart({
			Name = "Geyser" .. i,
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(2, 26, 26),
			CFrame = CFrame.new(g.x, g.y + 1, g.z) * CFrame.Angles(0, 0, math.pi / 2),
			Material = Enum.Material.Neon,
			Color = Color3.fromRGB(80, 230, 255),
			CanCollide = false,
		}, out)
		pad:SetAttribute("ToY", g.toY)
		CollectionService:AddTag(pad, "Geyser")
		local att = Instance.new("Attachment")
		att.Parent = pad
		att.WorldCFrame = CFrame.new(g.x, g.y + 2, g.z)
		local fx = Instance.new("ParticleEmitter")
		fx.EmissionDirection = Enum.NormalId.Top
		fx.Speed = NumberRange.new(40, 60)
		fx.Lifetime = NumberRange.new(1.2, 1.6)
		fx.Rate = 35
		fx.SpreadAngle = Vector2.new(8, 8)
		fx.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 3), NumberSequenceKeypoint.new(1, 8) })
		fx.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(1, 1) })
		fx.Color = ColorSequence.new(Color3.fromRGB(160, 245, 255))
		fx.LightEmission = 0.8
		fx.Parent = att
		breathe()
	end
end

local function buildBaseSlots(out: Instance)
	for i, b in Layout.bases() do
		makePart({
			Name = "BaseSlot" .. i,
			Size = Vector3.new(90, 1, 70),
			CFrame = CFrame.lookAt(Vector3.new(b.x, C.RimY + 0.5, b.z), Vector3.new(0, C.RimY + 0.5, 0)),
			Transparency = 1,
			CanCollide = false,
			CanQuery = false,
			CanTouch = false,
		}, out)
	end
end

-- Невидимая стена по краю равнины, чтобы не упасть с карты; огни во рву.
local function buildEdges(out: Instance)
	local r = C.PlainRadius - 20
	local steps = math.ceil(TAU * r / 60)
	for i = 1, steps do
		local a = (i - 0.5) * TAU / steps
		makePart({
			Name = "Boundary",
			Size = Vector3.new(TAU * r / steps + 4, 300, 4),
			CFrame = CFrame.new(math.cos(a) * r, 140, math.sin(a) * r) * CFrame.Angles(0, math.pi / 2 - a, 0), -- длинная сторона вдоль края
			Transparency = 1,
			CanQuery = false,
		}, out)
	end
	for i = 1, 8 do
		local a = (i - 0.5) * TAU / 8
		local rr = (C.Moat.inner + C.Moat.outer) / 2
		local holder = makePart({ Name = "MoatLight", Size = Vector3.new(1, 1, 1), CFrame = CFrame.new(math.cos(a) * rr, C.Core.y + 40, math.sin(a) * rr), Transparency = 1, CanCollide = false, CanQuery = false, CanTouch = false }, out)
		local light = Instance.new("PointLight")
		light.Range = 60
		light.Brightness = 3
		light.Color = Color3.fromRGB(255, 120, 40)
		light.Parent = holder
	end
end

function CraterBuilder.build(): { [string]: any }
	local started = os.clock()
	ops = 0
	local source = workspace:FindFirstChild("Biomes") or ServerStorage:FindFirstChild("BiomeSource")
	if not source then
		warn("[Crater] Workspace.Biomes not found: copy it from the old project first. Building terrain without decor.")
	end
	local old = workspace:FindFirstChild("Crater")
	if old then
		old:Destroy()
	end
	local root = folder("Crater", workspace)
	print("[Crater] terrain…")
	buildTerrain()
	local stats: { [string]: any } = { parts = 0, zones = {} }
	if source then
		local sectors = folder("Sectors", root)
		for zone = 1, 14 do
			local name = Zones.List[zone].folder
			local src = source:FindFirstChild(name)
			if src then
				local n = placeBiome(src, zone, sectors)
				stats.zones[name] = n
				stats.parts += n
				print(string.format("[Crater] %s: %d parts", name, n))
			else
				warn("[Crater] biome " .. name .. " is missing in Biomes")
			end
		end
		local nuclear = source:FindFirstChild("NuclearWasteland")
		if nuclear then
			local n = placeCore(nuclear, root)
			stats.zones.NuclearWasteland = n
			stats.parts += n
		end
	end
	buildPaths(folder("Paths", root))
	buildGeysers(folder("Geysers", root))
	buildBaseSlots(folder("BaseSlots", root))
	buildEdges(folder("Edges", root))
	StarterPlayer.CharacterMaxSlopeAngle = C.MaxSlopeAngle
	if source and source.Parent == workspace then
		if ServerStorage:FindFirstChild("BiomeSource") then
			-- биомы уже есть в ServerStorage (их кладёт Rojo): копия из Workspace больше не нужна
			source:Destroy()
		else
			source.Name = "BiomeSource"
			source.Parent = ServerStorage
		end
	end
	stats.seconds = math.floor((os.clock() - started) * 10) / 10
	print(string.format("[Crater] done: %d decor parts, %.1f s. Save or publish the place now.", stats.parts, stats.seconds))
	return stats
end

return CraterBuilder
