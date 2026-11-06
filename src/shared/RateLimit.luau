--!strict
-- Ограничение частоты запросов от клиентов: ведро токенов на ключ. Время передаётся аргументом
-- (на сервере — os.clock()), поэтому модуль чистый и тестируется.

local RateLimit = {}

export type Limiter = {
	allow: (key: any, now: number) -> boolean,
	forget: (key: any) -> (),
}

function RateLimit.new(perSecond: number, burst: number): Limiter
	local buckets: { [any]: { tokens: number, at: number } } = {}
	local self = {}
	function self.allow(key: any, now: number): boolean
		local b = buckets[key]
		if not b then
			b = { tokens = burst, at = now }
			buckets[key] = b
		end
		b.tokens = math.min(burst, b.tokens + math.max(0, now - b.at) * perSecond)
		b.at = now
		if b.tokens >= 1 then
			b.tokens -= 1
			return true
		end
		return false
	end
	function self.forget(key: any)
		buckets[key] = nil
	end
	return self :: Limiter
end

return RateLimit
