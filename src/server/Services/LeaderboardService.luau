--!strict
-- Лидерборды: больше всего пойманных, лучшая находка ($/s), всего заработано.
-- OrderedDataStore, обновление раз в Config.Leaderboard.RefreshSeconds. Три доски стоят за каждой базой.
-- Без API (Studio, режим памяти) — топ из игроков сервера. Ошибка DataStore — одно предупреждение за цикл.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any

local Services = script.Parent
local PlayerData = require(Services:WaitForChild("PlayerData") :: ModuleScript) :: any
local MapService = require(Services:WaitForChild("MapService") :: ModuleScript) :: any

local LeaderboardService = {}

type Board = { key: string, store: string, title: string, money: boolean, value: (any) -> number }

local BOARDS: { Board } = {
	{ key = "caught", store = "LB_Caught_v1", title = "MOST CAUGHT", money = false, value = function(s) return s.stats.caught end },
	{ key = "best", store = "LB_Best_v1", title = "BEST CATCH $/s", money = true, value = function(s) return s.stats.bestCatch end },
	{ key = "earned", store = "LB_Earned_v1", title = "TOTAL EARNED", money = true, value = function(s) return s.stats.earned end },
}

type Row = { name: string, value: number }

local stores: { [string]: OrderedDataStore } = {}
local names: { [number]: string } = {}
local labels: { [string]: { TextLabel } } = {} -- ключ доски → строки на всех копиях доски

local function nameOf(userId: number): string
	local cached = names[userId]
	if cached then
		return cached
	end
	local p = Players:GetPlayerByUserId(userId)
	if p then
		names[userId] = p.DisplayName
		return p.DisplayName
	end
	local ok, n = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	local name = if ok and type(n) == "string" then n else ("#" .. userId)
	names[userId] = name
	return name
end

local function buildBoard(cf: CFrame, board: Board, parent: Instance)
	local part = Instance.new("Part")
	part.Name = "Board_" .. board.key
	part.Anchored = true
	part.Size = Vector3.new(14, 18, 1)
	part.CFrame = cf
	part.Material = Enum.Material.SmoothPlastic
	part.Color = Color3.fromRGB(30, 30, 40)
	part.Parent = parent
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 30
	gui.LightInfluence = 0
	gui.MaxDistance = 250
	gui.Parent = part
	local title = Instance.new("TextLabel")
	title.Size = UDim2.new(1, 0, 0.12, 0)
	title.BackgroundColor3 = Color3.fromRGB(255, 200, 0)
	title.Font = Enum.Font.FredokaOne
	title.TextScaled = true
	title.TextColor3 = Color3.new(1, 1, 1)
	title.Text = board.title
	title.Parent = gui
	local s = Instance.new("UIStroke")
	s.Thickness = 3.7
	s.LineJoinMode = Enum.LineJoinMode.Bevel
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	s.Parent = title
	local list = labels[board.key] or {}
	labels[board.key] = list
	for i = 1, Config.Leaderboard.Top do
		local row = Instance.new("TextLabel")
		row.Position = UDim2.new(0.04, 0, 0.13 + (i - 1) * 0.086, 0)
		row.Size = UDim2.new(0.92, 0, 0.08, 0)
		row.BackgroundTransparency = 1
		row.Font = Enum.Font.FredokaOne
		row.TextScaled = true
		row.TextXAlignment = Enum.TextXAlignment.Left
		row.TextColor3 = if i == 1 then Color3.fromRGB(255, 215, 0) elseif i == 2 then Color3.fromRGB(220, 220, 230) elseif i == 3 then Color3.fromRGB(230, 150, 80) else Color3.new(1, 1, 1)
		row.Text = `{i}. —`
		row.Parent = gui
		table.insert(list, row)
	end
end

local function render(board: Board, rows: { Row })
	for i, label in labels[board.key] or {} do
		local r = rows[((i - 1) % Config.Leaderboard.Top) + 1]
		if r then
			label.Text = `{((i - 1) % Config.Leaderboard.Top) + 1}. {r.name}  {if board.money then "$" .. Formulas.formatMoney(r.value) else Formulas.formatMoney(r.value)}`
		else
			label.Text = `{((i - 1) % Config.Leaderboard.Top) + 1}. —`
		end
	end
end

local function localTop(board: Board): { Row }
	local rows = {}
	for _, p in Players:GetPlayers() do
		local save = PlayerData.get(p)
		if save then
			table.insert(rows, { name = p.DisplayName, value = board.value(save) })
		end
	end
	table.sort(rows, function(a, b)
		return a.value > b.value
	end)
	return rows
end

local function refresh()
	local failed = false
	for _, board in BOARDS do
		local store = stores[board.key]
		if store and not PlayerData.isMemoryMode() then
			for _, p in Players:GetPlayers() do
				local save = PlayerData.get(p)
				if save then
					local ok = pcall(function()
						store:SetAsync(tostring(p.UserId), math.floor(board.value(save)))
					end)
					failed = failed or not ok
				end
			end
			local ok, pages = pcall(function()
				return store:GetSortedAsync(false, Config.Leaderboard.Top)
			end)
			if ok and pages then
				local rows = {}
				for _, entry in (pages :: any):GetCurrentPage() do
					table.insert(rows, { name = nameOf(tonumber(entry.key) or 0), value = entry.value })
				end
				render(board, rows)
			else
				failed = true
			end
		else
			render(board, localTop(board))
		end
	end
	if failed then
		warn("[Leaderboard] DataStore unavailable this cycle; boards keep the last values")
	end
end

function LeaderboardService.start()
	for _, board in BOARDS do
		local ok, store = pcall(function()
			return DataStoreService:GetOrderedDataStore(board.store)
		end)
		if ok then
			stores[board.key] = store
		end
	end
	local runtime = workspace:FindFirstChild("Runtime") or workspace
	local folder = Instance.new("Folder")
	folder.Name = "Leaderboards"
	folder.Parent = runtime
	for _, frame in MapService.baseFrames() do
		-- за базой (дальше от центра); лицевая сторона детали (−Z) смотрит на базу и центр кратера
		local back = frame * CFrame.new(0, 9.5, Config.Base.Depth / 2 + 6)
		for i, board in BOARDS do
			buildBoard(back * CFrame.new((i - 2) * 16, 0, 0), board, folder)
		end
	end
	task.spawn(function()
		task.wait(5)
		while true do
			local ok, err = pcall(refresh)
			if not ok then
				warn("[Leaderboard] refresh failed: " .. tostring(err))
			end
			task.wait(Config.Leaderboard.RefreshSeconds)
		end
	end)
end

return LeaderboardService
