--!strict
-- Окна Folk Stud: рельса слева (Shop, Index, Rebirth, Settings) и окно продажи с площадки базы.
-- Данные для окон считает UiData из атрибутов игрока; всё, что меняет деньги, решает сервер.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any
local UiData = require(Shared:WaitForChild("UiData") :: ModuleScript) :: any
local SettingsQueue = require(Shared:WaitForChild("SettingsQueue") :: ModuleScript) :: any

local Client = script.Parent.Parent
local M = require(Client:WaitForChild("UI"):WaitForChild("FolkStudUI") :: ModuleScript) :: any
local ClientSettings = require(Client:WaitForChild("Fx"):WaitForChild("ClientSettings") :: ModuleScript) :: any
local Hatch = require(Client:WaitForChild("Fx"):WaitForChild("Hatch") :: ModuleScript) :: any
local Eggs = require(Shared:WaitForChild("Catalog"):WaitForChild("Eggs") :: ModuleScript) :: any
local PetCatalog = require(Shared:WaitForChild("Catalog"):WaitForChild("Pets") :: ModuleScript) :: any

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
	local gui = M.quests(pg, { name = "FolkShop", title = "Shop", icon = M.ART.shop, sections = { { name = "Upgrades", icon = M.ART.star, color = M.COLOR.gold, quests = shopRows() } } })
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
			confirm = r.confirm,
			color = if r.confirm then M.COLOR.crimson else M.COLOR.green,
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

-- яйца: карточки-«ящики» кита, цена в деньгах игры
local EGG_COLORS = { "green", "blue", "orange", "gold", "pink", "purple", "lime", "amber", "crimson", "hudBlue", "red" }

