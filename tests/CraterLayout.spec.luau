--!strict
-- Геометрия кратера: высоты, зоны по кольцам и секторам, точки внутри зон, базы, куски биомов.

local Shared = game:GetService("ReplicatedStorage").Shared
local Layout = require(Shared.CraterLayout) :: any

local function at(r: number, deg: number): (number, number)
	local a = math.rad(deg)
	return math.cos(a) * r, math.sin(a) * r
end

-- детерминированный генератор для тестов
local function makeRng(seed: number): () -> number
	local s = seed
	return function()
		s = (s * 16807) % 2147483647
		return s / 2147483647
	end
end

return function(t: any)
	t.test("height profile", function()
		t.eq(Layout.heightAt(2200), 0)
		t.eq(Layout.heightAt(3000), 0)
		t.eq(Layout.heightAt(1600), -60)
		t.eq(Layout.heightAt(1000), -150)
		t.eq(Layout.heightAt(600), -240)
		t.eq(Layout.heightAt(100), -330)
		t.near(Layout.heightAt(1875), -30)
	end)

	t.test("opening radius inverts height", function()
		t.eq(Layout.openingRadius(-60), 1800)
		t.eq(Layout.openingRadius(-150), 1300)
		t.eq(Layout.openingRadius(-240), 800)
		t.eq(Layout.openingRadius(-330), 360)
		t.near(Layout.openingRadius(-30), 1875)
		t.eq(Layout.openingRadius(-400), 0)
	end)

	t.test("zone by ring and sector", function()
		t.eq(Layout.zoneAt(at(1600, 46)), 1)
		t.eq(Layout.zoneAt(at(1600, 136)), 2)
		t.eq(Layout.zoneAt(at(1600, 316)), 4)
		t.eq(Layout.zoneAt(at(1600, 10)), 4)
		t.eq(Layout.zoneAt(at(1100, 31)), 5)
		t.eq(Layout.zoneAt(at(1100, 29)), 10)
		t.eq(Layout.zoneAt(at(640, 46)), 11)
		t.eq(Layout.zoneAt(at(640, 44)), 14)
		t.eq(Layout.zoneAt(0, 0), 17)
		t.eq(Layout.zoneAt(at(200, 300)), 17)
		t.eq(Layout.zoneAt(at(2200, 90)), nil)
		t.eq(Layout.zoneAt(at(1340, 90)), nil)
	end)

	t.test("paths cross the moat", function()
		t.eq(Layout.zoneAt(at(420, 45)), 15)
		t.eq(Layout.zoneAt(at(420, 225)), 16)
		t.eq(Layout.zoneAt(at(420, 135)), nil)
		t.eq(Layout.zoneAt(at(420, 52)), nil)
	end)

	t.test("every zone 1..17 has a sector", function()
		for zone = 1, 17 do
			local s = Layout.sector(zone)
			t.truthy(s ~= nil, "no sector for zone " .. zone)
		end
		t.eq(Layout.sector(17).kind, "core")
		t.eq(Layout.sector(15).kind, "path")
		t.eq(Layout.sector(1).kind, "ring")
		t.eq(Layout.sector(5).ring, 2)
	end)

	t.test("random point stays in its zone", function()
		local rng = makeRng(42)
		for zone = 1, 17 do
			for _ = 1, 200 do
				local x, z = Layout.randomPoint(zone, rng)
				t.eq(Layout.zoneAt(x, z), zone, "zone " .. zone)
			end
		end
	end)

	t.test("8 bases on the rim facing in", function()
		local bases = Layout.bases()
		t.eq(#bases, 8)
		for i, b in bases do
			t.near(math.sqrt(b.x * b.x + b.z * b.z), 2120, 1e-6)
			t.near(b.angle, math.rad((i - 1) * 45), 1e-9)
		end
	end)

	t.test("chunk angles inside sector", function()
		local angles = Layout.chunkAngles(1, 2, 1000, 4)
		t.eq(#angles, 4)
		for _, a in angles do
			t.truthy(a > 1 and a < 2)
		end
		t.near(angles[1], 1.125)
		t.near(angles[4], 1.875)
	end)

	t.test("every zone has a terrain material", function()
		local Config = require(Shared.Config) :: any
		local Zones = require(Shared.Zones) :: any
		for _, z in Zones.List do
			t.truthy(type(Config.Crater.ZoneMaterials[z.folder]) == "string", "no material for " .. z.folder)
		end
		for _, key in { "Plain", "Slope", "Cliff", "Moat", "Ramp" } do
			t.truthy(type(Config.Crater.Materials[key]) == "string", "no material for " .. key)
		end
	end)

	t.test("ramps and geysers connect the rings", function()
		local ramps = Layout.ramps()
		t.eq(#ramps, 16)
		for _, r in ramps do
			t.truthy(r.fromY > r.toY, "ramps go down")
			local slope = math.deg(math.atan((r.fromY - r.toY) / (r.fromR - r.toR)))
			t.truthy(slope <= 36, "ramp too steep: " .. slope)
		end
		local geysers = Layout.geysers()
		t.eq(#geysers, 24)
		for _, g in geysers do
			t.truthy(g.toY > g.y, "geysers go up")
		end
	end)
end
