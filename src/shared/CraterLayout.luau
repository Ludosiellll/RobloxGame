--!strict
-- Геометрия кратера: профиль высот, зоны (кольца, секторы, ров с дамбами, ядро),
-- случайные точки внутри зон, базы на краю, спуски и гейзеры.
-- Чистый модуль: только числа, без Roblox API. Угол — atan2(z, x) в [0, 2π).

local Config = require(script.Parent.Config)

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

return CraterLayout
