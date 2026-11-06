--!strict
-- Стены ворот: какие ставить игроку с данным числом перерождений.

local Shared = game:GetService("ReplicatedStorage").Shared
local Layout = require(Shared.CraterLayout) :: any

local function count(walls: { any }, kind: string): number
	local n = 0
	for _, w in walls do
		if w.kind == kind then
			n += 1
		end
	end
	return n
end

return function(t: any)
	t.test("no walls when everything is open", function()
		t.eq(#Layout.gateWalls(13), 0)
	end)

	t.test("ring 1 is never walled", function()
		for _, w in Layout.gateWalls(0) do
			t.truthy(w.zone > 4, "wall for open zone " .. w.zone)
		end
	end)

	t.test("locked sectors get both borders", function()
		local walls = Layout.gateWalls(0)
		local s = Layout.sector(5)
		local found0, found1 = false, false
		for _, w in walls do
			if w.kind == "radial" then
				if math.abs(math.cos(w.angle) - math.cos(s.a0)) < 1e-9 and math.abs(math.sin(w.angle) - math.sin(s.a0)) < 1e-9 then
					found0 = true
				end
				if math.abs(math.cos(w.angle) - math.cos(s.a1)) < 1e-9 and math.abs(math.sin(w.angle) - math.sin(s.a1)) < 1e-9 then
					found1 = true
				end
			end
		end
		t.truthy(found0 and found1)
	end)

	t.test("radial borders are not duplicated", function()
		-- кольцо 2 — 6 границ, кольцо 3 — 4
		t.eq(count(Layout.gateWalls(0), "radial"), 10)
	end)

	t.test("ramps into locked sectors are blocked", function()
		t.eq(count(Layout.gateWalls(0), "ramp"), 16)
		t.eq(count(Layout.gateWalls(6), "ramp"), 8)
	end)

	t.test("paths and core", function()
		local walls = Layout.gateWalls(10)
		t.eq(count(walls, "path"), 2)
		t.eq(count(walls, "core"), 2)
		local open = Layout.gateWalls(12)
		t.eq(count(open, "path"), 0)
		t.eq(count(open, "core"), 2)
	end)

	t.test("canEnter follows gates", function()
		t.eq(Layout.canEnter(0, 4), true)
		t.eq(Layout.canEnter(0, 5), false)
		t.eq(Layout.canEnter(1, 5), true)
		t.eq(Layout.canEnter(12, 17), false)
		t.eq(Layout.canEnter(13, 17), true)
		t.eq(Layout.canEnter(0, nil), true)
	end)
end
