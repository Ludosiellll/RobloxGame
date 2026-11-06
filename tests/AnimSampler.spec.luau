--!strict
-- Выборка кадров для своего проигрывателя анимаций.

local Shared = game:GetService("ReplicatedStorage").Shared
local AnimSampler = require(Shared.AnimSampler) :: any

return function(t: any)
	t.test("locate between frames", function()
		local a, b, alpha = AnimSampler.locate({ 0, 0.5, 1 }, 0.25, false)
		t.eq({ a, b }, { 1, 2 })
		t.near(alpha, 0.5)
	end)

	t.test("locate loops", function()
		local a, b, alpha = AnimSampler.locate({ 0, 0.5, 1 }, 1.25, true)
		t.eq({ a, b }, { 1, 2 })
		t.near(alpha, 0.5)
	end)

	t.test("locate clamps without loop", function()
		local a, b, alpha = AnimSampler.locate({ 0, 0.5, 1 }, 5, false)
		t.eq({ a, b, alpha }, { 3, 3, 0 })
		local a2, b2, alpha2 = AnimSampler.locate({ 0, 0.5, 1 }, -1, false)
		t.eq({ a2, b2, alpha2 }, { 1, 1, 0 })
	end)

	t.test("locate exact frame", function()
		local a, b, alpha = AnimSampler.locate({ 0, 0.5, 1 }, 0.5, false)
		t.eq({ a, b }, { 2, 3 })
		t.near(alpha, 0)
	end)

	t.test("single frame", function()
		t.eq({ AnimSampler.locate({ 0 }, 3, true) }, { 1, 1, 0 })
	end)

	t.test("linear ease is identity", function()
		t.near(AnimSampler.ease(0.3, 0, 0), 0.3)
	end)

	t.test("constant ease holds", function()
		t.eq(AnimSampler.ease(0.7, 1, 0), 0)
	end)

	t.test("cubic in at half", function()
		t.near(AnimSampler.ease(0.5, 3, 0), 0.125)
		t.near(AnimSampler.ease(0.5, 3, 1), 0.875)
		t.near(AnimSampler.ease(0.5, 3, 2), 0.5)
	end)

	t.test("ease stays in 0..1 at ends", function()
		for style = 0, 5 do
			for direction = 0, 2 do
				if style ~= 1 then
					t.near(AnimSampler.ease(0, style, direction), 0, 1e-6)
					t.near(AnimSampler.ease(1, style, direction), 1, 1e-6)
				end
			end
		end
	end)
end
