--!strict
-- Ограничение частоты запросов: ведро токенов на ключ (игрок + вид запроса).

local Shared = game:GetService("ReplicatedStorage").Shared
local RateLimit = require(Shared.RateLimit) :: any

return function(t: any)
	t.test("allows burst then limits", function()
		local rl = RateLimit.new(4, 3)
		t.eq({ rl.allow("a", 0), rl.allow("a", 0), rl.allow("a", 0) }, { true, true, true })
		t.eq(rl.allow("a", 0), false)
	end)

	t.test("refills over time", function()
		local rl = RateLimit.new(4, 2)
		rl.allow("a", 0)
		rl.allow("a", 0)
		t.eq(rl.allow("a", 0.1), false)
		t.eq(rl.allow("a", 0.3), true) -- 0.3 с × 4/с = 1.2 токена
		t.eq(rl.allow("a", 0.3), false)
		t.eq(rl.allow("a", 100), true)
		t.eq(rl.allow("a", 100), true)
		t.eq(rl.allow("a", 100), false) -- не больше burst
	end)

	t.test("keys independent", function()
		local rl = RateLimit.new(1, 1)
		t.eq(rl.allow("a", 0), true)
		t.eq(rl.allow("b", 0), true)
		t.eq(rl.allow("a", 0), false)
		rl.forget("a")
		t.eq(rl.allow("a", 0), true)
	end)
end
