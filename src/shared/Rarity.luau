--!strict
-- Редкости существ и мутации.

export type RarityInfo = {
	color: { number }, -- RGB 0–255, цвет свечения метеорита и подписей
	carry: number, -- доля скорости, пока несёшь метеорит этой редкости
	announce: boolean, -- объявлять находку на весь сервер
}

export type Mutation = {
	name: string,
	mult: number, -- множитель дохода
	chance: number, -- базовый шанс за бросок (первая зона, удача 1)
	color: { number },
}

local Rarity = {}

Rarity.Order = { "Common", "Rare", "Epic", "Legendary", "Mythic", "Secret" }

Rarity.Info = {
	Common = { color = { 213, 222, 236 }, carry = 0.90, announce = false },
	Rare = { color = { 47, 155, 255 }, carry = 0.80, announce = false },
	Epic = { color = { 180, 77, 255 }, carry = 0.70, announce = false },
	Legendary = { color = { 255, 90, 31 }, carry = 0.60, announce = false },
	Mythic = { color = { 255, 46, 99 }, carry = 0.50, announce = true },
	Secret = { color = { 248, 248, 248 }, carry = 0.40, announce = true },
} :: { [string]: RarityInfo }

-- От частой к редкой; Roll проверяет их в обратном порядке.
Rarity.Mutations = {
	{ name = "Golden", mult = 2, chance = 0.05, color = { 255, 200, 61 } },
	{ name = "Diamond", mult = 3, chance = 0.02, color = { 127, 231, 255 } },
	{ name = "Lava", mult = 4, chance = 0.01, color = { 255, 74, 26 } },
	{ name = "Galaxy", mult = 6, chance = 0.004, color = { 123, 60, 255 } },
	{ name = "Rainbow", mult = 10, chance = 0.001, color = { 255, 255, 255 } },
} :: { Mutation }

local indexOf: { [string]: number } = {}
for i, name in Rarity.Order do
	indexOf[name] = i
end

local mutationByName: { [string]: Mutation } = {}
for _, m in Rarity.Mutations do
	mutationByName[m.name] = m
end

-- Порядковый номер редкости: Common = 1 … Secret = 6.
function Rarity.index(name: string): number
	local i = indexOf[name]
	assert(i, "unknown rarity " .. tostring(name))
	return i
end

function Rarity.mutation(name: string?): Mutation?
	return if name then mutationByName[name] else nil
end

-- Множитель дохода мутации; без мутации — 1.
function Rarity.mutationMult(name: string?): number
	local m = Rarity.mutation(name)
	return if m then m.mult else 1
end

return Rarity
