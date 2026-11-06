--!strict
-- Питомцы: вылупление, покупка яйца, экипировка, сумма бонусов, беговые дорожки.
-- Чистые функции над сохранением игрока; сервер проверяет запрос и вызывает их.

local Config = require(script.Parent.Config)
local Roll = require(script.Parent.Roll)
local Eggs = require(script.Parent.Catalog.Eggs)
local PetCatalog = require(script.Parent.Catalog.Pets)

local Pets = {}

-- Случайный питомец яйца: вес по редкости (Config.Pets.Weight).
function Pets.hatch(eggId: string, rng: () -> number): string?
	local list = PetCatalog.ofEgg(eggId)
	if #list == 0 then
		return nil
	end
	local weights: { [string]: number } = {}
	local order: { string } = {}
	for _, p in list do
		weights[p.id] = Config.Pets.Weight[p.rarity] or 0
		table.insert(order, p.id)
	end
	return Roll.weighted(weights, order, rng)
end

function Pets.buyEgg(save: any, eggId: any, rng: () -> number): (boolean, string?)
	local egg = type(eggId) == "string" and Eggs.byId(eggId) or nil
	if not egg then
		return false, "unknown"
	end
	if save.rebirths < egg.gate then
		return false, "locked"
	end
	if #save.pets >= Config.Pets.MaxOwned then
		return false, "full"
	end
	if save.money < egg.price then
		return false, "money"
	end
	local petId = Pets.hatch(egg.id, rng)
	if not petId then
		return false, "unknown"
	end
	save.money -= egg.price
	table.insert(save.pets, { uid = save.nextPetUid, id = petId })
	save.nextPetUid += 1
	return true, petId
end

local function owns(save: any, uid: any): boolean
	for _, p in save.pets do
		if p.uid == uid then
			return true
		end
	end
	return false
end

function Pets.equip(save: any, uid: any): (boolean, string?)
	if not owns(save, uid) then
		return false, "unknown"
	end
	if table.find(save.equipped, uid) then
		return true, nil
	end
	if #save.equipped >= Config.Pets.Equipped then
		return false, "limit"
	end
	table.insert(save.equipped, uid)
	return true, nil
end

function Pets.unequip(save: any, uid: any): boolean
	local i = table.find(save.equipped, uid)
	if not i then
		return false
	end
	table.remove(save.equipped, i)
	return true
end

-- Удалить питомца (освободить место в рюкзаке); если он был с игроком — убрать.
function Pets.delete(save: any, uid: any): boolean
	if type(uid) ~= "number" then
		return false
	end
	for i, p in save.pets do
		if p.uid == uid then
			table.remove(save.pets, i)
			Pets.unequip(save, uid)
			return true
		end
	end
	return false
end

-- Сумма бонусов экипированных питомцев (доли: 0.2 = +20%).
function Pets.bonuses(save: any): { speed: number, luck: number, income: number }
	local out = { speed = 0, luck = 0, income = 0 }
	for _, uid in save.equipped do
		for _, p in save.pets do
			if p.uid == uid then
				local def = PetCatalog.byId(p.id)
				if def then
					out[def.bonus] += Config.Pets.Bonus[def.rarity] or 0
				end
				break
			end
		end
	end
	return out
end

-- Прирост скорости за dt секунд бега на дорожке уровня tier (0 — если dt подозрительный).
function Pets.treadmillGain(tier: number, dt: number): number
	local T = Config.Treadmill
	if dt <= 0 or dt > 1 or tier < 1 or tier > T.Tiers then
		return 0
	end
	return T.Base * T.Growth ^ (tier - 1) * dt
end

function Pets.treadmillOpen(tier: number, rebirths: number): boolean
	return tier >= 1 and tier <= Config.Treadmill.Tiers and rebirths >= tier - 1
end

-- До трёх лучших открытых уровней дорожек, по убыванию.
function Pets.baseTreadmills(rebirths: number): { number }
	local top = math.min(Config.Treadmill.Tiers, rebirths + 1)
	local out = {}
	for tier = top, math.max(1, top - Config.Treadmill.PerBase + 1), -1 do
		table.insert(out, tier)
	end
	return out
end

return Pets
