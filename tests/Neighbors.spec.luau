--!strict
-- Соседние зоны кратера: метеориты падают там, где есть игрок, и рядом.

local Shared = game:GetService("ReplicatedStorage").Shared
local Layout = require(Shared.CraterLayout) :: any
local Config = require(Shared.Config) :: any

local function has(list: { number }, v: number): boolean
	return table.find(list, v) ~= nil
end

return function(t: any)
	t.test("same ring wraps around and lower ring overlaps", function()
		local n = Layout.neighbors(1) -- кольцо 1, сектор 45°..135°
		t.truthy(has(n, 2) and has(n, 4), "ring neighbours 2 and 4")
		t.truthy(has(n, 5) and has(n, 6), "ring 2 sectors 30°..90° and 90°..150° overlap")
		t.truthy(not has(n, 3), "opposite sector is not a neighbour")
		t.truthy(not has(n, 1), "not itself")
	end)

	t.test("neighbours are symmetric", function()
		for zone = 1, 17 do
			for _, other in Layout.neighbors(zone) do
				t.truthy(has(Layout.neighbors(other), zone), `{zone} ↔ {other}`)
			end
		end
	end)

	t.test("core connects only through the causeways", function()
		local core = Config.Crater.Core.zone
		t.eq(Layout.neighbors(core), { 15, 16 })
		local p = Layout.neighbors(15)
		t.truthy(has(p, core), "causeway touches core")
		t.truthy(has(p, 11), "causeway at 67.5° starts in ring 3 zone 11")
	end)

	t.test("active zones are player zones plus neighbours, sorted, unique", function()
		local active = Layout.activeZones({ 1, 1, 2 })
		t.truthy(has(active, 1) and has(active, 2) and has(active, 3) and has(active, 4), "ring 1 all")
		local seen = {}
		for i, z in active do
			t.eq(seen[z], nil, "unique")
			seen[z] = true
			if i > 1 then
				t.truthy(active[i - 1] < z, "sorted")
			end
		end
		t.eq(Layout.activeZones({}), {})
	end)

	t.test("nearest zone from the rim and slopes", function()
		local a = math.rad(90)
		local rim = Config.Crater.RimRadius + 50
		t.eq(Layout.nearestZone(math.cos(a) * rim, math.sin(a) * rim), 1)
		t.eq(Layout.nearestZone(0, 0), Config.Crater.Core.zone)
		local cliff = (Config.Crater.Rings[1].inner + Config.Crater.Rings[2].outer) / 2 - 5 -- обрыв ближе к кольцу 2
		t.eq(Layout.nearestZone(math.cos(a) * cliff, math.sin(a) * cliff), Layout.zoneAt(0, (Config.Crater.Rings[2].outer - 10)))
	end)
end
