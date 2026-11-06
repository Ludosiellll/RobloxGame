--!strict
-- Клип анимации для своего проигрывателя: кадры KeyframeSequence → дорожки по костям,
-- и значение каждой кости в момент t. Чистый модуль: значения (обычно CFrame) и их
-- смешивание передаёт вызывающий, поэтому тесты идут на числах.

local AnimSampler = require(script.Parent.AnimSampler)

export type PoseKey = { value: any, style: number, dir: number, weight: number }
export type Keyframe = { time: number, poses: { [string]: PoseKey } }
export type Track = { times: { number }, values: { any }, styles: { number }, dirs: { number } }
export type Clip = { looped: boolean, length: number, tracks: { [string]: Track } }

local AnimClip = {}

function AnimClip.fromKeyframes(keyframes: { Keyframe }, looped: boolean): Clip
	local sorted = table.clone(keyframes)
	table.sort(sorted, function(a, b)
		return a.time < b.time
	end)
	local tracks: { [string]: Track } = {}
	local length = 0
	for _, kf in sorted do
		length = math.max(length, kf.time)
		for bone, p in kf.poses do
			if p.weight > 0 then
				local tr = tracks[bone]
				if not tr then
					tr = { times = {}, values = {}, styles = {}, dirs = {} }
					tracks[bone] = tr
				end
				table.insert(tr.times, kf.time)
				table.insert(tr.values, p.value)
				table.insert(tr.styles, p.style)
				table.insert(tr.dirs, p.dir)
			end
		end
	end
	return { looped = looped, length = length, tracks = tracks }
end

-- Значения костей в момент t. lerp(a, b, e) смешивает два значения.
function AnimClip.sample(clip: Clip, t: number, lerp: (any, any, number) -> any): { [string]: any }
	local tt = if clip.looped and clip.length > 0 then t % clip.length else t
	local out: { [string]: any } = {}
	for bone, tr in clip.tracks do
		local a, b, alpha = AnimSampler.locate(tr.times, tt, false)
		if a == b then
			out[bone] = tr.values[a]
		else
			out[bone] = lerp(tr.values[a], tr.values[b], AnimSampler.ease(alpha, tr.styles[a], tr.dirs[a]))
		end
	end
	return out
end

return AnimClip
