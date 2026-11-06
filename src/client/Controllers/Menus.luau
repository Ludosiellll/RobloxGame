--!strict
-- Окна Folk Stud: рельса слева (Shop, Index, Rebirth, Settings) и окно продажи с площадки базы.
-- Данные для окон считает UiData из атрибутов игрока; всё, что меняет деньги, решает сервер.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any
local UiData = require(Shared:WaitForChild("UiData") :: ModuleScript) :: any

local Client = script.Parent.Parent
local M = require(Client:WaitForChild("UI"):WaitForChild("FolkStudUI") :: ModuleScript) :: any
local ClientSettings = require(Client:WaitForChild("Fx"):WaitForChild("ClientSettings") :: ModuleScript) :: any

local Menus = {}

local player = Players.LocalPlayer
local collection: { [string]: boolean } = {}
local sellCreatures: { any } = {}

local function attr(name: string, default: number): number
	local v = player:GetAttribute(name)
	return if type(v) == "number" then v else default
end

local function view(): any
	return { money = attr("Money", 0), strength = attr("Strength", 0), slots = attr("Slots", Config.Base.SlotsStart), rebirths = attr("Rebirths", 0) }
end

local function find(gui: Instance, name: string): Instance?
	return gui:FindFirstChild(name, true)
end

local function setText(gui: Instance, path: { string }, text: string)
	local node: Instance? = gui
	for _, name in path do
		node = node and node:FindFirstChild(name, true)
	end
	if node and node:IsA("TextLabel") then
		node.Text = text
	end
end

local function relabel(gui: Instance, rowName: string, label: string)
	local row = find(gui, rowName)
	if not row then
		return
	end
	for _, b in { "Claim", "Go" } do
		local button = row:FindFirstChild(b)
		local l = button and button:FindFirstChild("Label")
		if l and l:IsA("TextLabel") then
			l.Text = label
		end
	end
end

-- магазин улучшений
local function shopRows(): { any }
	local out = {}
	for _, r in UiData.upgradeRows(view()) do
		table.insert(out, {
			id = r.id,
			title = r.title,
			desc = r.desc,
			have = r.have,
			need = r.need,
			reward = r.price or "MAX",
			state = r.state,
			color = if r.id == "Strength" then M.COLOR.crimson else M.COLOR.blue,
			icon = M.ART.star,
		})
	end
	return out
end

local function buildShop(pg: Instance): ScreenGui
	local gui = M.quests(pg, { name = "FolkShop", title = "Shop", icon = M.ART.shop, sections = { { name = "Upgrades", timer = "", icon = M.ART.star, color = M.COLOR.gold, quests = shopRows() } } })
	for _, r in shopRows() do
		relabel(gui, "Quest" .. r.id, "BUY")
	end
	return gui
end

local function refreshShop(gui: Instance)
	for _, r in shopRows() do
		M.setQuest(gui, r.id, r.have, r.need, r.state)
		local row = find(gui, "Quest" .. r.id)
		if row then
			setText(row, { "Title" }, r.title)
			setText(row, { "Reward" }, r.reward)
		end
	end
end

-- перерождение
local function rebirthCfg(): any
	local v = UiData.rebirthView(attr("Money", 0), attr("Rebirths", 0))
	return {
		name = "FolkRebirth",
		title = "Rebirth",
		icon = M.ART.rebirth,
		from = v.from,
		to = v.to,
		gainFrom = v.gainFrom,
		gainTo = v.gainTo,
		warn = "Resets money, creatures, strength and slots!",
		barText = v.barText,
		barFrac = v.barFrac,
	}
end

local function refreshRebirth(gui: Instance)
	local c = rebirthCfg()
	setText(gui, { "From" }, c.from)
	setText(gui, { "To" }, c.to)
	setText(gui, { "PlateFrom", "Value" }, c.gainFrom)
	setText(gui, { "PlateTo", "Value" }, c.gainTo)
	setText(gui, { "BarText" }, c.barText)
	M.setBar(gui, c.barFrac, 0.3)
end

-- индекс
local function indexCfg(): any
	local sections = {}
	for _, sec in UiData.indexSections(collection) do
		local items = {}
		for _, it in sec.items do
			table.insert(items, { id = it.id, name = it.name, rarity = it.rarity, art = M.ART.star, found = it.found, stats = { { "INCOME", it.income } } })
		end
		table.insert(sections, { name = sec.name, color = M.COLOR.green, icon = M.ART.star, reward = "$" .. Formulas.formatMoney(Config.IndexRewards[sec.rarity] or 0), rewardArt = M.ART.star, items = items })
	end
	return { name = "FolkIndex", title = "Index", claim = "CLAIM!", sections = sections }
end

-- продажа
local function sellRows(): { any }
	local out = {}
	for _, r in UiData.sellRows(sellCreatures) do
		table.insert(out, {
			id = r.rarity,
			title = "Sell below " .. r.rarity,
			desc = r.count .. " creature" .. (if r.count == 1 then "" else "s"),
			have = r.count,
			need = math.max(r.count, 1),
			reward = "$" .. Formulas.formatMoney(r.total),
			state = if r.count > 0 then "ready" else "done",
			color = M.COLOR.green,
			icon = M.ART.star,
		})
	end
	return out
