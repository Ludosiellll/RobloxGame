--!strict
-- Каталог существ из пака брейнротов (assets/packs/Brainrots.rbxm).
-- id — точное имя модели в паке; name — имя для показа игрокам; income — доход в секунду.
-- Модель «69» в каталог не входит: риск модерации Roblox (решение 2026-11-06).

export type CreatureDef = {
	id: string,
	name: string,
	rarity: string,
	income: number,
}

local List: { CreatureDef } = {
	-- Common, 1–4/s
	{ id = "HotSpot", name = "Hot Spot", rarity = "Common", income = 1 },
	{ id = "W", name = "W", rarity = "Common", income = 1 },
	{ id = "L", name = "L", rarity = "Common", income = 1 },
	{ id = "LOL", name = "LOL", rarity = "Common", income = 1 },
	{ id = "Pencile", name = "Pencile", rarity = "Common", income = 1 },
	{ id = "PipeMan", name = "Pipe Man", rarity = "Common", income = 2 },
	{ id = "Burguro", name = "Burguro", rarity = "Common", income = 2 },
	{ id = "KiwiPipi", name = "Kiwi Pipi", rarity = "Common", income = 2 },
	{ id = "Octopusini", name = "Octopusini", rarity = "Common", income = 2 },
	{ id = "Dolphinita", name = "Dolphinita", rarity = "Common", income = 2 },
	{ id = "MelonOtter", name = "Melon Otter", rarity = "Common", income = 2 },
	{ id = "SammySpiderini", name = "Sammy Spiderini", rarity = "Common", income = 3 },
	{ id = "AvocadiniAntilopini", name = "Avocadini Antilopini", rarity = "Common", income = 3 },
	{ id = "LioneliCactusini", name = "Lioneli Cactusini", rarity = "Common", income = 3 },
	{ id = "NoobiniPizzanini", name = "Noobini Pizzanini", rarity = "Common", income = 3 },
	{ id = "Madung", name = "Madung", rarity = "Common", income = 3 },
	{ id = "67", name = "67", rarity = "Common", income = 4 },

	-- Rare, 6–14/s
	{ id = "TimCheese", name = "Tim Cheese", rarity = "Rare", income = 6 },
	{ id = "JobApplication", name = "Job Application", rarity = "Rare", income = 6 },
	{ id = "Svinino", name = "Svinino", rarity = "Rare", income = 6 },
	{ id = "TVWorldini", name = "TV Worldini", rarity = "Rare", income = 7 },
	{ id = "KiwiBird", name = "Kiwi Bird", rarity = "Rare", income = 7 },
	{ id = "FluriFlura", name = "Fluri Flura", rarity = "Rare", income = 8 },
	{ id = "CrabiniChefini", name = "Crabini Chefini", rarity = "Rare", income = 8 },
	{ id = "CameloniMeleloni", name = "Cameloni Meleloni", rarity = "Rare", income = 8 },
	{ id = "BanditoBobritto", name = "Bandito Bobritto", rarity = "Rare", income = 9 },
	{ id = "HotSpotBurittini", name = "Hot Spot Burittini", rarity = "Rare", income = 9 },
	{ id = "SickPenguini", name = "Sick Penguini", rarity = "Rare", income = 10 },
	{ id = "GangsterFootera", name = "Gangster Footera", rarity = "Rare", income = 10 },
	{ id = "LuckySammy", name = "Lucky Sammy", rarity = "Rare", income = 11 },
	{ id = "Brri BrriBicus", name = "Brri Brri Bicus", rarity = "Rare", income = 12 },
	{ id = "TrulimeroTruli", name = "Trulimero Truli", rarity = "Rare", income = 13 },
	{ id = "BambiniCrostini", name = "Bambini Crostini", rarity = "Rare", income = 14 },

	-- Epic, 25–60/s
	{ id = "SigmaBoy", name = "Sigma Boy", rarity = "Epic", income = 25 },
	{ id = "RhinoToasterino", name = "Rhino Toasterino", rarity = "Epic", income = 28 },
	{ id = "CactoHipopotamo", name = "Cacto Hipopotamo", rarity = "Epic", income = 30 },
	{ id = "ChicleteiraBicicleteira", name = "Chicleteira Bicicleteira", rarity = "Epic", income = 32 },
	{ id = "BonecaAmbalabu", name = "Boneca Ambalabu", rarity = "Epic", income = 35 },
	{ id = "TalpaDiFerro", name = "Talpa Di Ferro", rarity = "Epic", income = 38 },
	{ id = "GlorboFruittoDrillo", name = "Glorbo Fruttodrillo", rarity = "Epic", income = 40 },
	{ id = "TuTuTuSahur", name = "Tu Tu Tu Sahur", rarity = "Epic", income = 44 },
	{ id = "BombardiniGusini", name = "Bombardini Gusini", rarity = "Epic", income = 48 },
	{ id = "OrangutiniAnanasini", name = "Orangutini Ananasini", rarity = "Epic", income = 52 },
	{ id = "FrigoCamelo", name = "Frigo Camelo", rarity = "Epic", income = 56 },
	{ id = "UdinDinDinDun", name = "Udin Din Din Dun", rarity = "Epic", income = 60 },

	-- Legendary, 120–300/s
	{ id = "Karkirkurkarkarkar", name = "Karkirkur", rarity = "Legendary", income = 120 },
	{ id = "Garamararamararaman", name = "Garamararam", rarity = "Legendary", income = 140 },
	{ id = "LaVacaSaturno", name = "La Vaca Saturno", rarity = "Legendary", income = 160 },
	{ id = "TrippiTroppi", name = "Trippi Troppi", rarity = "Legendary", income = 180 },
	{ id = "LiriliLarila", name = "Lirili Larila", rarity = "Legendary", income = 200 },
	{ id = "BrBrBatabim", name = "Brr Brr Patapim", rarity = "Legendary", income = 225 },
	{ id = "ChimpanziniBananini", name = "Chimpanzini Bananini", rarity = "Legendary", income = 250 },
	{ id = "CappoccinoAssassino", name = "Cappuccino Assassino", rarity = "Legendary", income = 275 },
	{ id = "BallerinaCappuccina", name = "Ballerina Cappuccina", rarity = "Legendary", income = 300 },

	-- Mythic, 600–1500/s
	{ id = "GorilloWatermelondrillo", name = "Gorillo Watermelondrillo", rarity = "Mythic", income = 600 },
	{ id = "StrawberryElephant", name = "Strawberry Elephant", rarity = "Mythic", income = 750 },
	{ id = "CocofantoElefanto", name = "Cocofanto Elefanto", rarity = "Mythic", income = 900 },
	{ id = "BombardiniCrocodilo", name = "Bombardiro Crocodilo", rarity = "Mythic", income = 1100 },
	{ id = "TungTungTungSahur", name = "Tung Tung Tung Sahur", rarity = "Mythic", income = 1300 },
	{ id = "TralaleroTralala", name = "Tralalero Tralala", rarity = "Mythic", income = 1500 },

	-- Secret, 3000–8000/s
	{ id = "MysteriniBlockini", name = "Mysterini Blockini", rarity = "Secret", income = 3000 },
	{ id = "Nuclearini", name = "Nuclearini", rarity = "Secret", income = 5000 },
	{ id = "LaVaccaSaturnoSaturnita", name = "La Vacca Saturno Saturnita", rarity = "Secret", income = 8000 },
}

local byId: { [string]: CreatureDef } = {}
local byRarity: { [string]: { CreatureDef } } = {}
for _, c in List do
	byId[c.id] = c
	byRarity[c.rarity] = byRarity[c.rarity] or {}
	table.insert(byRarity[c.rarity], c)
end

local Creatures = {}

Creatures.List = List

function Creatures.byId(id: string): CreatureDef?
	return byId[id]
end

function Creatures.ofRarity(rarity: string): { CreatureDef }
	return byRarity[rarity] or {}
end

return Creatures
