--!strict
-- Геометрия кратера: профиль высот, зоны (кольца, секторы, ров с дамбами, ядро),
-- случайные точки внутри зон, базы на краю, спуски и гейзеры.
-- Чистый модуль: только числа, без Roblox API. Угол — atan2(z, x) в [0, 2π).

local Config = require(script.Parent.Config)
local Zones = require(script.Parent.Zones)

local C = Config.Crater
local TAU = 2 * math.pi

export type Sector = {
	kind: "ring" | "core" | "path",
	ring: number?,
	a0: number,
	a1: number,
	inner: number,
	outer: number,
	y: number,
}

local CraterLayout = {}

-- Профиль чаши: точки (радиус, высота) от равнины к центру.
local PROFILE: { { number } } = {
	{ C.PlainRadius, C.RimY },
	{ C.RimRadius, C.RimY },
}
for _, ring in C.Rings do
	table.insert(PROFILE, { ring.outer, ring.y })
	table.insert(PROFILE, { ring.inner, ring.y })
end
table.insert(PROFILE, { C.Core.radius, C.Core.y })
table.insert(PROFILE, { 0, C.Core.y })

local function wrap(a: number): number
	return a % TAU
end

-- Кратчайшее расстояние между углами, [0, π].
local function angleDiff(a: number, b: number): number
	local d = math.abs(wrap(a) - wrap(b))
	return math.min(d, TAU - d)
end

function CraterLayout.heightAt(r: number): number
	if r >= PROFILE[1][1] then
		return PROFILE[1][2]
	end
	for i = 1, #PROFILE - 1 do
		local ra, ya = PROFILE[i][1], PROFILE[i][2]
		local rb, yb = PROFILE[i + 1][1], PROFILE[i + 1][2]
		if r <= ra and r >= rb then
			if ra == rb then
				return ya
			end
			return ya + (yb - ya) * (ra - r) / (ra - rb)
		end
	end
	return C.Core.y
end

-- Наибольший радиус, где поверхность не выше y. Внутри него слой [y, y + шаг] — воздух.
function CraterLayout.openingRadius(y: number): number
	if y >= C.RimY then
		return C.PlainRadius
	end
	if y < C.Core.y then
		return 0
	end
	for i = 1, #PROFILE - 1 do
		local ra, ya = PROFILE[i][1], PROFILE[i][2]
		local rb, yb = PROFILE[i + 1][1], PROFILE[i + 1][2]
		if yb <= y then
			if ya <= y then
				return ra
			end
			return ra - (ya - y) / (ya - yb) * (ra - rb)
		end
	end
	return 0
end

function CraterLayout.polar(x: number, z: number): (number, number)
	return math.sqrt(x * x + z * z), wrap(math.atan2(z, x))
end

local function ringSector(ringIndex: number, slot: number): Sector
	local ring = C.Rings[ringIndex]
	local step = TAU / #ring.zones
	local a0 = math.rad(ring.startDeg) + (slot - 1) * step
	return { kind = "ring", ring = ringIndex, a0 = a0, a1 = a0 + step, inner = ring.inner, outer = ring.outer, y = ring.y }
end