end

local function refreshSell(gui: Instance)
	for _, r in sellRows() do
		M.setQuest(gui, r.id, r.have, r.need, r.state)
		local row = find(gui, "Quest" .. r.id)
		if row then
			setText(row, { "Desc" }, r.desc)
			setText(row, { "Reward" }, r.reward)
		end
	end
end

-- настройки
local function settingsCfg(): any
	local v = ClientSettings.values
	return {
		name = "FolkSettings",
		title = "Settings",
		sections = {
			{ name = "Audio", color = M.COLOR.green, icon = M.ART.star, rows = {
				{ id = "music", kind = "slider", title = "Music", desc = "Background tracks", value = v.music, color = M.COLOR.blue },
				{ id = "sfx", kind = "slider", title = "Sound", desc = "Meteors, pushes and rewards", value = v.sfx, color = M.COLOR.pink },
			} },
			{ name = "Gameplay", color = M.COLOR.blue, icon = M.ART.star, rows = {
				{ id = "shake", title = "Camera Shake", desc = "Shake when meteors land", value = v.shake, color = M.COLOR.crimson },
				{ id = "lowDetail", title = "Low Detail", desc = "Runs better on old phones", value = v.lowDetail, color = M.COLOR.green },
			} },
		},
	}
end

function Menus.start()
	local pg = player:WaitForChild("PlayerGui")
	local shop = buildShop(pg)
	local rebirth = M.rebirth(pg, rebirthCfg())
	local index = M.index(pg, indexCfg())
	local settings = M.settings(pg, settingsCfg())
	local sell = M.quests(pg, { name = "FolkSell", title = "Sell", icon = M.ART.star, sections = { { name = "Sell", timer = "", icon = M.ART.star, color = M.COLOR.green, quests = sellRows() } } })
	for _, r in sellRows() do
		relabel(sell, "Quest" .. r.id, "SELL")
	end
	for _, g in { shop, rebirth, index, settings, sell } do
		g.Enabled = false
	end
	local hud = M.hud(pg, { buttons = {
		{ label = "Shop", icon = M.ART.shop, color = M.COLOR.hudShop, opens = "FolkShop" },
		{ label = "Index", icon = M.ART.star, color = M.COLOR.pink, opens = "FolkIndex" },
		{ label = "Rebirth", icon = M.ART.rebirth, color = M.COLOR.hudBlue, opens = "FolkRebirth" },
		{ label = "Settings", icon = M.ART.star, color = M.COLOR.crimson, opens = "FolkSettings" },
	} })

	M.live(shop, {
		claim = function(id: string)
			Remotes.get("Upgrade"):FireServer(id)
		end,
		go = function(id: string)
			Remotes.get("Upgrade"):FireServer(id)
		end,
	})
	M.live(rebirth, {
		rebirth = function()
			Remotes.get("Rebirth"):FireServer()
		end,
	})
	M.live(index, {
		pick = function(id: string)
			M.selectItem(index, id)
		end,
		claim = function()
			Remotes.get("ClaimIndex"):FireServer()
		end,
	})
	M.live(sell, {
		claim = function(rarity: string)
			Remotes.get("Sell"):FireServer({ mode = "below", rarity = rarity })
		end,
	})
	M.settingsLive(settings, {
		change = function(id: string, value: any)
			ClientSettings.set(id, value)
			Remotes.get("Settings"):FireServer(id, value)
		end,
	})
	M.hudLive(hud, { FolkShop = shop, FolkIndex = index, FolkRebirth = rebirth, FolkSettings = settings })

	local function onMoney()
		refreshShop(shop)
		refreshRebirth(rebirth)
	end
	for _, a in { "Money", "Strength", "Slots", "Rebirths" } do
		player:GetAttributeChangedSignal(a):Connect(onMoney)
	end
	onMoney()

	Remotes.get("Collection").OnClientEvent:Connect(function(ids: any)
		if type(ids) ~= "table" then
			return
		end
		for _, id in ids do
			if type(id) == "string" and not collection[id] then
				collection[id] = true
				pcall(M.setFound, index, id, true)
			end
		end
	end)
	Remotes.get("Settings").OnClientEvent:Connect(function(values: any)
		if type(values) ~= "table" then
			return
		end
		for id, v in values do
			if type(id) == "string" then
				ClientSettings.set(id, v)
				pcall(M.setSetting, settings, id, v)
			end
		end
	end)
	Remotes.get("Sell").OnClientEvent:Connect(function(msg: any)
		if type(msg) ~= "table" or type(msg.creatures) ~= "table" then
			return
		end
		sellCreatures = msg.creatures
		refreshSell(sell)
		if msg.open and not sell.Enabled then
			M.show(sell, true)
		end
	end)
end

return Menus
