--!strict
-- Яйца: id, имя для показа, модель в паке KNOCK OUT (ReplicatedStorage.Packs.Pets), цена в деньгах
-- и сколько перерождений нужно, чтобы открыть. Шансы питомцев считает Pets.hatch по редкости.

export type EggDef = { id: string, name: string, model: string, price: number, gate: number, tier: number }

local List: { EggDef } = {
	{ id = "Colorful", name = "Colorful Egg", model = "Colorful Egg", price = 1000, gate = 0, tier = 1 },
	{ id = "Pastel", name = "Pastel Egg", model = "Pastel Egg", price = 10000, gate = 0, tier = 2 },
	{ id = "Fruity", name = "Fruity Egg", model = "Fruity Egg", price = 50000, gate = 1, tier = 3 },
	{ id = "Hunter", name = "Hunter Egg", model = "Hunter Egg", price = 250000, gate = 2, tier = 4 },
	{ id = "IceCream", name = "Ice Cream Egg", model = "Ice Cream Egg", price = 1000000, gate = 3, tier = 5 },
	{ id = "Neon", name = "Neon Egg", model = "Neon Egg", price = 5000000, gate = 4, tier = 6 },
	{ id = "Dinosaur", name = "Dinosaur Egg", model = "Dinosaur Egg", price = 25000000, gate = 5, tier = 7 },
	{ id = "Job", name = "Job Egg", model = "Job Egg", price = 100000000, gate = 6, tier = 8 },
	{ id = "Duck", name = "Duck Egg", model = "Duck Egg", price = 500000000, gate = 7, tier = 9 },
	{ id = "Lunar", name = "Lunar Egg", model = "Lunar Egg", price = 2500000000, gate = 8, tier = 10 },
	{ id = "Emperor", name = "Emperor Egg", model = "Emperor Egg", price = 10000000000, gate = 10, tier = 11 },
}

local byId: { [string]: EggDef } = {}
for _, e in List do
	byId[e.id] = e
end

local Eggs = {}
Eggs.List = List

function Eggs.byId(id: string): EggDef?
	return byId[id]
end

return Eggs
