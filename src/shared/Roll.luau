--!strict
-- Случайные выборы для метеоритов. Генератор передаётся аргументом: rng() → число в [0, 1).

local Rarity = require(script.Parent.Rarity)
local Zones = require(script.Parent.Zones)
local Creatures = require(script.Parent.Catalog.Creatures)
local Config = require(script.Parent.Config)

local Roll = {}

-- Взвешенный выбор: идём по order, накапливаем веса. Все веса 0 → nil.
function Roll.weighted(weights: { [string]: number }, order: { string }, rng: () -> number): string?
	local total = 0
	for _, key in order do
		total += math.max(0, weights[key] or 0)
	end
	if total <= 0 then
		return nil
	end
	local x = rng() * total
	local acc = 0
	for _, key in order do
		local w = math.max(0, weights[key] or 0)
		acc += w
		if w > 0 and x < acc then
			return key
		end
	end
	-- погрешность с плавающей точкой: последний ключ с весом
	for i = #order, 1, -1 do
		if (weights[order[i]] or 0) > 0 then
			return order[i]
		end
	end
	return nil
end

-- Редкость метеорита в зоне. Удача (≥ 1) умножает веса всех редкостей, кроме Common.
function Roll.rarity(zoneIndex: number, luck: number, rng: () -> number): string
	local zone = Zones.List[zoneIndex]
	assert(zone, "unknown zone " .. tostring(zoneIndex))
	local weights = {}
	for name, w in zone.weights do
		weights[name] = if name == "Common" then w else w * math.max(1, luck)
	end
	return Roll.weighted(weights, Rarity.Order, rng) or "Common"
end

-- Мутация: от самой редкой к частой, не больше одной.
function Roll.mutation(zoneIndex: number, luck: number, rng: () -> number): string?
	local zoneMult = 1 + Config.Meteor.ZoneMutationBonus * (zoneIndex - 1)
	for i = #Rarity.Mutations, 1, -1 do
		local m = Rarity.Mutations[i]
		if rng() < m.chance * zoneMult * math.max(1, luck) then
			return m.name
		end
	end
	return nil
end

-- Случайное существо этой редкости.
function Roll.creature(rarity: string, rng: () -> number): string
	local pool = Creatures.ofRarity(rarity)
	assert(#pool > 0, "no creatures of rarity " .. rarity)
	local i = math.clamp(math.floor(rng() * #pool) + 1, 1, #pool)
	return pool[i].id
end

function Roll.meteor(zoneIndex: number, luck: number, rng: () -> number): { rarity: string, mutation: string?, creatureId: string }
	local rarity = Roll.rarity(zoneIndex, luck, rng)
	return {
		rarity = rarity,
		mutation = Roll.mutation(zoneIndex, luck, rng),
		creatureId = Roll.creature(rarity, rng),
	}
end

return Roll
