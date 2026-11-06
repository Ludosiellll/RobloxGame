--!strict
-- Данные игрока в DataStore: значения по умолчанию, миграция старых версий, очистка от мусора, покупки.

local Config = require(script.Parent.Config)
local Rarity = require(script.Parent.Rarity)
local Creatures = require(script.Parent.Catalog.Creatures)
local Economy = require(script.Parent.Economy)
local PetCatalog = require(script.Parent.Catalog.Pets)

export type Owned = { id: string, mutation: string? }

export type PlayerSave = {
	version: number,
	money: number,
	rebirths: number,
	speed: number,
	strength: number,
	slots: number,
	creatures: { Owned },
	collection: { [string]: boolean },
	stats: { caught: number, pushes: number, bestCatch: number, earned: number },
	indexClaimed: { [string]: boolean },
	pets: { { uid: number, id: string } },
	equipped: { number },
	nextPetUid: number,
	lastOnline: number,
	receipts: { string },
	settings: { [string]: any },
	lock: { jobId: string, time: number }?,
}

local VERSION = 1

local DataSchema = {}

function DataSchema.default(): PlayerSave
	return {
		version = VERSION,
		money = 0,
		rebirths = 0,
		speed = 0,
		strength = 0,
		slots = Config.Base.SlotsStart,
		creatures = {},
		collection = {},
		stats = { caught = 0, pushes = 0, bestCatch = 0, earned = 0 },
		indexClaimed = {},
		pets = {},
		equipped = {},
		nextPetUid = 1,
		lastOnline = 0,
		receipts = {},
		settings = {},
		lock = nil,
	}
end

-- Любые сырые данные → полная структура. Чего нет — из значений по умолчанию; лишнее сохраняется.
function DataSchema.migrate(raw: any): PlayerSave
	local save = DataSchema.default() :: any
	if type(raw) ~= "table" then
		return save
	end
	for k, v in raw do
		if k == "stats" and type(v) == "table" then
			for sk, sv in v do
				save.stats[sk] = sv
			end
		else
			save[k] = v
		end
	end
	save.version = VERSION
	return save
end

local function wholeNonNegative(v: any): number
	if type(v) ~= "number" or v ~= v or v == math.huge then
		return 0
	end
	return math.max(0, math.floor(v))
end

-- Приводит данные к допустимым значениям. Неизвестные существа удаляются, неизвестная мутация снимается.
function DataSchema.sanitize(save: PlayerSave): PlayerSave
	save.money = wholeNonNegative(save.money)
	save.rebirths = wholeNonNegative(save.rebirths)
	save.speed = if type(save.speed) == "number" and save.speed == save.speed and save.speed > 0 then math.floor(save.speed * 100 + 1e-6) / 100 else 0
	save.strength = math.min(wholeNonNegative(save.strength), Config.Carry.StrengthMaxLevel)
	save.slots = math.clamp(wholeNonNegative(save.slots), Config.Base.SlotsStart, Config.Base.SlotsMax)
	save.lastOnline = wholeNonNegative(save.lastOnline)

	local creatures: { Owned } = {}
	if type(save.creatures) == "table" then
		for _, c in save.creatures do
			if #creatures >= save.slots then
				break
			end
			if type(c) == "table" and type(c.id) == "string" and Creatures.byId(c.id) then
				local mutation = if type(c.mutation) == "string" and Rarity.mutation(c.mutation) then c.mutation else nil
				table.insert(creatures, { id = c.id, mutation = mutation })
			end
		end
	end
	save.creatures = creatures

	local collection: { [string]: boolean } = {}
	if type(save.collection) == "table" then
		for id, v in save.collection do
			if v == true and type(id) == "string" and Creatures.byId(id) then
				collection[id] = true
			end
		end
	end
	save.collection = collection

	local stats = if type(save.stats) == "table" then save.stats else ({} :: any)
	save.stats = {
		caught = wholeNonNegative(stats.caught),
		pushes = wholeNonNegative(stats.pushes),
		bestCatch = wholeNonNegative(stats.bestCatch),
		earned = wholeNonNegative(stats.earned),
	}

	local claimed: { [string]: boolean } = {}
	if type(save.indexClaimed) == "table" then
		for rarity, v in save.indexClaimed do
			if v == true and type(rarity) == "string" and Rarity.Info[rarity] then
				claimed[rarity] = true
			end
		end
	end
	save.indexClaimed = claimed

	local pets: { { uid: number, id: string } } = {}
	local uids: { [number]: boolean } = {}
	local maxUid = 0
	if type(save.pets) == "table" then
		for _, p in save.pets do
			if #pets >= Config.Pets.MaxOwned then
				break
			end
			if type(p) == "table" and type(p.uid) == "number" and p.uid >= 1 and p.uid == math.floor(p.uid) and not uids[p.uid] and type(p.id) == "string" and PetCatalog.byId(p.id) then
				uids[p.uid] = true
				maxUid = math.max(maxUid, p.uid)
				table.insert(pets, { uid = p.uid, id = p.id })
			end
		end
	end
	save.pets = pets
	local equipped: { number } = {}
	if type(save.equipped) == "table" then
		for _, uid in save.equipped do
			if #equipped < Config.Pets.Equipped and uids[uid] and not table.find(equipped, uid) then
				table.insert(equipped, uid)
			end
		end
	end
	save.equipped = equipped
	save.nextPetUid = math.max(wholeNonNegative(save.nextPetUid), maxUid + 1, 1)

	local receipts: { string } = {}
	if type(save.receipts) == "table" then
		for _, r in save.receipts do
			if type(r) == "string" then
				table.insert(receipts, r)
			end
		end
	end
	while #receipts > Config.Data.ReceiptsKept do
		table.remove(receipts, 1)
	end
	save.receipts = receipts

	local settings: { [string]: any } = {}
	if type(save.settings) == "table" then
		for id, v in save.settings do
			if type(id) == "string" then
				local clean = Economy.setting(id, v)
				if clean ~= nil then
					settings[id] = clean
				end
			end
		end
	end
	save.settings = settings
	return save
end

-- Запоминает покупку. false — эта покупка уже была засчитана.
function DataSchema.addReceipt(save: PlayerSave, id: string): boolean
	if table.find(save.receipts, id) then
		return false
	end
	table.insert(save.receipts, id)
	while #save.receipts > Config.Data.ReceiptsKept do
		table.remove(save.receipts, 1)
	end
	return true
end

return DataSchema
