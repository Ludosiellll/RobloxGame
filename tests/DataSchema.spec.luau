--!strict
-- Данные игрока: значения по умолчанию, миграция старых сохранений, очистка, покупки.

local Shared = game:GetService("ReplicatedStorage").Shared
local DataSchema = require(Shared.DataSchema) :: any

return function(t: any)
	t.test("default has start slots", function()
		local d = DataSchema.default()
		t.eq(d.version, 1)
		t.eq(d.money, 0)
		t.eq(d.rebirths, 0)
		t.eq(d.slots, 6)
		t.eq(d.creatures, {})
		t.eq(d.receipts, {})
		t.eq(d.stats, { caught = 0, pushes = 0, bestCatch = 0, earned = 0 })
	end)

	t.test("migrate nil gives default", function()
		t.eq(DataSchema.migrate(nil), DataSchema.default())
		t.eq(DataSchema.migrate("garbage"), DataSchema.default())
	end)

	t.test("migrate keeps known values and fills missing", function()
		local d = DataSchema.migrate({ money = 500, rebirths = 2, extra = "kept" })
		t.eq(d.money, 500)
		t.eq(d.rebirths, 2)
		t.eq(d.slots, 6)
		t.eq(d.stats.caught, 0)
		t.eq(d.extra, "kept")
		t.eq(d.version, 1)
	end)

	t.test("sanitize drops unknown creatures and mutations", function()
		local d = DataSchema.default()
		d.creatures = { { id = "67" }, { id = "NoSuchThing" }, { id = "W", mutation = "Weird" }, { id = "L", mutation = "Golden" } }
		d.collection = { ["67"] = true, NoSuchThing = true }
		local s = DataSchema.sanitize(d)
		t.eq(s.creatures, { { id = "67" }, { id = "W" }, { id = "L", mutation = "Golden" } })
		t.eq(s.collection, { ["67"] = true })
	end)

	t.test("sanitize trims creatures to slots", function()
		local d = DataSchema.default()
		d.slots = 6
		for _ = 1, 9 do
			table.insert(d.creatures, { id = "67" })
		end
		t.eq(#DataSchema.sanitize(d).creatures, 6)
		d.slots = 99
		t.eq(DataSchema.sanitize(d).slots, 24)
		d.slots = 1
		t.eq(DataSchema.sanitize(d).slots, 6)
	end)

	t.test("sanitize clamps money", function()
		local d = DataSchema.default()
		d.money = -5
		t.eq(DataSchema.sanitize(d).money, 0)
		d.money = 12.7
		t.eq(DataSchema.sanitize(d).money, 12)
		d.money = 0 / 0
		t.eq(DataSchema.sanitize(d).money, 0)
		d.rebirths = -1
		t.eq(DataSchema.sanitize(d).rebirths, 0)
	end)

	t.test("receipt dedupe", function()
		local d = DataSchema.default()
		t.eq(DataSchema.addReceipt(d, "abc"), true)
		t.eq(DataSchema.addReceipt(d, "abc"), false)
		t.eq(#d.receipts, 1)
	end)

	t.test("receipts keep last 50", function()
		local d = DataSchema.default()
		for i = 1, 60 do
			DataSchema.addReceipt(d, "r" .. i)
		end
		t.eq(#d.receipts, 50)
		t.eq(d.receipts[1], "r11")
		t.eq(d.receipts[50], "r60")
	end)
end
