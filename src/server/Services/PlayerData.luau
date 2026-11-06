--!strict
-- Загрузка и сохранение данных игрока в DataStore с блокировкой сессии.
-- Пока данные не загружены, get() возвращает nil и ничего не сохраняется.
-- Если загрузить не удалось — игрока выкидывает: пустые данные никогда не пишутся поверх настоящих.

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local DataSchema = require(Shared:WaitForChild("DataSchema") :: ModuleScript) :: any
local SessionLock = require(Shared:WaitForChild("SessionLock") :: ModuleScript) :: any

local D = Config.Data

type Session = {
	save: any,
	loaded: boolean,
	canSave: boolean,
	offlineSeconds: number,
}

local PlayerData = {}

local loadedHandlers: { (Player, any) -> () } = {}

-- Вызвать fn(player, save) после загрузки данных. save — настоящая таблица сохранения
-- (BindableEvent передавал бы копию, и изменения терялись бы).
function PlayerData.onLoaded(fn: (Player, any) -> ())
	table.insert(loadedHandlers, fn)
end

local store: DataStore? = nil
local memoryMode = false
local sessions: { [Player]: Session } = {}
local jobId = if game.JobId ~= "" then game.JobId else "studio-" .. HttpService:GenerateGUID(false)

local function keyFor(player: Player): string
	return D.KeyPrefix .. tostring(player.UserId)
end

local function enterMemoryMode(reason: string)
	if not memoryMode then
		memoryMode = true
		warn("[PlayerData] DataStore unavailable, progress will not be saved (Studio without API access). " .. reason)
	end
end

local function initStore()
	if game.GameId == 0 then
		enterMemoryMode("Place is not published.")
		return
	end
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(D.StoreName)
	end)
	if not ok then
		enterMemoryMode(tostring(result))
		return
	end
	store = result
	-- В Studio без доступа к API запросы падают — проверяем заранее.
	local probeOk, probeErr = pcall(function()
		(store :: DataStore):GetAsync("probe")
	end)
	if not probeOk and string.find(string.lower(tostring(probeErr)), "studio") then
		store = nil
		enterMemoryMode(tostring(probeErr))
	end
end

-- Одна попытка загрузки с захватом блокировки. Возвращает данные или nil.
local function tryLoad(player: Player): any
	local s = store :: DataStore
	local waits = 0
	while player.Parent do
		local decision: string = "take"
		local loaded: any = nil
		s:UpdateAsync(keyFor(player), function(old)
			local save = DataSchema.migrate(old)
			decision = SessionLock.decide(save.lock, jobId, os.time())
			if decision == "wait" and waits >= D.LockWaitTries then
				decision = "steal"
			end
			if decision == "wait" then
				return nil -- не пишем, подождём
			end
			save.lock = { jobId = jobId, time = os.time() }
			loaded = save
			return save
		end)
		if decision ~= "wait" then
			return loaded
		end
		waits += 1
		task.wait(D.LockWaitSeconds)
	end
	return nil
end

local function loadPlayer(player: Player)
	local session: Session = { save = nil, loaded = false, canSave = false, offlineSeconds = 0 }
	sessions[player] = session
	local save: any = nil
	if memoryMode or not store then
		save = DataSchema.default()
	else
		for attempt = 1, D.LoadRetries do
			local ok, result = pcall(tryLoad, player)
			if ok and result then
				save = result
				break
			end
			if not ok then
				warn(`[PlayerData] load attempt {attempt} for {player.Name} failed: {result}`)
			end
			if not player.Parent then
				return
			end
			task.wait(2 ^ (attempt - 1))
		end
	end
	if not player.Parent then
		sessions[player] = nil
		return
	end
	if not save then
		sessions[player] = nil
		player:Kick("Couldn't load your data, please rejoin")
		return
	end
	save = DataSchema.sanitize(save)
	session.offlineSeconds = if save.lastOnline > 0 then math.max(0, os.time() - save.lastOnline) else 0
	session.save = save
	session.loaded = true
	session.canSave = not memoryMode
	for _, fn in loadedHandlers do
		local ok, err = pcall(fn, player, save)
		if not ok then
			warn(`[PlayerData] load handler failed for {player.Name}: {err}`)
		end
	end
end

-- Запись с проверкой, что блокировка всё ещё наша. release — снять блокировку (выход).
local function write(player: Player, release: boolean)
	local session = sessions[player]
	if not session or not session.loaded or not session.canSave or not store then
		return
	end
	local stolen = false
	local ok, err = pcall(function()
		(store :: DataStore):UpdateAsync(keyFor(player), function(old)
			local current = DataSchema.migrate(old)
			if current.lock and current.lock.jobId ~= jobId then
				stolen = true
				return nil
			end
			local out = table.clone(session.save)
			out.lastOnline = os.time()
			out.lock = if release then nil else { jobId = jobId, time = os.time() }
			return out
		end)
	end)
	if not ok then
		warn(`[PlayerData] save for {player.Name} failed: {err}`)
	elseif stolen then
		session.canSave = false
		warn(`[PlayerData] {player.Name}'s data is now owned by another server; this server stops saving it`)
		if player.Parent then
			player:Kick("Your data was opened in another server, please rejoin")
		end
	end
end

function PlayerData.get(player: Player): any
	local session = sessions[player]
	return if session and session.loaded then session.save else nil
end

-- Изменить данные игрока. false — данные ещё не загружены.
function PlayerData.update(player: Player, fn: (any) -> ()): boolean
	local save = PlayerData.get(player)
	if not save then
		return false
	end
	fn(save)
	return true
end

function PlayerData.offlineSeconds(player: Player): number
	local session = sessions[player]
	return if session then session.offlineSeconds else 0
end

function PlayerData.saveNow(player: Player)
	write(player, false)
end

function PlayerData.isMemoryMode(): boolean
	return memoryMode
end

function PlayerData.start()
	initStore()
	Players.PlayerAdded:Connect(function(player)
		task.spawn(loadPlayer, player)
	end)
	for _, player in Players:GetPlayers() do
		task.spawn(loadPlayer, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		write(player, true)
		sessions[player] = nil
	end)
	task.spawn(function()
		while true do
			task.wait(D.AutosaveSeconds)
			for player in sessions do
				task.spawn(write, player, false)
			end
		end
	end)
	game:BindToClose(function()
		local pending = 0
		for player in sessions do
			pending += 1
			task.spawn(function()
				write(player, true)
				pending -= 1
			end)
		end
		local deadline = os.clock() + 25
		while pending > 0 and os.clock() < deadline do
			task.wait(0.2)
		end
	end)
end

return PlayerData
