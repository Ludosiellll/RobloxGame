--!strict
-- Чистые расчёты: доход, офлайн-доход, переноска, замена существ на базе, толчок, проверка скорости, формат денег.

local Config = require(script.Parent.Config)
local Rarity = require(script.Parent.Rarity)
local Creatures = require(script.Parent.Catalog.Creatures)

export type Owned = { id: string, mutation: string? }

local Formulas = {}

function Formulas.creatureIncome(creatureId: string, mutation: string?): number
	local def = Creatures.byId(creatureId)
	if not def then
		return 0
	end
	return def.income * Rarity.mutationMult(mutation)
end

-- Доход базы в секунду: сумма существ × бонус перерождений × внешний множитель (геймпассы и т. п.).
function Formulas.incomePerSecond(creatures: { Owned }, rebirths: number, incomeMultiplier: number): number
	local sum = 0
	for _, c in creatures do
		sum += Formulas.creatureIncome(c.id, c.mutation)
	end
	return math.floor(sum * (1 + Config.Rebirth.IncomeBonus * rebirths) * incomeMultiplier)
end

function Formulas.offlineEarnings(incomePerSec: number, secondsAway: number): number
	if secondsAway <= 0 or incomePerSec <= 0 then
		return 0
	end
	local capped = math.min(secondsAway, Config.Base.OfflineMaxHours * 3600)
	return math.floor(incomePerSec * Config.Base.OfflineRate * capped)
end

function Formulas.sellValue(creatureId: string, mutation: string?): number
	return Formulas.creatureIncome(creatureId, mutation) * Config.Base.SellSeconds
end

-- Доля скорости, пока несёшь метеорит: сила уменьшает замедление.
function Formulas.carryMultiplier(rarity: string, strengthLevel: number): number
	local carry = Rarity.Info[rarity].carry
	local level = math.clamp(strengthLevel, 0, Config.Carry.StrengthMaxLevel)
	return 1 - (1 - carry) * (1 - Config.Carry.StrengthPerLevel * level)
end

-- Куда поставить новое существо: свободное место, замена самого слабого или продажа нового.
function Formulas.placeOrReplace(slots: { Owned }, capacity: number, new: Owned): ("place" | "replace" | "sell", number?)
	if #slots < capacity then
		return "place", nil
	end
	local weakest, weakestIncome = nil, math.huge
	for i, c in slots do
		local income = Formulas.creatureIncome(c.id, c.mutation)
		if income < weakestIncome then
			weakest, weakestIncome = i, income
		end
	end
	if weakest and Formulas.creatureIncome(new.id, new.mutation) > weakestIncome then
		return "replace", weakest
	end
	return "sell", nil
end

-- Можно ли считать точку падения нормальной (не вода, не лава).
function Formulas.isSpawnHitAllowed(hitName: string): boolean
	local lower = string.lower(hitName)
	for _, blocked in Config.Meteor.BlockedHitNames do
		if string.find(lower, string.lower(blocked), 1, true) then
			return false
		end
	end
	return true
end

-- Толчок: цель на (dx, dz) от толкающего, взгляд (lookX, lookZ).
function Formulas.pushAllowed(dx: number, dz: number, lookX: number, lookZ: number, cooldownLeft: number, targetSafe: boolean): boolean
	if cooldownLeft > 0 or targetSafe then
		return false
	end
	local dist = math.sqrt(dx * dx + dz * dz)
	if dist > Config.Push.Range then
		return false
	end
	if dist < 1e-3 then
		return true
	end
	local lookLen = math.sqrt(lookX * lookX + lookZ * lookZ)
	if lookLen < 1e-6 then
		return false
	end
	local cos = (dx * lookX + dz * lookZ) / (dist * lookLen)
	return cos >= math.cos(math.rad(Config.Push.ConeDegrees / 2))
end

function Formulas.speedSuspicious(distance: number, dt: number, walkSpeed: number): boolean
	return distance > walkSpeed * Config.Carry.SpeedTolerance * dt + Config.Carry.SpeedSlack
end

function Formulas.dropDespawnAt(now: number): number
	return now + Config.Meteor.DespawnDropped
end

local SUFFIXES: { { number | string } } = {
	{ 1e18, "Qi" },
	{ 1e15, "Qa" },
	{ 1e12, "T" },
	{ 1e9, "B" },
	{ 1e6, "M" },
	{ 1e3, "K" },
}

-- 999 → «999», 1200 → «1.2K», 3 400 000 → «3.4M». Округление вниз, чтобы не показывать больше, чем есть.
function Formulas.formatMoney(n: number): string
	for _, s in SUFFIXES do
		local unit = s[1] :: number
		if n >= unit then
			local v = math.floor(n / unit * 10) / 10
			local text = string.format("%.1f", v):gsub("%.0$", "")
			return text .. (s[2] :: string)
		end
	end
	return tostring(math.floor(n))
end

return Formulas