local function eggCfg(): any
	local crates = {}
	local rebirths = attr("Rebirths", 0)
	for i, egg in Eggs.List do
		local contents = {}
		for _, p in PetCatalog.ofEgg(egg.id) do
			if #contents < 5 then
				table.insert(contents, { chance = string.upper(p.rarity), art = M.ART.star })
			end
		end
		table.insert(crates, {
			id = egg.id,
			rank = if rebirths >= egg.gate then "EGG" else "REBIRTH " .. egg.gate,
			name = egg.name,
			color = M.COLOR[EGG_COLORS[(i - 1) % #EGG_COLORS + 1]],
			art = M.ART.star,
			price = Formulas.formatMoney(egg.price),
			contents = contents,
		})
	end
	return { name = "FolkEggs", title = "Eggs", icon = M.ART.star, crates = crates }
end

local function fixEggPrices(gui: Instance)
	for i, egg in Eggs.List do
		local crate = gui:FindFirstChild("Crate" .. i, true)
		if crate then
			local gift = crate:FindFirstChild("Gift", true)
			if gift and gift:IsA("GuiObject") then
				gift.Visible = false
			end
			for _, d in crate:GetDescendants() do
				if d:IsA("TextLabel") and (d.Name == "Price" or d.Name == "PriceDrop") then
					d.Text = "$" .. Formulas.formatMoney(egg.price)
				end
			end
		end
	end
end

-- рюкзак питомцев
local BONUS_NAME = { speed = "SPEED", luck = "LUCK", income = "INCOME" }
local inventory: any = { pets = {}, equipped = {} }

local function petsCfg(): any
	local items = {}
	for _, p in inventory.pets do
		local def = PetCatalog.byId(p.id)
		local bonus = if def then Config.Pets.Bonus[def.rarity] or 0 else 0
		table.insert(items, {
			id = tostring(p.uid),
			name = if def then def.name else p.id,
			rarity = if def then def.rarity else "Common",
			art = M.ART.star,
			desc = if def then "From the " .. (Eggs.byId(def.egg) or { name = "?" }).name else "",
			stats = { { if def then BONUS_NAME[def.bonus] else "BONUS", "+" .. math.floor(bonus * 100 + 0.5) .. "%" }, { "RARITY", if def then string.upper(def.rarity) else "?" } },
			equipped = table.find(inventory.equipped, p.uid) ~= nil,
		})
	end
	table.sort(items, function(a, b)
		if a.equipped ~= b.equipped then
			return a.equipped
		end
		return a.id < b.id
	end)
	if #items == 0 then
		items = { { id = "0", name = "No pets yet", rarity = "Common", art = M.ART.star, desc = "Buy an egg in Eggs", stats = {} } }
	end
	return { name = "FolkPets", title = "Pets", slots = `{#inventory.equipped}/{Config.Pets.Equipped} EQUIPPED`, sections = { { name = "Pets", color = M.COLOR.green, icon = M.ART.star, items = items } } }
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

-- Подсказки «Sell» видны только владельцу базы (сервер всё равно проверяет владельца).
local function watchSellPrompt(prompt: Instance)
	if not prompt:IsA("ProximityPrompt") then
		return
	end
	local function sync()
		prompt.Enabled = prompt:GetAttribute("OwnerUserId") == player.UserId
	end
	sync()
	prompt:GetAttributeChangedSignal("OwnerUserId"):Connect(sync)
end

function Menus.start()
	for _, p in CollectionService:GetTagged("SellPrompt") do
		watchSellPrompt(p)
	end
	CollectionService:GetInstanceAddedSignal("SellPrompt"):Connect(watchSellPrompt)
	local pg = player:WaitForChild("PlayerGui")
	local shop = buildShop(pg)
	local rebirth = M.rebirth(pg, rebirthCfg())
	local index = M.index(pg, indexCfg())
	local settings = M.settings(pg, settingsCfg())
	local sell = M.quests(pg, { name = "FolkSell", title = "Sell", icon = M.ART.star, sections = { { name = "Sell", icon = M.ART.star, color = M.COLOR.green, quests = sellRows() } } })
	for _, r in sellRows() do
		relabel(sell, "Quest" .. r.id, "SELL")
	end
	local eggs = M.shop(pg, eggCfg())
	fixEggPrices(eggs)
	local pets = M.backpack(pg, petsCfg())
	for _, g in { shop, rebirth, index, settings, sell, eggs, pets } do
		g.Enabled = false
	end
	local hud = M.hud(pg, { buttons = {
		{ label = "Shop", icon = M.ART.shop, color = M.COLOR.hudShop, opens = "FolkShop" },
		{ label = "Eggs", icon = M.ART.star, color = M.COLOR.green, opens = "FolkEggs" },
		{ label = "Pets", icon = M.ART.star, color = M.COLOR.orange, opens = "FolkPets" },
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
	-- продажа Legendary и сильнее — два нажатия: первое спрашивает «SURE?»
	local armed: { [string]: number } = {}
	M.live(sell, {
		claim = function(rarity: string)
			local needsConfirm = false
			for _, r in sellRows() do
				if r.id == rarity then
					needsConfirm = r.confirm == true
				end
			end
			local now = os.clock()
			if needsConfirm and (armed[rarity] or 0) < now then
				armed[rarity] = now + 3
				relabel(sell, "Quest" .. rarity, "SURE?")
				task.delay(3, function()
					if (armed[rarity] or 0) <= os.clock() then
						relabel(sell, "Quest" .. rarity, "SELL")
					end
				end)
				return
			end
			armed[rarity] = nil
			relabel(sell, "Quest" .. rarity, "SELL")
			Remotes.get("Sell"):FireServer({ mode = "below", rarity = rarity })
		end,
	})
	-- ползунок шлёт значение на каждом шаге: на сервер уходит последнее через 0.4 с
	local queue = SettingsQueue.new()
	M.settingsLive(settings, {
		change = function(id: string, value: any)
			ClientSettings.set(id, value)
			if queue.push(id, value) then
				task.delay(0.4, function()
					Remotes.get("Settings"):FireServer(id, queue.take(id))
				end)
			end
		end,
	})
	local screens = { FolkShop = shop, FolkIndex = index, FolkRebirth = rebirth, FolkSettings = settings, FolkSell = sell, FolkEggs = eggs, FolkPets = pets }
	M.hudLive(hud, screens)

	M.live(eggs, {
		buy = function(eggId: string)
			Remotes.get("Hatch"):FireServer(eggId)
		end,
	})
	-- рюкзак: «EQUIP» берёт питомца, у взятого кнопка «UNEQUIP» убирает
	local function selectPet(gui: Instance, id: string)
		M.selectItem(gui, id)
		local panel = gui:FindFirstChild("Panel", true)
		local use = panel and panel:FindFirstChild("Use")
		local done = panel and panel:FindFirstChild("Done")
		local uid = tonumber(id)
		if use and done and uid and table.find(inventory.equipped, uid) then
			use.Visible = true
			done.Visible = false
			for _, n in { "Label", "LabelDrop" } do
				local l = use:FindFirstChild(n)
				if l and l:IsA("TextLabel") then
					l.Text = "UNEQUIP"
				end
			end
		end
	end
	local function livePets(gui: Instance)
		M.live(gui, {
			pick = function(id: string)
				selectPet(gui, id)
			end,
			use = function(id: string)
				local uid = tonumber(id)
				if uid and uid > 0 then
					Remotes.get("Equip"):FireServer(uid, table.find(inventory.equipped, uid) == nil)
				end
			end,
		})
	end
	livePets(pets)
	Remotes.get("PetInventory").OnClientEvent:Connect(function(msg: any)
		if type(msg) ~= "table" or type(msg.pets) ~= "table" or type(msg.equipped) ~= "table" then
			return
		end
		inventory = msg
		local wasOpen = screens.FolkPets.Enabled
		local selected = screens.FolkPets:GetAttribute("Selected")
		screens.FolkPets:Destroy()
		local fresh = M.backpack(pg, petsCfg())
		fresh.Enabled = wasOpen
		screens.FolkPets = fresh
		livePets(fresh)
		if type(selected) == "string" then
			pcall(selectPet, fresh, selected)
		end
	end)
	Remotes.get("Hatched").OnClientEvent:Connect(function(msg: any)
		if type(msg) == "table" and type(msg.egg) == "string" and type(msg.pet) == "string" then
			if screens.FolkEggs.Enabled then
				M.show(screens.FolkEggs, false)
			end
			Hatch.play(msg.egg, msg.pet)
		end
	end)
	player:GetAttributeChangedSignal("Rebirths"):Connect(function()
		local open = screens.FolkEggs.Enabled
		screens.FolkEggs:Destroy()
		local fresh = M.shop(pg, eggCfg())
		fixEggPrices(fresh)
		fresh.Enabled = open
		screens.FolkEggs = fresh
		M.live(fresh, {
			buy = function(eggId: string)
				Remotes.get("Hatch"):FireServer(eggId)
			end,
		})
	end)

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
			for _, g in { shop, index, rebirth, settings } do
				if g.Enabled then
					M.show(g, false)
				end
			end
			M.show(sell, true)
		end
	end)
end

return Menus
