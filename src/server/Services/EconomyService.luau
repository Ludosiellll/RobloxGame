--!strict
-- Запросы экономики от клиентов: улучшения, продажа, перерождение, настройки, награды индекса.
-- Каждый запрос: проверка типов, ограничение частоты, решение — чистые функции Economy.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Economy = require(Shared:WaitForChild("Economy") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local RateLimit = require(Shared:WaitForChild("RateLimit") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Services = script.Parent
local PlayerData = require(Services:WaitForChild("PlayerData") :: ModuleScript) :: any
local BaseService = require(Services:WaitForChild("BaseService") :: ModuleScript) :: any
local CarryService = require(Services:WaitForChild("CarryService") :: ModuleScript) :: any
local DebugService = require(Services:WaitForChild("DebugService") :: ModuleScript) :: any

local EconomyService = {}

local limiter = RateLimit.new(4, 4)

local function allowed(player: Player, kind: string): boolean
	return limiter.allow(tostring(player.UserId) .. ":" .. kind, os.clock())
end

local function notify(player: Player, text: string)
	Remotes.get("Notify"):FireClient(player, text)
end

local function money(n: number): string
	return "$" .. Formulas.formatMoney(n)
end

local function sendSellList(player: Player, save: any, open: boolean)
	Remotes.get("Sell"):FireClient(player, { open = open, creatures = save.creatures })
end

-- Открыть окно продажи (площадка продажи на базе).
function EconomyService.openSell(player: Player)
	local save = PlayerData.get(player)
	if save then
		sendSellList(player, save, true)
	end
end

-- Продать существо с места slot своей базы (подсказка «Sell» на существе).
function EconomyService.sellSlot(player: Player, slot: number): boolean
	local save = PlayerData.get(player)
	if not save then
		return false
	end
	local c = save.creatures[slot]
	local ok, got = Economy.sellSlot(save, slot)
	if ok then
		BaseService.refresh(player)
		notify(player, `Sold {c and c.id or "creature"} for {money(got)}`)
		sendSellList(player, save, false)
	end
	return ok
end

local function onUpgrade(player: Player, kind: any)
	if type(kind) ~= "string" or not allowed(player, "upgrade") then
		return
	end
	local save = PlayerData.get(player)
	if not save then
		return
	end
	local ok, why = Economy.buyUpgrade(save, kind)
	if ok then
		BaseService.refresh(player)
		CarryService.applySpeed(player)
		notify(player, if kind == "Strength" then `Strength {save.strength}!` else `Base Slots {save.slots}!`)
	elseif why == "money" then
		notify(player, "Not enough money")
	elseif why == "max" then
		notify(player, "Already maxed")
	end
end

local function onSell(player: Player, msg: any)
	if type(msg) ~= "table" or not allowed(player, "sell") then
		return
	end
	local save = PlayerData.get(player)
	if not save then
		return
	end
	if msg.mode == "slot" then
		EconomyService.sellSlot(player, msg.slot)
	elseif msg.mode == "below" then
		local count, total = Economy.sellBelow(save, msg.rarity)
		if count > 0 then
			BaseService.refresh(player)
			notify(player, `Sold {count} for {money(total)}`)
		end
		sendSellList(player, save, false)
	end
end

local function onRebirth(player: Player)
	if not allowed(player, "rebirth") then
		return
	end
	local save = PlayerData.get(player)
	if not save then
		return
	end
	local ok = Economy.rebirth(save)
	if not ok then
		notify(player, "Need " .. money(Economy.rebirthCost(save.rebirths)) .. " to rebirth")
		return
	end
	BaseService.refresh(player)
	CarryService.applySpeed(player)
	PlayerData.saveNow(player)
	local m = 1 + Config.Rebirth.IncomeBonus * save.rebirths
	notify(player, `Rebirth {save.rebirths}! Income x{m}`)
	Remotes.get("Announce"):FireAllClients({ text = `{player.DisplayName} reached Rebirth {save.rebirths}!`, rarity = "Legendary" })
end

local function onSettings(player: Player, id: any, value: any)
	if not allowed(player, "settings") then
		return
	end
	local clean = Economy.setting(id, value)
	if clean == nil then
		return
	end
	PlayerData.update(player, function(save)
		save.settings[id] = clean
	end)
end

local function onClaimIndex(player: Player)
	if not allowed(player, "index") then
		return
	end
	local save = PlayerData.get(player)
	if not save then
		return
	end
	local total = 0
	for _, rarity in Rarity.Order do
		local ok, got = Economy.claimIndex(save, rarity)
		if ok then
			total += got
		end
	end
	if total > 0 then
		BaseService.refresh(player)
		notify(player, "Index reward " .. money(total))
	else
		notify(player, "Collect every creature of a rarity to claim")
	end
end

local function onLoaded(player: Player, save: any)
	Remotes.get("Settings"):FireClient(player, save.settings)
	local ids = {}
	for id in save.collection do
		table.insert(ids, id)
	end
	Remotes.get("Collection"):FireClient(player, ids)
end

local function registerDebug()
	DebugService.register("econ", "", function(player, _args)
		local save = PlayerData.get(player)
		assert(save, "data not loaded")
		return `money {money(save.money)}, strength {save.strength} (next {Economy.upgradePrice("Strength", save) or "max"}), slots {save.slots} (next {Economy.upgradePrice("Slots", save) or "max"}), rebirth at {money(Economy.rebirthCost(save.rebirths))}`
	end)
	DebugService.register("rebirth", "", function(player, _args)
		local save = PlayerData.get(player)
		assert(save, "data not loaded")
		save.money = math.max(save.money, Economy.rebirthCost(save.rebirths))
		onRebirth(player)
		return "Rebirths = " .. save.rebirths
	end)
end

function EconomyService.start()
	Remotes.get("Upgrade").OnServerEvent:Connect(onUpgrade)
	Remotes.get("Sell").OnServerEvent:Connect(onSell)
	Remotes.get("Rebirth").OnServerEvent:Connect(onRebirth)
	Remotes.get("Settings").OnServerEvent:Connect(onSettings)
	Remotes.get("ClaimIndex").OnServerEvent:Connect(onClaimIndex)
	PlayerData.loaded.Event:Connect(onLoaded)
	for _, player in Players:GetPlayers() do
		local save = PlayerData.get(player)
		if save then
			onLoaded(player, save)
		end
	end
	Players.PlayerRemoving:Connect(function(player)
		for _, kind in { "upgrade", "sell", "rebirth", "settings", "index" } do
			limiter.forget(tostring(player.UserId) .. ":" .. kind)
		end
	end)
	registerDebug()
end

return EconomyService
