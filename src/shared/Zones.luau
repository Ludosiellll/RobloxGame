--!strict
-- Зоны (биомы) по порядку удаления от баз. Чем дальше — тем реже метеориты.
-- folder — имя папки биома в workspace.Biomes; gate — сколько перерождений нужно, чтобы войти.

export type ZoneDef = {
	folder: string,
	display: string,
	gate: number,
	weights: { [string]: number }, -- веса редкостей метеоритов в этой зоне
}

local W12 = { Common = 70, Rare = 25, Epic = 5, Legendary = 0, Mythic = 0, Secret = 0 }
local W34 = { Common = 50, Rare = 32, Epic = 14, Legendary = 4, Mythic = 0, Secret = 0 }
local W57 = { Common = 30, Rare = 35, Epic = 23, Legendary = 10, Mythic = 2, Secret = 0 }
local W810 = { Common = 15, Rare = 30, Epic = 32, Legendary = 17, Mythic = 6, Secret = 0 }
local W1113 = { Common = 5, Rare = 20, Epic = 33, Legendary = 27, Mythic = 13, Secret = 2 }
local W1417 = { Common = 0, Rare = 10, Epic = 28, Legendary = 35, Mythic = 22, Secret = 5 }

local ORDER: { { string } } = {
	{ "Forest", "Forest" },
	{ "Savana", "Savana" },
	{ "Desert", "Desert" },
	{ "Jungle", "Jungle" },
	{ "Ocean", "Ocean" },
	{ "Mountains", "Mountains" },
	{ "Taiga", "Taiga" },
	{ "Winter", "Winter" },
	{ "PrehistoricForest", "Prehistoric Forest" },
	{ "DeepWaters", "Deep Waters" },
	{ "Hell", "Hell" },
	{ "AncientRuins", "Ancient Ruins" },
	{ "MythicalParadise", "Mythical Paradise" },
	{ "ShadowRealm", "Shadow Realm" },
	{ "HarvestFields", "Harvest Fields" },
	{ "PhantomHarbor", "Phantom Harbor" },
	{ "NuclearWasteland", "Nuclear Wasteland" },
}

local function weightsFor(i: number): { [string]: number }
	if i <= 2 then
		return W12
	elseif i <= 4 then
		return W34
	elseif i <= 7 then
		return W57
	elseif i <= 10 then
		return W810
	elseif i <= 13 then
		return W1113
	end
	return W1417
end

local Zones = {}

Zones.List = {} :: { ZoneDef }
for i, pair in ORDER do
	table.insert(Zones.List, {
		folder = pair[1],
		display = pair[2],
		gate = math.max(0, i - 4),
		weights = table.clone(weightsFor(i)),
	})
end

function Zones.byFolder(folder: string): (number?, ZoneDef?)
	for i, z in Zones.List do
		if z.folder == folder then
			return i, z
		end
	end
	return nil, nil
end

return Zones
