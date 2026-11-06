--!strict
-- Питомцы из пака KNOCK OUT: id — имя модели в паке, яйцо, редкость и бонус одного типа.
-- Внутри яйца редкость растёт по порядку списка, у дорогих яиц вся линейка сдвинута вверх.
-- Бонусы чередуются: скорость → удача → доход.

local Eggs = require(script.Parent.Eggs)

export type PetDef = { id: string, name: string, egg: string, rarity: string, bonus: "speed" | "luck" | "income" }

local SETS: { { egg: string, pets: { string } } } = {
	{ egg = "Colorful", pets = { "Default", "Red", "Orange", "Yellow", "Green", "Blue", "Purple" } },
	{ egg = "Pastel", pets = { "PastelRed", "PastelOrange", "PastelYellow", "PastelGreen", "PastelBlue", "PastelPurple" } },
	{ egg = "Fruity", pets = { "OrangeSkin", "Apple", "Banana", "Kiwi", "Watermelon" } },
	{ egg = "Hunter", pets = { "Bunny", "Racoon", "Deer", "Fox", "Wolf" } },
	{ egg = "IceCream", pets = { "Vanilla", "Strawberry", "Chocolate", "CookieDough", "CookiesNCream" } },
	{ egg = "Neon", pets = { "NeonRed", "NeonOrange", "NeonYellow", "NeonGreen", "NeonBlue", "NeonPurple" } },
	{ egg = "Dinosaur", pets = { "Tricera", "Stego", "Raptor", "Spino", "TRex" } },
	{ egg = "Job", pets = { "Chef", "FastFood", "Painter", "Officer", "Judge", "Soldier", "Capitalist" } },
	{ egg = "Duck", pets = { "Ducky", "Sealguin", "Shark", "Snowman", "Festive" } },
	{ egg = "Lunar", pets = { "Frost Bite", "Evil", "Rainbow", "Aurora", "Cosmic" } },
	{ egg = "Emperor", pets = { "Bronze", "Silver", "Gold", "Emerald", "Ruby", "Diamond", "Yeti", "Gangster" } },
}

local ORDER = { "Common", "Rare", "Epic", "Legendary", "Mythic", "Secret" }
local BONUS: { "speed" | "luck" | "income" } = { "speed", "luck", "income" }

local function spaced(name: string): string
	local s = string.gsub(name, "(%l)(%u)", "%1 %2")
	return s
end

local List: { PetDef } = {}
local byId: { [string]: PetDef } = {}
local byEgg: { [string]: { PetDef } } = {}
local n = 0
for _, set in SETS do
	local egg = Eggs.byId(set.egg)
	assert(egg, "unknown egg " .. set.egg)
	local shift = (egg.tier - 1) // 3
	local count = #set.pets
	byEgg[set.egg] = {}
	for i, id in set.pets do
		-- первая половина — обычные, дальше по одной ступени; последний — самый редкий
		local step = math.max(0, i - math.ceil(count / 2))
		local rarity = ORDER[math.min(#ORDER, 1 + step + shift)]
		n += 1
		local def: PetDef = { id = id, name = spaced(id), egg = set.egg, rarity = rarity, bonus = BONUS[(n - 1) % 3 + 1] }
		table.insert(List, def)
		byId[id] = def
		table.insert(byEgg[set.egg], def)
	end
end

local Pets = {}
Pets.List = List

function Pets.byId(id: string): PetDef?
	return byId[id]
end

function Pets.ofEgg(eggId: string): { PetDef }
	return byEgg[eggId] or {}
end

return Pets
