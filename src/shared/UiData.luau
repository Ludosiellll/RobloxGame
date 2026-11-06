--!strict
-- Данные для окон Folk Stud: из сохранения и каталога — строки и подписи. Чистый модуль.

local Config = require(script.Parent.Config)
local Rarity = require(script.Parent.Rarity)
local Formulas = require(script.Parent.Formulas)
local Economy = require(script.Parent.Economy)
local Creatures = require(script.Parent.Catalog.Creatures)

local UiData = {}

local function money(n: number): string
	return "$" .. Formulas.formatMoney(n)
end

local function mult(rebirths: number): string
	local m = 1 + Config.Rebirth.IncomeBonus * rebirths
	local text = if m == math.floor(m) then tostring(math.floor(m)) else string.format("%.1f", m)
	return "x" .. text .. " Money"
end

function UiData.upgradeRows(save: any): { any }
	local rows = {}
	for _, spec in {
		{ id = "Strength", title = `Strength Lv {save.strength}`, desc = "Carry meteors faster", have = save.strength, need = Config.Upgrades.Strength.max },
		{ id = "Slots", title = `Base Slots {save.slots}`, desc = "More creatures on your base", have = save.slots, need = Config.Base.SlotsMax },
	} do
		local price = Economy.upgradePrice(spec.id, save)
		local state = if not price then "done" elseif save.money >= price then "ready" else "go"
		table.insert(rows, { id = spec.id, title = spec.title, desc = spec.desc, have = spec.have, need = spec.need, price = if price then money(price) else nil, state = state })
	end
	return rows
end

function UiData.rebirthView(cash: number, rebirths: number): any
	local cost = Economy.rebirthCost(rebirths)
	return {
		from = "Rebirth " .. rebirths,
		to = "Rebirth " .. (rebirths + 1),
		gainFrom = mult(rebirths),
		gainTo = mult(rebirths + 1),
		barText = money(cash) .. "/" .. money(cost),
		barFrac = math.clamp(cash / cost, 0, 1),
		ready = cash >= cost,
	}
end

function UiData.indexSections(collection: { [string]: boolean }): { any }
	local sections = {}
	for _, rarity in Rarity.Order do
		local items, found = {}, 0
		for _, c in Creatures.ofRarity(rarity) do
			local has = collection[c.id] == true
			if has then
				found += 1
			end
			table.insert(items, { id = c.id, name = c.name, rarity = rarity, found = has, income = money(Formulas.creatureIncome(c.id)) .. "/s" })
		end
		table.insert(sections, { name = rarity, rarity = rarity, found = found, total = #items, items = items })
	end
	return sections
end

-- «Продать всё слабее R» для R от второй редкости до последней.
function UiData.sellRows(creatures: { any }): { any }
	local rows = {}
	for i = 2, #Rarity.Order do
		local count, total = 0, 0
		for _, c in creatures do
			local def = Creatures.byId(c.id)
			if def and Rarity.index(def.rarity) < i then
				count += 1
				total += Formulas.sellValue(c.id, c.mutation)
			end
		end
		-- продаёт Legendary и сильнее — нужно второе нажатие-подтверждение
		table.insert(rows, { rarity = Rarity.Order[i], count = count, total = total, confirm = i > Rarity.index("Legendary") })
	end
	return rows
end

return UiData
