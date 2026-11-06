--!strict
-- Экономика этапа 2: цены улучшений, покупка, перерождение, продажа, заработок, настройки,
-- награды индекса. Чистые функции над сохранением игрока: сервер только проверяет запрос и вызывает их.

local Config = require(script.Parent.Config)
local Rarity = require(script.Parent.Rarity)
local Formulas = require(script.Parent.Formulas)
local Creatures = require(script.Parent.Catalog.Creatures)

local Economy = {}

export type UpgradeKind = "Strength" | "Slots"

-- Цена следующего уровня; nil — уже максимум (или неизвестный вид).
function Economy.upgradePrice(kind: string, save: any): number?
	local U = Config.Upgrades
	if kind == "Strength" then
		local level = save.strength
		if level >= U.Strength.max then
			return nil
		end
		return math.floor(U.Strength.base * U.Strength.growth ^ level)
	elseif kind == "Slots" then
		local bought = save.slots - Config.Base.SlotsStart
		if save.slots >= Config.Base.SlotsMax then
			return nil
		end
		return math.floor(U.Slots.base * U.Slots.growth ^ bought)
	end
	return nil
end

function Economy.buyUpgrade(save: any, kind: string): (boolean, string?)
	if kind ~= "Strength" and kind ~= "Slots" then
		return false, "unknown"
	end
	local price = Economy.upgradePrice(kind, save)
	if not price then
		return false, "max"
	end
	if save.money < price then
		return false, "money"
	end
	save.money -= price
	if kind == "Strength" then
		save.strength += 1
	else
		save.slots += 1
	end
	return true, nil
end

function Economy.rebirthCost(rebirths: number): number
	return math.floor(Config.Rebirth.CostBase * Config.Rebirth.CostGrowth ^ rebirths)
end

-- Сбрасывает деньги, существ, силу и места; скорость, коллекция и статистика остаются.
function Economy.rebirth(save: any): (boolean, string?)
	if save.money < Economy.rebirthCost(save.rebirths) then
		return false, "money"
	end
	save.money = 0
	save.creatures = {}
	save.strength = 0
	save.slots = Config.Base.SlotsStart
	save.rebirths += 1
	return true, nil
end

function Economy.earn(save: any, amount: number)
	if amount <= 0 then
		return
	end
	save.money += amount
	save.stats.earned = (save.stats.earned or 0) + amount
end

-- Продать существо с места slot (список сдвигается). Возвращает выручку.
function Economy.sellSlot(save: any, slot: any): (boolean, number)
	if type(slot) ~= "number" or slot ~= math.floor(slot) or slot < 1 or slot > #save.creatures then
		return false, 0
	end
	local c = table.remove(save.creatures, slot)
	local value = Formulas.sellValue(c.id, c.mutation)
	save.money += value
	return true, value
end

-- Продать всех существ ниже редкости rarity. Возвращает (сколько, выручка).
function Economy.sellBelow(save: any, rarity: any): (number, number)
	if type(rarity) ~= "string" or not Rarity.Info[rarity] then
		return 0, 0
	end
	local limit = Rarity.index(rarity)
	local keep, count, total = {}, 0, 0
	for _, c in save.creatures do
		local def = Creatures.byId(c.id)
		if def and Rarity.index(def.rarity) < limit then
			count += 1
			total += Formulas.sellValue(c.id, c.mutation)
		else
			table.insert(keep, c)
		end
	end
	save.creatures = keep
	save.money += total
	return count, total
end

local SETTINGS: { [string]: "percent" | "flag" } = {
	music = "percent",
	sfx = "percent",
	shake = "flag",
	lowDetail = "flag",
}

-- Проверенное значение настройки или nil (неизвестный ключ, не тот тип, вне диапазона).
function Economy.setting(id: any, value: any): any?
	local kind = type(id) == "string" and SETTINGS[id]
	if kind == "percent" then
		if type(value) == "number" and value == value and value >= 0 and value <= 100 then
			return math.floor(value + 0.5)
		end
	elseif kind == "flag" then
		if type(value) == "boolean" then
			return value
		end
	end
	return nil
end

-- Награда за полностью собранную редкость, один раз.
function Economy.claimIndex(save: any, rarity: any): (boolean, number)
	local reward = type(rarity) == "string" and Config.IndexRewards[rarity]
	if not reward or save.indexClaimed[rarity] then
		return false, 0
	end
	local list = Creatures.ofRarity(rarity)
	if #list == 0 then
		return false, 0
	end
	for _, c in list do
		if not save.collection[c.id] then
			return false, 0
		end
	end
	save.indexClaimed[rarity] = true
	save.money += reward
	return true, reward
end

return Economy
