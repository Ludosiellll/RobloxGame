--!strict
-- Случайные выборы: редкость по зоне и удаче, мутации, существо.

local Shared = game:GetService("ReplicatedStorage").Shared
local Roll = require(Shared.Roll) :: any
local Creatures = require(Shared.Catalog.Creatures) :: any

local function makeRng(seed: number): () -> number
	local s = seed
	return function()
		s = (s * 16807) % 2147483647
		return s / 2147483647
	end
end

local function const(v: number): () -> number
	return function()
		return v
	end
end

return function(t: any)
	t.test("weighted picks by cumulative weight", function()
		t.eq(Roll.weighted({ A = 1, B = 3 }, { "A", "B" }, const(0.2)), "A")
		t.eq(Roll.weighted({ A = 1, B = 3 }, { "A", "B" }, const(0.3)), "B")
		t.eq(Roll.weighted({ A = 0, B = 0 }, { "A", "B" }, const(0.5)), nil)
	end)

	t.test("zone 1 never rolls Legendary", function()
		local rng = makeRng(7)
		for _ = 1, 10000 do
			local r = Roll.rarity(1, 1, rng)
			t.truthy(r == "Common" or r == "Rare" or r == "Epic", r)
		end
	end)

	t.test("luck shifts away from Common", function()
		local function commonShare(luck: number): number
			local rng = makeRng(99)
			local n = 0
			for _ = 1, 5000 do
				if Roll.rarity(3, luck, rng) == "Common" then
					n += 1
				end
			end
			return n / 5000
		end
		t.truthy(commonShare(2) < commonShare(1) - 0.1, "luck 2 should cut Common noticeably")
	end)

	t.test("mutation chance grows with zone", function()
		local function count(zone: number): number
			local rng = makeRng(5)
			local n = 0
			for _ = 1, 20000 do
				if Roll.mutation(zone, 1, rng) then
					n += 1
				end
			end
			return n
		end
		t.truthy(count(17) > count(1) * 1.5)
	end)

	t.test("rarest mutation wins", function()
		t.eq(Roll.mutation(1, 1, const(0)), "Rainbow")
		t.eq(Roll.mutation(1, 1, const(0.999)), nil)
	end)

	t.test("creature matches rarity", function()
		local rng = makeRng(3)
		for _, rarity in { "Common", "Rare", "Epic", "Legendary", "Mythic", "Secret" } do
			for _ = 1, 50 do
				t.eq(Creatures.byId(Roll.creature(rarity, rng)).rarity, rarity)
			end
		end
	end)

	t.test("meteor roll is consistent", function()
		local rng = makeRng(11)
		for _ = 1, 200 do
			local m = Roll.meteor(12, 1, rng)
			t.eq(Creatures.byId(m.creatureId).rarity, m.rarity)
		end
	end)
end