function CraterLayout.sector(zone: number): Sector?
	if zone == C.Core.zone then
		return { kind = "core", a0 = 0, a1 = TAU, inner = 0, outer = C.Core.radius, y = C.Core.y }
	end
	for _, path in C.Paths do
		if path.zone == zone then
			local a = math.rad(path.deg)
			return { kind = "path", a0 = a, a1 = a, inner = C.Moat.inner, outer = C.Moat.outer, y = (C.Core.y + C.Rings[#C.Rings].y) / 2 }
		end
	end
	for ringIndex, ring in C.Rings do
		for slot, z in ring.zones do
			if z == zone then
				return ringSector(ringIndex, slot)
			end
		end
	end
	return nil
end

function CraterLayout.zoneAt(x: number, z: number): number?
	local r, a = CraterLayout.polar(x, z)
	if r <= C.Core.radius then
		return C.Core.zone
	end
	if r > C.Moat.inner and r < C.Moat.outer then
		for _, path in C.Paths do
			local d = angleDiff(a, math.rad(path.deg))
			if d < math.pi / 2 and r * math.sin(d) <= C.PathWidth / 2 then
				return path.zone
			end
		end
		return nil
	end
	for _, ring in C.Rings do
		if r >= ring.inner and r <= ring.outer then
			local step = TAU / #ring.zones
			local rel = wrap(a - math.rad(ring.startDeg))
			local slot = math.min(#ring.zones, math.floor(rel / step) + 1)
			return ring.zones[slot]
		end
	end
	return nil
end

-- Случайная точка внутри зоны, равномерно по площади, с отступом от краёв.
function CraterLayout.randomPoint(zone: number, rng: () -> number): (number, number)
	local s = CraterLayout.sector(zone)
	assert(s, "unknown zone " .. tostring(zone))
	local margin = C.SpawnMargin
	if s.kind == "core" then
		local r = math.sqrt(rng()) * (s.outer - margin)
		local a = rng() * TAU
		return math.cos(a) * r, math.sin(a) * r
	elseif s.kind == "path" then
		local r = s.inner + margin / 2 + rng() * (s.outer - s.inner - margin)
		local w = (rng() * 2 - 1) * (C.PathWidth / 2 - margin / 2)
		local a = s.a0
		return math.cos(a) * r - math.sin(a) * w, math.sin(a) * r + math.cos(a) * w
	end
	local r1, r2 = s.inner + margin, s.outer - margin
	local r = math.sqrt(rng() * (r2 * r2 - r1 * r1) + r1 * r1)
	local am = margin / r
	local a = s.a0 + am + rng() * (s.a1 - s.a0 - 2 * am)
	return math.cos(a) * r, math.sin(a) * r
end

-- Базы на краю: угол — направление из центра к базе.
function CraterLayout.bases(): { { x: number, z: number, angle: number } }
	local out = {}
	for i = 1, C.BaseCount do
		local a = (i - 1) * TAU / C.BaseCount
		table.insert(out, { x = math.cos(a) * C.BaseRadius, z = math.sin(a) * C.BaseRadius, angle = a })
	end
	return out
end

-- Центры кусков биома, равномерно по дуге сектора.
function CraterLayout.chunkAngles(a0: number, a1: number, _rMid: number, count: number): { number }
	local out = {}
	for i = 1, count do
		table.insert(out, a0 + (a1 - a0) * (i - 0.5) / count)
	end
	return out
end

-- Спуски с кольца на кольцо (вниз), по радиусу.
function CraterLayout.ramps(): { { angle: number, fromR: number, fromY: number, toR: number, toY: number } }
	local out = {}
	local R = C.Ramps
	for k = 1, #C.Rings - 1 do
		local upper, lower = C.Rings[k], C.Rings[k + 1]
		for i = 1, R.perTransition do
			table.insert(out, {
				angle = math.rad(R.startDeg) + (i - 1) * TAU / R.perTransition,
				fromR = upper.inner + R.overhang,
				fromY = upper.y,
				toR = lower.outer - R.overhang,
				toY = lower.y,
			})
		end
	end
	return out
end

-- Дамбы через лавовый ров: от кольца 3 вниз к ядру.
function CraterLayout.paths(): { { zone: number, angle: number, fromR: number, fromY: number, toR: number, toY: number } }
	local out = {}
	local ring3 = C.Rings[#C.Rings]
	for _, path in C.Paths do
		table.insert(out, {
			zone = path.zone,
			angle = math.rad(path.deg),
			fromR = C.Moat.outer + C.PathOverhang,
			fromY = ring3.y,
			toR = C.Moat.inner - C.PathOverhang,
			toY = C.Core.y,
		})
	end
	return out
end

-- Гейзеры у подножия каждого обрыва: подбрасывают на ярус выше.
function CraterLayout.geysers(): { { x: number, z: number, y: number, toY: number, angle: number } }
	local out = {}
	local G = C.Geysers
	local levels = {}
	for _, ring in C.Rings do
		table.insert(levels, { outer = ring.outer, y = ring.y })
	end
	table.insert(levels, { outer = C.Core.radius, y = C.Core.y })
	for k = 2, #levels do
		local upper, lower = levels[k - 1], levels[k]
		for i = 1, G.perTransition do
			local a = math.rad(G.startDeg) + (i - 1) * TAU / G.perTransition
			local r = lower.outer - G.inset
			table.insert(out, { x = math.cos(a) * r, z = math.sin(a) * r, y = lower.y, toY = upper.y + G.overshoot, angle = a })
		end
	end
	return out
end

local function arcsOverlap(a0: number, a1: number, b0: number, b1: number): boolean
	for k = -1, 1 do
		local off = k * TAU
		if math.max(a0, b0 + off) < math.min(a1, b1 + off) - 1e-6 then
			return true
		end
	end
	return false
end

-- Ворота кольца 3, с которых начинается дамба path (зона под началом дамбы).
local function pathRingZone(path: { zone: number, deg: number }): number?
	local a = math.rad(path.deg)
	local r = C.Rings[#C.Rings].inner + 1
	return CraterLayout.zoneAt(math.cos(a) * r, math.sin(a) * r)
end

-- Зоны, граничащие с этой: соседние секторы кольца, перекрывающиеся секторы соседних колец,
-- дамбы с кольцом 3 и ядром.
function CraterLayout.neighbors(zone: number): { number }
	local s = CraterLayout.sector(zone)
	if not s then
		return {}
	end
	local out: { number } = {}
	local seen: { [number]: boolean } = { [zone] = true }
	local function add(z: number?)
		if z and not seen[z] then
			seen[z] = true
			table.insert(out, z)
		end
	end
	if s.kind == "core" then
		for _, path in C.Paths do
			add(path.zone)
		end
	elseif s.kind == "path" then
		add(C.Core.zone)
		for _, path in C.Paths do
			if path.zone == zone then
				add(pathRingZone(path))
			end
		end
	else
		local ringIndex = s.ring :: number
		local ring = C.Rings[ringIndex]
		local slot = table.find(ring.zones, zone) :: number
		local n = #ring.zones
		if n > 1 then
			add(ring.zones[(slot - 2) % n + 1])
			add(ring.zones[slot % n + 1])
		end
		for _, other in { ringIndex - 1, ringIndex + 1 } do
			local r2 = C.Rings[other]
			if r2 then
				for j, z in r2.zones do
					local o = ringSector(other, j)
					if arcsOverlap(s.a0, s.a1, o.a0, o.a1) then
						add(z)
					end
				end
			end
		end
		if ringIndex == #C.Rings then
			for _, path in C.Paths do
				if pathRingZone(path) == zone then
					add(path.zone)
				end
			end
		end
	end
	table.sort(out)
	return out
end

-- Зоны, где есть игроки, и их соседи — там падают метеориты.
function CraterLayout.activeZones(playerZones: { number }): { number }
	local set: { [number]: boolean } = {}
	for _, z in playerZones do
		set[z] = true
		for _, n in CraterLayout.neighbors(z) do
			set[n] = true
		end
	end
	local out: { number } = {}
	for z in set do
		table.insert(out, z)
	end
	table.sort(out)
	return out
end

-- Зона в точке, а если точка на краю, склоне или обрыве — ближайшая по радиусу.
function CraterLayout.nearestZone(x: number, z: number): number
	local direct = CraterLayout.zoneAt(x, z)
	if direct then
		return direct
	end
	local r, a = CraterLayout.polar(x, z)
	local best, bestR = math.huge, nil :: number?
	for _, ring in C.Rings do
		local d = if r < ring.inner then ring.inner - r elseif r > ring.outer then r - ring.outer else 0
		if d < best then
			best, bestR = d, math.clamp(r, ring.inner + 1, ring.outer - 1)
		end
	end
	if r - C.Core.radius < best then
		return C.Core.zone
	end
	local rr = bestR :: number
	return CraterLayout.zoneAt(math.cos(a) * rr, math.sin(a) * rr) :: number
end

-- Можно ли игроку с этим числом перерождений быть в зоне (nil — край, склоны, обрывы — можно).
function CraterLayout.canEnter(rebirths: number, zone: number?): boolean
	if zone == nil then
		return true
	end
	local def = Zones.List[zone]
	return def == nil or rebirths >= def.gate
end

export type Wall = {
	kind: "radial" | "ramp" | "path" | "core",
	zone: number,
	gate: number,
	angle: number,
	inner: number?, -- radial: от какого радиуса
	outer: number?, -- radial: до какого радиуса
	r: number?, -- ramp/path/core: радиус поперечной стены
	width: number?, -- ramp/path/core: ширина поперечной стены
	bottomY: number,
	topY: number,
}

-- Стены ворот для игрока с этим числом перерождений: границы закрытых секторов, низ спусков,
-- верх дамб и вход в ядро. Сервер всё равно возвращает того, кто прошёл мимо стен.
function CraterLayout.gateWalls(rebirths: number): { Wall }
	local walls: { Wall } = {}
	local seen: { [string]: boolean } = {}
	for ringIndex, ring in C.Rings do
		for slot, zone in ring.zones do
			if not CraterLayout.canEnter(rebirths, zone) then
				local s = ringSector(ringIndex, slot)
				for _, a in { s.a0, s.a1 } do
					local key = ringIndex .. ":" .. string.format("%.4f", wrap(a))
					if not seen[key] then
						seen[key] = true
						table.insert(walls, { kind = "radial", zone = zone, gate = Zones.List[zone].gate, angle = a, inner = ring.inner, outer = ring.outer, bottomY = ring.y - 4, topY = ring.y + 60 })
					end
				end
			end
		end
	end
	for _, ramp in CraterLayout.ramps() do
		local landR = ramp.toR - 10
		local zone = CraterLayout.zoneAt(math.cos(ramp.angle) * landR, math.sin(ramp.angle) * landR)
		if zone and not CraterLayout.canEnter(rebirths, zone) then
			table.insert(walls, { kind = "ramp", zone = zone, gate = Zones.List[zone].gate, angle = ramp.angle, r = ramp.toR - 8, width = C.Ramps.width + 10, bottomY = ramp.toY - 4, topY = ramp.toY + 40 })
		end
	end
	local coreLocked = not CraterLayout.canEnter(rebirths, C.Core.zone)
	for _, path in CraterLayout.paths() do
		if not CraterLayout.canEnter(rebirths, path.zone) then
			table.insert(walls, { kind = "path", zone = path.zone, gate = Zones.List[path.zone].gate, angle = path.angle, r = C.Moat.outer + 5, width = C.PathWidth + 10, bottomY = path.fromY - 4, topY = path.fromY + 40 })
		end
		if coreLocked then
			table.insert(walls, { kind = "core", zone = C.Core.zone, gate = Zones.List[C.Core.zone].gate, angle = path.angle, r = C.Moat.inner - 5, width = C.PathWidth + 10, bottomY = path.toY - 4, topY = path.toY + 40 })
		end
	end
	return walls
end

return CraterLayout
