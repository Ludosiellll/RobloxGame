--!strict
-- Проверки самой тестовой системы.

return function(t: any)
	t.test("eq compares tables deeply", function()
		t.eq({ a = { 1, 2 } }, { a = { 1, 2 } })
	end)

	t.test("near tolerates float error", function()
		t.near(0.1 + 0.2, 0.3)
	end)

	t.test("shared module loads", function()
		local Config = require(game:GetService("ReplicatedStorage").Shared.Config) :: any
		t.eq(Config.Version, "0.1.0")
	end)
end
