--!strict
-- Клип анимации: из кадров KeyframeSequence — дорожки по костям, и значение кости в момент t.

local Shared = game:GetService("ReplicatedStorage").Shared
local AnimClip = require(Shared.AnimClip) :: any

local function lerp(a: number, b: number, e: number): number
	return a + (b - a) * e
end

local function pose(value: number, weight: number?)
	return { value = value, style = 0, dir = 0, weight = weight or 1 }
end

return function(t: any)
	t.test("builds per-bone tracks from unsorted keyframes", function()
		local clip = AnimClip.fromKeyframes({
			{ time = 1, poses = { Arm = pose(10), Leg = pose(4) } },
			{ time = 0, poses = { Arm = pose(0), Leg = pose(2) } },
		}, true)
		t.eq(clip.length, 1)
		t.eq(clip.looped, true)
		t.eq(clip.tracks.Arm.times, { 0, 1 })
		t.eq(clip.tracks.Arm.values, { 0, 10 })
		t.eq(clip.tracks.Leg.values, { 2, 4 })
	end)

	t.test("skips poses with zero weight", function()
		local clip = AnimClip.fromKeyframes({
			{ time = 0, poses = { Arm = pose(0), Tail = pose(9, 0) } },
			{ time = 2, poses = { Arm = pose(4) } },
		}, false)
		t.eq(clip.tracks.Tail, nil)
		t.eq(clip.tracks.Arm.times, { 0, 2 })
	end)

	t.test("samples between keys", function()
		local clip = AnimClip.fromKeyframes({
			{ time = 0, poses = { Arm = pose(0) } },
			{ time = 2, poses = { Arm = pose(10) } },
		}, false)
		t.near(AnimClip.sample(clip, 0.5, lerp).Arm, 2.5)
	end)

	t.test("loops by clip length, short track holds its last key", function()
		local clip = AnimClip.fromKeyframes({
			{ time = 0, poses = { Arm = pose(0), Leg = pose(0) } },
			{ time = 1, poses = { Leg = pose(5) } },
			{ time = 2, poses = { Arm = pose(8) } },
		}, true)
		local s = AnimClip.sample(clip, 3.5, lerp) -- 3.5 % 2 = 1.5
		t.near(s.Arm, 6)
		t.near(s.Leg, 5)
	end)

	t.test("single key returns its value", function()
		local clip = AnimClip.fromKeyframes({ { time = 0.3, poses = { Arm = pose(7) } } }, true)
		t.eq(AnimClip.sample(clip, 10, lerp).Arm, 7)
	end)

	t.test("constant easing holds the earlier key", function()
		local clip = AnimClip.fromKeyframes({
			{ time = 0, poses = { Arm = { value = 1, style = 1, dir = 0, weight = 1 } } },
			{ time = 1, poses = { Arm = pose(3) } },
		}, false)
		t.eq(AnimClip.sample(clip, 0.9, lerp).Arm, 1)
	end)
end
