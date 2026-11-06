--!strict
-- Питомцы и яйца: каталог, вылупление, покупка, экипировка, бонусы, беговые дорожки.

local Shared = game:GetService("ReplicatedStorage").Shared
local Pets = require(Shared.Pets) :: any
local PetCatalog = require(Shared.Catalog.Pets) :: any
local Eggs = require(Shared.Catalog.Eggs) :: any
local DataSchema = require(Shared.DataSchema) :: any
local Config = require(Shared.Config) :: any

local function rng(seed: number): () -> number
	local s = seed
	return function()
		s = (s * 1103515245 + 12345) % 2147483648
		return s / 2147483648
	end
end

local function save(): any
	return DataSchema.default()
end

return function(t: any)
	t.test("catalog covers every egg", function()
		t.eq(#Eggs.List, 11)
		local seen = {}
		for _, egg in Eggs.List do
			t.truthy(#PetCatalog.ofEgg(egg.id) >= 5, egg.id .. " has too few pets")
		end
		for _, p in PetCatalog.List do
			t.eq(seen[p.id], nil, "duplicate pet " .. p.id)
			seen[p.id] = true
			t.truthy(Eggs.byId(p.egg) ~= nil, "pet " .. p.id .. " has unknown egg")
			t.truthy(p.bonus == "speed" or p.bonus == "luck" or p.bonus == "income", "bad bonus")
		end
	end)

	t.test("hatch picks a pet of that egg", function()
		local r = rng(7)
		for _ = 1, 50 do
			local id = Pets.hatch("Pastel", r)
			t.eq(PetCatalog.byId(id).egg, "Pastel")
		end
		t.eq(Pets.hatch("Nope", r), nil)
	end)

	t.test("buy egg rejects", function()
		local s = save()
		s.money = 500
		t.eq({ Pets.buyEgg(s, "Colorful", rng(1)) }, { false, "money" })
		s.money = 1e9
		t.eq({ Pets.buyEgg(s, "Fruity", rng(1)) }, { false, "locked" })
		t.eq({ Pets.buyEgg(s, "Nope", rng(1)) }, { false, "unknown" })
		for i = 1, Config.Pets.MaxOwned do
			table.insert(s.pets, { uid = i, id = "Red" })
		end
		t.eq({ Pets.buyEgg(s, "Colorful", rng(1)) }, { false, "full" })
		t.eq(s.money, 1e9)
		t.eq(#s.pets, Config.Pets.MaxOwned)
	end)

	t.test("buy egg adds pet and spends", function()
		local s = save()
		s.money = 1500
		local ok, petId = Pets.buyEgg(s, "Colorful", rng(3))
		t.eq(ok, true)
		t.eq(PetCatalog.byId(petId).egg, "Colorful")
		t.eq(s.money, 500)
		t.eq(#s.pets, 1)
		t.eq(s.pets[1].id, petId)
		t.eq(s.pets[1].uid, 1)
		t.eq(s.nextPetUid, 2)
	end)

	t.test("equip limits", function()
		local s = save()
		for i = 1, 5 do
			table.insert(s.pets, { uid = i, id = "Red" })
		end
		for i = 1, 3 do
			t.eq(Pets.equip(s, i), true)
		end
		t.eq({ Pets.equip(s, 4) }, { false, "limit" })
		t.eq({ Pets.equip(s, 99) }, { false, "unknown" })
		t.eq(Pets.equip(s, 1), true)
		t.eq(#s.equipped, 3)
		t.eq(Pets.unequip(s, 2), true)
		t.eq(Pets.unequip(s, 2), false)
		t.eq(Pets.equip(s, 4), true)
	end)

	t.test("bonuses sum equipped only", function()
		local s = save()
		local speedPet, luckPet
		for _, p in PetCatalog.List do
			if p.bonus == "speed" and not speedPet then
				speedPet = p
			elseif p.bonus == "luck" and not luckPet then
				luckPet = p
			end
		end
		s.pets = { { uid = 1, id = speedPet.id }, { uid = 2, id = luckPet.id }, { uid = 3, id = speedPet.id } }
		s.equipped = { 1, 2 }
		local b = Pets.bonuses(s)
		t.near(b.speed, Config.Pets.Bonus[speedPet.rarity])
		t.near(b.luck, Config.Pets.Bonus[luckPet.rarity])
		t.eq(b.income, 0)
	end)

	t.test("treadmill gain", function()
		t.near(Pets.treadmillGain(1, 1), 0.2)
		t.near(Pets.treadmillGain(3, 1), 0.45)
		t.eq(Pets.treadmillGain(1, 5), 0)
		t.eq(Pets.treadmillGain(1, 0), 0)
		t.eq(Pets.treadmillGain(16, 1), 0)
	end)

	t.test("treadmill unlock", function()
		t.eq(Pets.treadmillOpen(1, 0), true)
		t.eq(Pets.treadmillOpen(4, 2), false)
		t.eq(Pets.treadmillOpen(4, 3), true)
	end)

	t.test("base treadmills best three", function()
		t.eq(Pets.baseTreadmills(0), { 1 })
		t.eq(Pets.baseTreadmills(1), { 2, 1 })
		t.eq(Pets.baseTreadmills(5), { 6, 5, 4 })
		t.eq(Pets.baseTreadmills(99), { 15, 14, 13 })
	end)

	t.test("sanitize drops unknown equipped", function()
		local s = save()
		s.speed = 3.14159
		s.pets = { { uid = 1, id = "Red" }, { uid = 2, id = "NotAPet" }, { uid = "x", id = "Red" }, { uid = 7, id = "Blue" } }
		s.equipped = { 1, 2, 7, 7, 99 }
		s.nextPetUid = 1
		local c = DataSchema.sanitize(s)
		t.eq(#c.pets, 2)
		t.eq(c.equipped, { 1, 7 })
		t.eq(c.nextPetUid, 8)
		t.near(c.speed, 3.14, 1e-9)
	end)
end
