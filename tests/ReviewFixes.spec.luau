--!strict
-- Исправления по итогам обзора этапа 1: проверка перемещения при переноске, дальность эффектов,
-- поверхность для точки падения.

local Shared = game:GetService("ReplicatedStorage").Shared
local F = require(Shared.Formulas) :: any
local Config = require(Shared.Config) :: any

return function(t: any)
	t.test("teleport into base is not a legal move", function()
		t.eq(F.moveAllowed(500, 0.2, 22, math.huge), false)
		t.eq(F.moveAllowed(22 * 0.2, 0.2, 22, math.huge), true)
	end)

	t.test("geyser window allows flight speed but not teleports", function()
		local speed = Config.Carry.GeyserSpeed
		t.eq(F.moveAllowed(speed * 0.5, 0.5, 22, 1), true)
		t.eq(F.moveAllowed(500, 0.2, 22, 1), false)
		-- после окна гейзера — снова обычный предел
		t.eq(F.moveAllowed(speed * 0.5, 0.5, 22, 10), false)
	end)

	t.test("meteor effects only near the camera", function()
		t.eq(F.fxLevel(100), "full")
		t.eq(F.fxLevel(Config.Fx.MaxDistance + 1), "column")
		t.eq(F.fxLevel(Config.Fx.ColumnDistance + 1), "none")
	end)

	t.test("spawn surface must be ground, not a roof or a tree", function()
		t.eq(F.spawnSurfaceOk(-60, -60, 1), true)
		t.eq(F.spawnSurfaceOk(-52.5, -60, 0.9), true)
		t.eq(F.spawnSurfaceOk(-30, -60, 1), false) -- на дереве или крыше
		t.eq(F.spawnSurfaceOk(-60, -60, 0.4), false) -- крутой склон
	end)
end
