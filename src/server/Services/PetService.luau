--!strict
-- Питомцы на сервере: покупка и вылупление яиц, экипировка, бонусы. Бонусы — атрибуты игрока
-- BonusSpeed, BonusLuck, BonusIncome (их читают CarryService, MeteorService и доход базы);
-- атрибут Pets — id экипированных через запятую, по нему клиенты рисуют питомцев.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Pets = require(Shared:WaitForChild("Pets") :: ModuleScript) :: any
local RateLimit = require(Shared:WaitForChild("RateLimit") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any
local Eggs = require(Shared:WaitForChild("Catalog"):WaitForChild("Eggs") :: ModuleScript) :: any
local PetCatalog = require(Shared:WaitForChild("Catalog"):WaitForChild("Pets") :: ModuleScript) :: any

local Services = script.Parent
local PlayerData = require(Services:WaitForChild("PlayerData") :: ModuleScript) :: any
local BaseService = require(Services:WaitForChild("BaseService") :: ModuleScript) :: any
local CarryService = require(Services:WaitForChild("CarryService") :: ModuleScript) :: any
local DebugService = require(Services:WaitForChild("DebugService") :: ModuleScript) :: any

local PetService = {}

local hatchLimit = RateLimit.new(2, 2)
local equipLimit = RateLimit.new(6, 6)
local rng = Random.new()

local function rngFn(): number
	return rng:NextNumber()
end

local function notify(player: Player, text: string)
	Remotes.get("Notify"):FireClient(player, text)
end

-- Атрибуты бонусов, список экипированных, скорость; окно Pets получает рюкзак.
function PetService.sync(player: Player)
	local save = PlayerData.get(player)
	if not save then
		return
	end
	local b = Pets.bonuses(save)
	player:SetAttribute("BonusSpeed", b.speed)
	player:SetAttribute("BonusLuck", b.luck)
	player:SetAttribute("BonusIncome", b.income)
	local ids = {}
	for _, uid in save.equipped do
		for _, p in save.pets do
			if p.uid == uid then
				table.insert(ids, p.id)
			end
		end
	end
	player:SetAttribute("Pets", table.concat(ids, ","))
	CarryService.applySpeed(player)
	BaseService.sync(player)
	Remotes.get("PetInventory"):FireClient(player, { pets = save.pets, equipped = save.equipped })
end

local REASON = { money = "Not enough money", locked = "Rebirth more to open this egg", full = "Your pet bag is full", unknown = "Unknown egg" }

local function onHatch(player: Player, eggId: any)
	if type(eggId) ~= "string" or not hatchLimit.allow(player.UserId, os.clock()) then
		return
	end
	local save = PlayerData.get(player)
	if not save then
		return
	end
	local ok, result = Pets.buyEgg(save, eggId, rngFn)
	if not ok then
		notify(player, REASON[result :: string] or "Can't hatch")
		return
	end
	-- первый питомец сразу идёт с игроком
	if #save.equipped == 0 then
		Pets.equip(save, save.pets[#save.pets].uid)
	end
	Remotes.get("Hatched"):FireClient(player, { egg = eggId, pet = result })
	PetService.sync(player)
end

local function onEquip(player: Player, uid: any, on: any)
	if type(uid) ~= "number" or type(on) ~= "boolean" or not equipLimit.allow(player.UserId, os.clock()) then
		return
	end
	local save = PlayerData.get(player)
	if not save then
		return
	end
	if on then
		local ok, why = Pets.equip(save, uid)
		if not ok and why == "limit" then
			notify(player, "You can take 3 pets")
		end
	else
		Pets.unequip(save, uid)
	end
	PetService.sync(player)
end

local function registerDebug()
	DebugService.register("egg", "<egg id>", function(player, args)
		local egg = Eggs.byId(args[1] or "")
		assert(egg, "egg ids: Colorful, Pastel, Fruity, Hunter, IceCream, Neon, Dinosaur, Job, Duck, Lunar, Emperor")
		local save = PlayerData.get(player)
		assert(save, "data not loaded")
		save.money += egg.price
		save.rebirths = math.max(save.rebirths, egg.gate)
		local ok, petId = Pets.buyEgg(save, egg.id, rngFn)
		assert(ok, tostring(petId))
		Remotes.get("Hatched"):FireClient(player, { egg = egg.id, pet = petId })
		PetService.sync(player)
		local def = PetCatalog.byId(petId)
		return `{egg.name} → {petId} ({def and def.rarity or "?"})`
	end)
	DebugService.register("pets", "", function(player, _args)
		local save = PlayerData.get(player)
		assert(save, "data not loaded")
		local b = Pets.bonuses(save)
		return `{#save.pets} pets, {#save.equipped} equipped; speed +{math.floor(b.speed * 100)}%, luck +{math.floor(b.luck * 100)}%, income +{math.floor(b.income * 100)}%`
	end)
end

function PetService.start()
	BaseService.setIncomeMultiplier(function(player: Player): number
		return 1 + ((player:GetAttribute("BonusIncome") :: number?) or 0)
	end)
	Remotes.get("Hatch").OnServerEvent:Connect(onHatch)
	Remotes.get("Equip").OnServerEvent:Connect(onEquip)
	PlayerData.onLoaded(function(player)
		PetService.sync(player)
	end)
	for _, player in Players:GetPlayers() do
		PetService.sync(player)
	end
	Players.PlayerRemoving:Connect(function(player)
		hatchLimit.forget(player.UserId)
		equipLimit.forget(player.UserId)
	end)
	registerDebug()
end

return PetService
