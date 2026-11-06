--!strict
-- Данные для окон: строки улучшений, перерождение, индекс, продажа.

local Shared = game:GetService("ReplicatedStorage").Shared
local UiData = require(Shared.UiData) :: any
local DataSchema = require(Shared.DataSchema) :: any
local Creatures = require(Shared.Catalog.Creatures) :: any
local Rarity = require(Shared.Rarity) :: any
local F = require(Shared.Formulas) :: any

local function byId(rows: { any }, id: string): any
	for _, r in rows do
		if r.id == id then
			return r
		end
	end
	return nil
end

return function(t: any)
	t.test("upgrade rows states", function()
		local s = DataSchema.default()
		s.money = 100
		local rows = UiData.upgradeRows(s)
		t.eq(#rows, 2)
		t.eq(byId(rows, "Strength").state, "go")
		t.eq(byId(rows, "Strength").price, "$150")
		s.money = 600
		rows = UiData.upgradeRows(s)
		t.eq(byId(rows, "Strength").state, "ready")
		t.eq(byId(rows, "Slots").state, "ready")
		t.eq(byId(rows, "Slots").have, 6)
		t.eq(byId(rows, "Slots").need, 24)
		s.strength = 20
		rows = UiData.upgradeRows(s)
		t.eq(byId(rows, "Strength").state, "done")
		t.eq(byId(rows, "Strength").price, nil)
	end)

	t.test("rebirth view text", function()
		local v = UiData.rebirthView(12000, 0)
		t.eq({ v.from, v.to, v.gainFrom, v.gainTo }, { "Rebirth 0", "Rebirth 1", "x1 Money", "x1.5 Money" })
		t.near(v.barFrac, 0.48)
		t.eq(v.ready, false)
		t.eq(v.barText, "$12K/$25K")
		local w = UiData.rebirthView(30000, 0)
		t.eq(w.ready, true)
		t.eq(w.barFrac, 1)
		t.eq(UiData.rebirthView(0, 1).gainTo, "x2 Money")
	end)

	t.test("index groups by rarity", function()
		local first = Creatures.ofRarity("Common")[1].id
		local sections = UiData.indexSections({ [first] = true })
		t.eq(#sections, #Rarity.Order)
		local total = 0
		for i, sec in sections do
			t.eq(sec.rarity, Rarity.Order[i])
			total += sec.total
			t.eq(#sec.items, sec.total)
		end
		t.eq(total, #Creatures.List)
		t.eq(sections[1].found, 1)
		t.eq(sections[1].items[1].found, true)
		t.eq(sections[1].items[1].income, "$" .. F.formatMoney(F.creatureIncome(first)) .. "/s")
	end)

	t.test("sell rows count weaker", function()
		local rare = Creatures.ofRarity("Rare")[1].id
		local rows = UiData.sellRows({ { id = "W" }, { id = "L", mutation = "Golden" }, { id = rare } })
		t.eq(#rows, #Rarity.Order - 1)
		t.eq(rows[1].rarity, "Rare")
		t.eq(rows[1].count, 2)
		t.eq(rows[1].total, F.sellValue("W") + F.sellValue("L", "Golden"))
		t.eq(rows[2].rarity, "Epic")
		t.eq(rows[2].count, 3)
	end)
end
