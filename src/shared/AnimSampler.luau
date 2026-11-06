--!strict
-- Выборка кадров KeyframeSequence для своего проигрывателя анимаций (анимации паков
-- не принадлежат игре, поэтому Animator их не проиграет — двигаем кости сами).

local AnimSampler = {}

-- Индексы соседних кадров a, b и доля alpha между ними для времени t.
-- times — времена кадров по возрастанию; при looped время берётся по модулю длины.
function AnimSampler.locate(times: { number }, t: number, looped: boolean): (number, number, number)
	local n = #times
	if n <= 1 then
		return 1, 1, 0
	end
	local first, last = times[1], times[n]
	local length = last - first
	if length <= 0 then
		return 1, 1, 0
	end
	local tt = t - first
	if looped then
		tt = tt % length
	elseif tt <= 0 then
		return 1, 1, 0
	elseif tt >= length then
		return n, n, 0
	end
	tt += first
	-- двоичный поиск последнего кадра с временем <= tt
	local lo, hi = 1, n
	while hi - lo > 1 do
		local mid = (lo + hi) // 2
		if times[mid] <= tt then
			lo = mid
		else
			hi = mid
		end
	end
	if times[hi] <= tt then
		lo = hi
	end
	if lo >= n then
		return n, n, 0
	end
	local span = times[lo + 1] - times[lo]
	local alpha = if span > 0 then (tt - times[lo]) / span else 0
	return lo, lo + 1, alpha
end

local function easeIn(style: number, x: number): number
	if style == 3 or style == 5 then -- Cubic, CubicV2
		return x * x * x
	elseif style == 2 then -- Elastic
		if x <= 0 or x >= 1 then
			return x
		end
		return -(2 ^ (10 * (x - 1))) * math.sin((x - 1.075) * (2 * math.pi) / 0.3)
	elseif style == 4 then -- Bounce
		local function bounceOut(v: number): number
			if v < 1 / 2.75 then
				return 7.5625 * v * v
			elseif v < 2 / 2.75 then
				v -= 1.5 / 2.75
				return 7.5625 * v * v + 0.75
			elseif v < 2.5 / 2.75 then
				v -= 2.25 / 2.75
				return 7.5625 * v * v + 0.9375
			end
			v -= 2.625 / 2.75
			return 7.5625 * v * v + 0.984375
		end
		return 1 - bounceOut(1 - x)
	end
	return x -- Linear
end

-- Смягчение по стилю позы (Enum.PoseEasingStyle как число) и направлению (0 In, 1 Out, 2 InOut).
function AnimSampler.ease(alpha: number, style: number, direction: number): number
	local x = math.clamp(alpha, 0, 1)
	if style == 1 then -- Constant: держим кадр до следующего
		return 0
	end
	if direction == 1 then
		return 1 - easeIn(style, 1 - x)
	elseif direction == 2 then
		if x < 0.5 then
			return easeIn(style, x * 2) / 2
		end
		return 1 - easeIn(style, (1 - x) * 2) / 2
	end
	return easeIn(style, x)
end

return AnimSampler
