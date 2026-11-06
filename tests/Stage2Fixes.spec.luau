--!strict
-- Исправления по обзору этапа 2: последнее значение ползунка уходит на сервер, опасные продажи
-- требуют подтверждения, продажи и награды считаются в «всего заработано».

local Shared = game:GetService("ReplicatedStorage").Shared
local SettingsQueue = require(Shared.SettingsQueue) :: any
local UiData = require(Shared.UiData) :: any
local E = require(Shared.Economy) :: any
local F = require(Shared.Formulas) :: any
local DataSchema = require(Shared.DataSchema) :: any
local Creatures = require(Shared.Catalog.Creatures) :: any
local Config = require(Shared.Config) :: any

return function(t: any)
	t.test("slider sends only the last value", function()
		local q = SettingsQueue.new()
		t.eq(q.push("sfx", 10), true) -- первое значение — запланировать отправку
		t.eq(q.push("sfx", 20), false)
		t.eq(q.push("sfx", 0), false)
		t.eq(q.push("music", 50), true)
		t.eq(q.take("sfx"), 0)
		t.eq(q.take("sfx"), nil)
		t.eq(q.push("sfx", 5), true)
	end)

	t.test("selling Legendary or better needs confirmation", function()
		local rows = UiData.sellRows({ { id = "W" } })
		local byRarity = {}
		for _, r in rows do
			byRarity[r.rarity] = r
		end
		t.eq(byRarity.Epic.confirm, false)
		t.eq(byRarity.Legendary.confirm, false) -- ниже Legendary — только Epic и слабее
		t.eq(byRarity.Mythic.confirm, true)
		t.eq(byRarity.Secret.confirm, true)
	end)

	t.test("sales and index rewards count as earned", function()
		local s = DataSchema.default()
		s.creatures = { { id = "W" }, { id = "L" } }
		E.sellSlot(s, 1)
		E.sellBelow(s, "Rare")
		t.eq(s.stats.earned, F.sellValue("W") + F.sellValue("L"))
		local all = {}
		for _, c in Creatures.ofRarity("Common") do
			all[c.id] = true
		end
		s.collection = all
		local before = s.stats.earned
		E.claimIndex(s, "Common")
		t.eq(s.stats.earned, before + Config.IndexRewards.Common)
	end)
end
