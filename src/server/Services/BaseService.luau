--!strict
-- Базы игроков на краю кратера: 8 баз строятся кодом при старте, игрок получает свободную
-- при загрузке данных. Существа стоят на площадках с подписями, доход идёт раз в секунду,
-- при входе начисляется офлайн-доход. Персонаж появляется у переднего края своей базы.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Economy = require(Shared:WaitForChild("Economy") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any
local Creatures = require(Shared:WaitForChild("Catalog"):WaitForChild("Creatures") :: ModuleScript) :: any

local Services = script.Parent
local PlayerData = require(Services:WaitForChild("PlayerData") :: ModuleScript) :: any
local MapService = require(Services:WaitForChild("MapService") :: ModuleScript) :: any
local CreatureFactory = require(Services:WaitForChild("CreatureFactory") :: ModuleScript) :: any
local DebugService = require(Services:WaitForChild("DebugService") :: ModuleScript) :: any

local B = Config.Base

local BaseService = {}

type Base = {
	index: number,
	frame: CFrame,
	model: Model,
	floor: Part,
	trim: { Part },
	pads: { Part },
	creatures: Folder,
	sign: TextLabel,
	owner: Player?,
}

local OWNER_COLORS = {
	Color3.fromRGB(255, 89, 94),
	Color3.fromRGB(255, 202, 58),
	Color3.fromRGB(138, 201, 38),
	Color3.fromRGB(25, 130, 196),
	Color3.fromRGB(106, 76, 147),
	Color3.fromRGB(255, 146, 76),
	Color3.fromRGB(54, 209, 196),
	Color3.fromRGB(255, 112, 196),
}
local FREE_COLOR = Color3.fromRGB(120, 124, 130)
local PAD_OPEN = Color3.fromRGB(235, 238, 242)
local PAD_LOCKED = Color3.fromRGB(45, 48, 54)

local bases: { Base } = {}
local byPlayer: { [Player]: Base } = {}
local incomeMultiplier: (Player) -> number = function()
	return 1
end
local sellSlotHandler: ((Player, number) -> ())? = nil
local sellPadHandler: ((Player) -> ())? = nil

local function part(props: { [string]: any }, parent: Instance): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		(p :: any)[k] = v
	end
	p.Parent = parent
	return p
end

local function runtime(): Instance
	local r = workspace:FindFirstChild("Runtime")
	if not r then
		r = Instance.new("Folder")
		r.Name = "Runtime"
		r.Parent = workspace
	end
	return r :: Instance
end

local function padFrame(base: Base, i: number): CFrame
	local x, z = Formulas.padOffset(i)
	return base.frame * CFrame.new(x, 0.9, z)
end

local function buildBase(index: number, frame: CFrame, parent: Instance): Base
	local model = Instance.new("Model")
	model.Name = "Base" .. index
	local floor = part({ Name = "Floor", Size = Vector3.new(B.Width, 1, B.Depth), CFrame = frame, Material = Enum.Material.SmoothPlastic, Color = FREE_COLOR }, model)
	local trim = {}
	local w, d = B.Width, B.Depth
	for _, spec in { { 0, -d / 2, w + 1, 1 }, { 0, d / 2, w + 1, 1 }, { -w / 2, 0, 1, d + 1 }, { w / 2, 0, 1, d + 1 } } do
		table.insert(trim, part({ Name = "Trim", Size = Vector3.new(spec[3], 0.6, spec[4]), CFrame = frame * CFrame.new(spec[1], 0.8, spec[2]), Material = Enum.Material.Neon, Color = FREE_COLOR, CanCollide = false }, model))
	end
	local padsFolder = Instance.new("Folder")
	padsFolder.Name = "Pads"
	padsFolder.Parent = model
	local pads = {}
	for i = 1, B.SlotsMax do
		local x, z = Formulas.padOffset(i)
		local pad = part({ Name = "Pad" .. i, Size = Vector3.new(7, 0.4, 7), CFrame = frame * CFrame.new(x, 0.7, z), Material = Enum.Material.SmoothPlastic, Color = PAD_LOCKED }, padsFolder)
		local gui = Instance.new("SurfaceGui")
		gui.Name = "Lock"
		gui.Face = Enum.NormalId.Top
		gui.LightInfluence = 0
		gui.Parent = pad
		local lock = Instance.new("TextLabel")
		lock.Size = UDim2.fromScale(1, 1)
		lock.BackgroundTransparency = 1
		lock.Text = "🔒"
		lock.TextScaled = true
		lock.Parent = gui
		table.insert(pads, pad)
	end
	local creatures = Instance.new("Folder")
	creatures.Name = "Creatures"
	creatures.Parent = model
	local signPart = part({ Name = "Sign", Size = Vector3.new(1, 1, 1), CFrame = frame * CFrame.new(0, 12, d / 2), Transparency = 1, CanCollide = false, CanQuery = false, CanTouch = false }, model)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(320, 60)
	gui.MaxDistance = 400
	gui.Parent = signPart
	local sign = Instance.new("TextLabel")
	sign.Size = UDim2.fromScale(1, 1)
	sign.BackgroundTransparency = 1
	sign.Font = Enum.Font.FredokaOne
	sign.TextScaled = true
	sign.TextColor3 = Color3.new(1, 1, 1)
	sign.Text = "Free base"
	sign.Parent = gui
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Parent = sign
	local sellPad = part({ Name = "SellPad", Size = Vector3.new(7, 0.5, 7), CFrame = frame * CFrame.new(w / 2 - 5, 0.75, -d / 2 + 5), Material = Enum.Material.Neon, Color = Color3.fromRGB(43, 224, 0) }, model)
	local sellPrompt = Instance.new("ProximityPrompt")
	sellPrompt.Name = "SellPrompt"
	sellPrompt.ActionText = "Sell creatures"
	sellPrompt.ObjectText = "Sell"
	sellPrompt.HoldDuration = 0
	sellPrompt.MaxActivationDistance = 10
	sellPrompt.RequiresLineOfSight = false
	sellPrompt.Parent = sellPad
	CollectionService:AddTag(sellPrompt, "SellPrompt")
	sellPrompt.Triggered:Connect(function(player)
		local b = bases[index]
		if b and b.owner == player and sellPadHandler then
			sellPadHandler(player)
		end
	end)
	model.PrimaryPart = floor
	model.Parent = parent
	return { index = index, frame = frame, model = model, floor = floor, trim = trim, pads = pads, creatures = creatures, sign = sign, owner = nil }
end

local function paint(base: Base, color: Color3)
	base.floor.Color = color:Lerp(Color3.new(1, 1, 1), 0.55)
	for _, t in base.trim do
		t.Color = color
	end
end

local function refreshPads(base: Base, slots: number)
	for i, pad in base.pads do
		local open = i <= slots
		pad.Color = if open then PAD_OPEN else PAD_LOCKED
		local lock = pad:FindFirstChild("Lock") :: SurfaceGui?
		if lock then
			lock.Enabled = not open
		end
	end
end

local function tagFor(model: Model, id: string, mutation: string?)
	local def = Creatures.byId(id)
	local box, size = model:GetBoundingBox()
	local anchor = part({ Name = "Tag", Size = Vector3.new(0.2, 0.2, 0.2), CFrame = CFrame.new(box.Position + Vector3.new(0, size.Y / 2 + 1.6, 0)), Transparency = 1, CanCollide = false, CanQuery = false, CanTouch = false }, model)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(170, 66)
	gui.MaxDistance = 90
	gui.Parent = anchor
	local list = Instance.new("UIListLayout")
	list.HorizontalAlignment = Enum.HorizontalAlignment.Center
	list.Parent = gui
	local function line(text: string, color: Color3, h: number)
		local l = Instance.new("TextLabel")
		l.Size = UDim2.new(1, 0, h, 0)
		l.BackgroundTransparency = 1
		l.Font = Enum.Font.FredokaOne
		l.TextScaled = true
		l.Text = text
		l.TextColor3 = color
		l.Parent = gui
		local s = Instance.new("UIStroke")
		s.Thickness = 2
		s.Parent = l
	end
	local rarity = if def then def.rarity else "Common"
	local rc = Rarity.Info[rarity].color
	line(if def then def.name else id, Color3.new(1, 1, 1), 0.32)
	line(rarity, Color3.fromRGB(rc[1], rc[2], rc[3]), 0.24)
	if mutation then
		local m = Rarity.mutation(mutation)
		line(mutation, if m then Color3.fromRGB(m.color[1], m.color[2], m.color[3]) else Color3.new(1, 1, 1), 0.2)
	end
	line("$" .. Formulas.formatMoney(Formulas.creatureIncome(id, mutation)) .. "/s", Color3.fromRGB(120, 255, 120), 0.24)
end

local function showCreature(base: Base, slot: number, owned: { id: string, mutation: string? })
	local old = base.creatures:FindFirstChild("Slot" .. slot)
	if old then
		old:Destroy()
	end
	local model = CreatureFactory.build(owned.id, owned.mutation)
	model.Name = "Slot" .. slot
	CreatureFactory.placeOn(model, padFrame(base, slot))
	tagFor(model, owned.id, owned.mutation)
	model:SetAttribute("Slot", slot)
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "SellPrompt"
	prompt.ActionText = "Sell"
	prompt.ObjectText = "$" .. Formulas.formatMoney(Formulas.sellValue(owned.id, owned.mutation))
	prompt.HoldDuration = 0.6
	prompt.MaxActivationDistance = 8
	prompt.RequiresLineOfSight = false
	if base.owner then
		prompt:SetAttribute("OwnerUserId", base.owner.UserId)
	end
	prompt.Parent = model.PrimaryPart
	CollectionService:AddTag(prompt, "SellPrompt")
	prompt.Triggered:Connect(function(player)
		if base.owner == player and sellSlotHandler and model.Parent == base.creatures then
			sellSlotHandler(player, slot)
		end
	end)
	model.Parent = base.creatures
end

local function showAll(base: Base, save: any)
	base.creatures:ClearAllChildren()
	for slot, owned in save.creatures do
		showCreature(base, slot, owned)
	end
	refreshPads(base, save.slots)
end

local function spawnFrame(base: Base): CFrame
	return base.frame * CFrame.new(0, 3, -B.Depth / 2 + 5)
end

local function syncStats(player: Player, save: any)
	local income = Formulas.incomePerSecond(save.creatures, save.rebirths, incomeMultiplier(player))
	player:SetAttribute("Money", save.money)
	player:SetAttribute("Income", income)
	player:SetAttribute("Rebirths", save.rebirths)
	player:SetAttribute("Strength", save.strength)
	player:SetAttribute("Slots", save.slots)
	player:SetAttribute("Caught", save.stats.caught)
	player:SetAttribute("BestCatch", save.stats.bestCatch)
	player:SetAttribute("Earned", save.stats.earned)
	local best, bestIncome = nil, -1
	for _, c in save.creatures do
		local inc = Formulas.creatureIncome(c.id, c.mutation)
		if inc > bestIncome then
			best, bestIncome = c.id, inc
		end
	end
	player:SetAttribute("BestCreature", best)
	local stats = player:FindFirstChild("leaderstats")
	if stats then
		local cash = stats:FindFirstChild("Cash") :: IntValue?
		local reb = stats:FindFirstChild("Rebirths") :: IntValue?
		if cash then
			cash.Value = save.money
		end
		if reb then
			reb.Value = save.rebirths
		end
	end
end

local function leaderstats(player: Player)
	if player:FindFirstChild("leaderstats") then
		return
	end
	local f = Instance.new("Folder")
	f.Name = "leaderstats"
	local cash = Instance.new("IntValue")
	cash.Name = "Cash"
	cash.Parent = f
	local reb = Instance.new("IntValue")
	reb.Name = "Rebirths"
	reb.Parent = f
	f.Parent = player
end

local function assign(player: Player, save: any)
	if byPlayer[player] then
		return
	end
	local base: Base? = nil
	for _, b in bases do
		if not b.owner then
			base = b
			break
		end
	end
	if not base then
		warn(`[Base] no free base for {player.Name}`)
		return
	end
	base.owner = player
	byPlayer[player] = base
	player:SetAttribute("BaseIndex", base.index)
	local padPrompt = base.model:FindFirstChild("SellPrompt", true)
	if padPrompt then
		padPrompt:SetAttribute("OwnerUserId", player.UserId)
	end
	paint(base, OWNER_COLORS[base.index])
	base.sign.Text = player.DisplayName .. "'s Base"
	showAll(base, save)
	leaderstats(player)
	local away = PlayerData.offlineSeconds(player)
	local income = Formulas.incomePerSecond(save.creatures, save.rebirths, incomeMultiplier(player))
	local earned = Formulas.offlineEarnings(income, away)
	if earned > 0 then
		Economy.earn(save, earned)
		Remotes.get("Notify"):FireClient(player, "While you were away: +$" .. Formulas.formatMoney(earned))
	end
	syncStats(player, save)
	if player.Character then
		player.Character:PivotTo(spawnFrame(base))
	end
end

local function release(player: Player)
	local base = byPlayer[player]
	byPlayer[player] = nil
	if not base then
		return
	end
	if player.Parent then
		player:SetAttribute("BaseIndex", nil)
	end
	base.owner = nil
	base.creatures:ClearAllChildren()
	local padPrompt = base.model:FindFirstChild("SellPrompt", true)
	if padPrompt then
		padPrompt:SetAttribute("OwnerUserId", nil)
	end
	paint(base, FREE_COLOR)
	refreshPads(base, 0)
	base.sign.Text = "Free base"
end

function BaseService.baseOf(player: Player): { index: number, frame: CFrame, model: Model }?
	local b = byPlayer[player]
	return if b then { index = b.index, frame = b.frame, model = b.model } else nil
end

function BaseService.isInSafeZone(position: Vector3): boolean
	for _, b in bases do
		local p = b.frame:PointToObjectSpace(position)
		if Formulas.insideBase(p.X, p.Y, p.Z) then
			return true
		end
	end
	return false
end

function BaseService.isInOwnBase(player: Player, position: Vector3): boolean
	local b = byPlayer[player]
	if not b then
		return false
	end
	local p = b.frame:PointToObjectSpace(position)
	return Formulas.insideBase(p.X, p.Y, p.Z)
end

-- Продажа с подсказки на существе и площадка продажи: решает EconomyService.
function BaseService.onSellSlot(fn: (Player, number) -> ())
	sellSlotHandler = fn
end

function BaseService.onSellPad(fn: (Player) -> ())
	sellPadHandler = fn
end

-- Множитель дохода игрока (геймпассы, бусты). По умолчанию 1.
function BaseService.setIncomeMultiplier(fn: (Player) -> number)
	incomeMultiplier = fn
end

-- Заново показать базу после изменения сохранения (слоты, перерождение, сброс).
function BaseService.refresh(player: Player)
	local base = byPlayer[player]
	local save = PlayerData.get(player)
	if base and save then
		showAll(base, save)
		syncStats(player, save)
	end
end

function BaseService.addCreature(player: Player, creatureId: string, mutation: string?): "place" | "replace" | "sell"
	local save = PlayerData.get(player)
	local base = byPlayer[player]
	if not save or not base or not Creatures.byId(creatureId) then
		return "sell"
	end
	local new = { id = creatureId, mutation = if mutation and Rarity.mutation(mutation) then mutation else nil }
	local action, index = Formulas.placeOrReplace(save.creatures, save.slots, new)
	local slot: number? = nil
	if action == "place" then
		table.insert(save.creatures, new)
		slot = #save.creatures
	elseif action == "replace" and index then
		local old = save.creatures[index]
		save.money += Formulas.sellValue(old.id, old.mutation)
		save.creatures[index] = new
		slot = index
	else
		save.money += Formulas.sellValue(new.id, new.mutation)
	end
	local isNew = not save.collection[creatureId]
	save.collection[creatureId] = true
	if isNew then
		Remotes.get("Collection"):FireClient(player, { creatureId })
	end
	save.stats.caught += 1
	save.stats.bestCatch = math.max(save.stats.bestCatch, Formulas.creatureIncome(new.id, new.mutation))
	local where = base.frame.Position
	if slot then
		showCreature(base, slot, new)
		where = padFrame(base, slot).Position
	end
	syncStats(player, save)
	Remotes.get("CreatureRevealed"):FireAllClients(player, where, creatureId, new.mutation, action)
	return action
end

local function registerDebug()
	DebugService.register("give", "<Rarity|id> [Mutation]", function(player, args)
		local what = args[1]
		assert(what, "give <Rarity|id> [Mutation]")
		local id = what
		if Rarity.Info[what] then
			local list = Creatures.ofRarity(what)
			assert(#list > 0, "no creatures of rarity " .. what)
			id = list[math.random(1, #list)].id
		end
		assert(Creatures.byId(id), "unknown creature or rarity: " .. what)
		local mutation = args[2]
		assert(mutation == nil or Rarity.mutation(mutation), "unknown mutation " .. tostring(mutation))
		local action = BaseService.addCreature(player, id, mutation)
		return `{id}{if mutation then " " .. mutation else ""} → {action}`
	end)
	DebugService.register("slots", "<n>", function(player, args)
		local n = math.clamp(math.floor(tonumber(args[1]) or B.SlotsStart), B.SlotsStart, B.SlotsMax)
		PlayerData.update(player, function(save)
			save.slots = n
		end)
		BaseService.refresh(player)
		return "Slots = " .. n
	end)
end

function BaseService.start()
	local folder = Instance.new("Folder")
	folder.Name = "Bases"
	folder.Parent = runtime()
	for i, frame in MapService.baseFrames() do
		table.insert(bases, buildBase(i, frame, folder))
	end
	MapService.setSpawnResolver(function(player)
		local b = byPlayer[player]
		return if b then spawnFrame(b) else nil
	end)
	registerDebug()
	DebugService.after(function(player, cmd)
		if cmd == "reset" or cmd == "rebirths" or cmd == "money" then
			BaseService.refresh(player)
		end
	end)
	PlayerData.onLoaded(assign)
	for _, player in Players:GetPlayers() do
		local save = PlayerData.get(player)
		if save then
			assign(player, save)
		end
	end
	Players.PlayerRemoving:Connect(release)
	task.spawn(function()
		while true do
			task.wait(1)
			for player, _ in byPlayer do
				local save = PlayerData.get(player)
				if save and player.Parent then
					local income = Formulas.incomePerSecond(save.creatures, save.rebirths, incomeMultiplier(player))
					Economy.earn(save, income)
					syncStats(player, save)
				end
			end
		end
	end)
end

return BaseService
