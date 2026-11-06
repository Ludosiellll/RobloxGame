--!strict
-- Экономика этапа 2: улучшения, перерождение, продажа, заработок, настройки, награды индекса.

local Shared = game:GetService("ReplicatedStorage").Shared
local E = require(Shared.Economy) :: any
local F = require(Shared.Formulas) :: any
local DataSchema = require(Shared.DataSchema) :: any
local Creatures = require(Shared.Catalog.Creatures) :: any
local Config = require(Shared.Config) :: any

local function save(overrides: { [string]: any }?): any
	local s = DataSchema.default()
	for k, v in overrides or {} do
		s[k] = v
	end
	return s
end

return function(t: any)
	t.test("strength price grows", function()
		t.eq(E.upgradePrice("Strength", save({ strength = 0 })), 150)
		t.eq(E.upgradePrice("Strength", save({ strength = 1 })), 232)
	end)

	t.test("strength max", function()
		local s = save({ strength = 20, money = 1e12 })
		t.eq(E.upgradePrice("Strength", s), nil)
		local ok, why = E.buyUpgrade(s, "Strength")
		t.eq({ ok, why }, { false, "max" })
		t.eq(s.money, 1e12)
	end)

	t.test("slots price", function()
		t.eq(E.upgradePrice("Slots", save({ slots = 6 })), 500)
		t.eq(E.upgradePrice("Slots", save({ slots = 7 })), 900)
		t.eq(E.upgradePrice("Slots", save({ slots = 24 })), nil)
	end)

	t.test("buy spends money once", function()
		local s = save({ money = 1000 })
		local ok = E.buyUpgrade(s, "Slots")
		t.eq(ok, true)
		t.eq(s.slots, 7)
		t.eq(s.money, 500)
	end)

	t.test("second buy without money fails", function()
		local s = save({ money = 200 })
		t.eq(E.buyUpgrade(s, "Strength"), true)
		local ok, why = E.buyUpgrade(s, "Strength")
		t.eq({ ok, why }, { false, "money" })
		t.eq(s.money, 50)
		t.eq(s.strength, 1)
		t.eq(E.buyUpgrade(s, "Nope"), false)
	end)

	t.test("rebirth cost", function()
		t.eq(E.rebirthCost(0), 25000)
		t.eq(E.rebirthCost(2), 225000)
	end)

	t.test("rebirth resets and keeps", function()
		local s = save({ money = 30000, strength = 5, slots = 10, speed = 7, creatures = { { id = "W" } }, collection = { W = true } })
		s.stats.caught = 4
		t.eq(E.rebirth(s), true)
		t.eq({ s.money, s.strength, s.slots, #s.creatures, s.rebirths }, { 0, 0, Config.Base.SlotsStart, 0, 1 })
		t.eq(s.speed, 7)
		t.eq(s.collection.W, true)
		t.eq(s.stats.caught, 4)
	end)

	t.test("rebirth without money fails", function()
		local s = save({ money = 24999, strength = 3 })
		local ok, why = E.rebirth(s)
		t.eq({ ok, why }, { false, "money" })
		t.eq({ s.money, s.strength, s.rebirths }, { 24999, 3, 0 })
	end)

	t.test("sell slot out of range", function()
		local s = save({ money = 5, creatures = { { id = "W" } } })
		for _, bad in { 0, 99, 1.5, -1 } do
			local ok, got = E.sellSlot(s, bad)
			t.eq({ ok, got }, { false, 0 })
		end
		t.eq(#s.creatures, 1)
		t.eq(s.money, 5)
	end)

	t.test("sell slot pays sell value and shifts", function()
		local s = save({ creatures = { { id = "W" }, { id = "SickPenguini", mutation = "Golden" }, { id = "L" } } })
		local ok, got = E.sellSlot(s, 2)
		t.eq(ok, true)
		t.eq(got, F.sellValue("SickPenguini", "Golden"))
		t.eq(s.money, got)
		t.eq({ s.creatures[1].id, s.creatures[2].id }, { "W", "L" })
	end)

	t.test("sell below rarity", function()
		local epic = Creatures.ofRarity("Epic")[1].id
		local rare = Creatures.ofRarity("Rare")[1].id
		local s = save({ creatures = { { id = "W" }, { id = rare }, { id = epic } } })
		local count, total = E.sellBelow(s, "Epic")
		t.eq(count, 2)
		t.eq(total, F.sellValue("W") + F.sellValue(rare))
		t.eq(#s.creatures, 1)
		t.eq(s.creatures[1].id, epic)
		t.eq({ E.sellBelow(s, "Nope") }, { 0, 0 })
	end)

	t.test("earn counts total", function()
		local s = save({ money = 10 })
		E.earn(s, 90)
		t.eq(s.money, 100)
		t.eq(s.stats.earned, 90)
	end)

	t.test("setting rejects bad values", function()
		t.eq(E.setting("music", 150), nil)
		t.eq(E.setting("music", 40), 40)
		t.eq(E.setting("sfx", -1), nil)
		t.eq(E.setting("music", "x"), nil)
		t.eq(E.setting("music", nil), nil)
		t.eq(E.setting("shake", false), false)
		t.eq(E.setting("lowDetail", 1), nil)
		t.eq(E.setting(string.rep("a", 10000), true), nil)
		t.eq(E.setting("unknown", true), nil)
	end)

	t.test("index claim once", function()
		local all = {}
		for _, c in Creatures.ofRarity("Common") do
			all[c.id] = true
		end
		local s = save({ collection = all })
		local ok, got = E.claimIndex(s, "Common")
		t.eq({ ok, got }, { true, Config.IndexRewards.Common })
		t.eq(s.money, Config.IndexRewards.Common)
		t.eq({ E.claimIndex(s, "Common") }, { false, 0 })
		t.eq({ E.claimIndex(s, "Rare") }, { false, 0 })
	end)

	t.test("sanitize keeps earned and drops bad settings", function()
		local s = save()
		s.stats.earned = 12.7
		s.settings = { music = 50, junk = "x", shake = "yes" }
		s.indexClaimed = { Common = true, Bogus = true }
		local clean = DataSchema.sanitize(s)
		t.eq(clean.stats.earned, 12)
		t.eq(clean.settings, { music = 50 })
		t.eq(clean.indexClaimed, { Common = true })
	end)
end
