--!strict
-- Площадки на базе: сетка PadCols × 4, центр сетки в центре базы.
-- База смотрит на центр кратера (−Z — вперёд), поэтому «передний левый» — наименьшие x и z.

local Shared = game:GetService("ReplicatedStorage").Shared
local F = require(Shared.Formulas) :: any
local Config = require(Shared.Config) :: any

local B = Config.Base

return function(t: any)
	t.test("pad 1 is front-left", function()
		local x1, z1 = F.padOffset(1)
		t.truthy(x1 < 0 and z1 < 0, "pad 1 should be left (x<0) and front (z<0)")
		for i = 2, B.SlotsMax do
			local x, z = F.padOffset(i)
			t.truthy(x1 <= x and z1 <= z, "pad " .. i .. " is further left or front than pad 1")
		end
	end)

	t.test("pads stay inside base", function()
		for i = 1, B.SlotsMax do
			local x, z = F.padOffset(i)
			t.truthy(math.abs(x) <= B.Width / 2 - 3, "pad " .. i .. " x out of base")
			t.truthy(math.abs(z) <= B.Depth / 2 - 3, "pad " .. i .. " z out of base")
		end
	end)

	t.test("pads unique", function()
		local seen = {}
		for i = 1, B.SlotsMax do
			local x, z = F.padOffset(i)
			local key = x .. ":" .. z
			t.eq(seen[key], nil, "pad " .. i .. " repeats " .. key)
			seen[key] = true
		end
	end)

	t.test("inside base: footprint and safe height", function()
		t.eq(F.insideBase(0, 0, 0), true)
		t.eq(F.insideBase(B.Width / 2 - 0.1, 5, -(B.Depth / 2 - 0.1)), true)
		t.eq(F.insideBase(B.Width / 2 + 0.1, 5, 0), false)
		t.eq(F.insideBase(0, 5, B.Depth / 2 + 0.1), false)
		t.eq(F.insideBase(0, B.SafeZoneHeight + 1, 0), false)
		t.eq(F.insideBase(0, -6, 0), false)
	end)

	t.test("pads fill rows left to right, front row first", function()
		local x1, z1 = F.padOffset(1)
		local x2, z2 = F.padOffset(2)
		t.near(z2, z1)
		t.near(x2 - x1, B.PadSpacing)
		local _, zNext = F.padOffset(B.PadCols + 1)
		t.near(zNext - z1, B.PadSpacing)
	end)
end
