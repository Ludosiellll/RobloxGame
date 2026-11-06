--!strict
-- Данные игры: редкости, мутации, зоны, каталог существ.

local Shared = game:GetService("ReplicatedStorage").Shared
local Rarity = require(Shared.Rarity) :: any
local Zones = require(Shared.Zones) :: any
local Creatures = require(Shared.Catalog.Creatures) :: any

local RANGES = {
	Common = { 1, 4 },
	Rare = { 6, 14 },
	Epic = { 25, 60 },
	Legendary = { 120, 300 },
	Mythic = { 600, 1500 },
	Secret = { 3000, 8000 },
}

return function(t: any)
	t.test("63 unique creatures", function()
		t.eq(#Creatures.List, 63)
		local seen = {}
		for _, c in Creatures.List do
			t.truthy(not seen[c.id], "duplicate id " .. c.id)
			seen[c.id] = true
		end
	end)

	t.test("rarity counts", function()
		local counts = {}
		for _, c in Creatures.List do
			counts[c.rarity] = (counts[c.rarity] or 0) + 1
		end
		t.eq(counts, { Common = 17, Rare = 16, Epic = 12, Legendary = 9, Mythic = 6, Secret = 3 })
	end)

	t.test("income inside tier range", function()
		for _, c in Creatures.List do
			local r = RANGES[c.rarity]
			t.truthy(r ~= nil, "unknown rarity " .. tostring(c.rarity))
			t.truthy(c.income >= r[1] and c.income <= r[2], c.id .. " income " .. c.income .. " outside " .. c.rarity)
		end
	end)

	t.test("byId and ofRarity", function()
		t.eq(Creatures.byId("TralaleroTralala").rarity, "Mythic")
		t.eq(Creatures.byId("69"), nil)
		t.eq(#Creatures.ofRarity("Secret"), 3)
	end)

	t.test("every rarity has weight somewhere", function()
		for _, r in Rarity.Order do
			local total = 0
			for _, z in Zones.List do
				total += z.weights[r] or 0
			end
			t.truthy(total > 0, r .. " never drops")
		end
	end)

	t.test("zone 1 has no Legendary+", function()
		local w = Zones.List[1].weights
		t.eq((w.Legendary or 0) + (w.Mythic or 0) + (w.Secret or 0), 0)
	end)

	t.test("Secret only in zones 11+", function()
		for i, z in Zones.List do
			if i < 11 then
				t.eq(z.weights.Secret or 0, 0, z.folder)
			else
				t.truthy((z.weights.Secret or 0) > 0, z.folder)
			end
		end
	end)

	t.test("17 zones, gates 0,0,0,0,1..13", function()
		t.eq(#Zones.List, 17)
		for i, z in Zones.List do
			t.eq(z.gate, math.max(0, i - 4), z.folder)
		end
		t.eq(Zones.List[1].folder, "Forest")
		t.eq(Zones.List[17].folder, "NuclearWasteland")
		local index, def = Zones.byFolder("Hell")
		t.eq(index, 11)
		t.eq(def.display, "Hell")
	end)

	t.test("mutation mult", function()
		t.eq(Rarity.mutationMult("Lava"), 4)
		t.eq(Rarity.mutationMult(nil), 1)
		t.eq(#Rarity.Mutations, 5)
		t.eq(Rarity.Mutations[1].name, "Golden")
	end)

	t.test("rarity order and index", function()
		t.eq(Rarity.Order, { "Common", "Rare", "Epic", "Legendary", "Mythic", "Secret" })
		t.eq(Rarity.index("Epic"), 3)
		t.eq(Rarity.Info.Secret.carry, 0.4)
		t.eq(Rarity.Info.Mythic.announce, true)
	end)
end
