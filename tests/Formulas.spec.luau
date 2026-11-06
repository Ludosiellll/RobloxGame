--!strict
-- Формулы: доход, офлайн-доход, переноска, замена существ, толчок, скорость, формат денег.

local Shared = game:GetService("ReplicatedStorage").Shared
local F = require(Shared.Formulas) :: any

return function(t: any)
	t.test("income with mutation and rebirths", function()
		-- SickPenguini приносит 10/с; Golden ×2; 2 перерождения дают ×2
		t.eq(F.incomePerSecond({ { id = "SickPenguini", mutation = "Golden" } }, 2, 1), 40)
		t.eq(F.incomePerSecond({}, 5, 1), 0)
		t.eq(F.incomePerSecond({ { id = "67" }, { id = "67" } }, 0, 2), 16)
	end)

	t.test("creature income and sell value", function()
		t.eq(F.creatureIncome("TralaleroTralala", nil), 1500)
		t.eq(F.creatureIncome("TralaleroTralala", "Rainbow"), 15000)
		t.eq(F.sellValue("67", "Lava"), 4 * 4 * 60)
	end)

	t.test("offline capped at 8h", function()
		t.eq(F.offlineEarnings(100, 10 * 3600), 1_440_000)
		t.eq(F.offlineEarnings(100, 60), 3000)
	end)

	t.test("offline negative time", function()
		t.eq(F.offlineEarnings(100, -50), 0)
	end)

	t.test("carry multiplier at max strength halves penalty", function()
		t.near(F.carryMultiplier("Secret", 20), 0.70)
		t.near(F.carryMultiplier("Secret", 0), 0.40)
		t.near(F.carryMultiplier("Secret", 99), 0.70)
		t.near(F.carryMultiplier("Common", 0), 0.90)
	end)

	t.test("place when free", function()
		local action, index = F.placeOrReplace({ { id = "67" } }, 2, { id = "W" })
		t.eq(action, "place")
		t.eq(index, nil)
	end)

	t.test("replace weakest counts mutation", function()
		-- Common «67» с Diamond приносит 12, Rare «TimCheese» без мутации — 6: слабее TimCheese
		local slots = { { id = "67", mutation = "Diamond" }, { id = "TimCheese" } }
		local action, index = F.placeOrReplace(slots, 2, { id = "SigmaBoy" })
		t.eq(action, "replace")
		t.eq(index, 2)
	end)

	t.test("sell when not better", function()
		local slots = { { id = "SigmaBoy" }, { id = "UdinDinDinDun" } }
		local action, index = F.placeOrReplace(slots, 2, { id = "W" })
		t.eq(action, "sell")
		t.eq(index, nil)
	end)

	t.test("spawn hit blocked for water", function()
		t.eq(F.isSpawnHitAllowed("SwampWater"), false)
		t.eq(F.isSpawnHitAllowed("waterfall"), false)
		t.eq(F.isSpawnHitAllowed("Grass"), true)
		t.eq(F.isSpawnHitAllowed("Terrain"), true)
	end)

	t.test("push rejects behind target", function()
		t.eq(F.pushAllowed(0, 5, 0, -1, 0, false), false)
	end)

	t.test("push rejects safe target", function()
		t.eq(F.pushAllowed(0, -5, 0, -1, 0, true), false)
	end)

	t.test("push accepts in cone", function()
		t.eq(F.pushAllowed(0, -5, 0, -1, 0, false), true)
		t.eq(F.pushAllowed(2, -5, 0, -1, 0, false), true)
	end)

	t.test("push rejects wide angle, far target and cooldown", function()
		t.eq(F.pushAllowed(5, -5, 0, -1, 0, false), false)
		t.eq(F.pushAllowed(0, -9, 0, -1, 0, false), false)
		t.eq(F.pushAllowed(0, -5, 0, -1, 0.5, false), false)
	end)

	t.test("speed check", function()
		t.eq(F.speedSuspicious(40, 0.5, 22), true)
		t.eq(F.speedSuspicious(12, 0.5, 22), false)
	end)

	t.test("drop despawn time", function()
		t.eq(F.dropDespawnAt(100), 130)
	end)

	t.test("formatMoney", function()
		t.eq(F.formatMoney(999), "999")
		t.eq(F.formatMoney(1000), "1K")
		t.eq(F.formatMoney(1200), "1.2K")
		t.eq(F.formatMoney(999_950), "999.9K")
		t.eq(F.formatMoney(3_400_000), "3.4M")
		t.eq(F.formatMoney(5.6e9), "5.6B")
		t.eq(F.formatMoney(7e12), "7T")
		t.eq(F.formatMoney(0), "0")
	end)
end
