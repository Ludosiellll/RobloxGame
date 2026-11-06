--!strict
-- Беговые дорожки: у каждой базы 3 лучшие открытые дорожки владельца (по перерождениям).
-- Скорость растёт, только если сервер видит игрока на ленте своей дорожки и он бежит
-- (MoveDirection или свежий сигнал Run от клиента).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Pets = require(Shared:WaitForChild("Pets") :: ModuleScript) :: any
local RateLimit = require(Shared:WaitForChild("RateLimit") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Services = script.Parent
local PlayerData = require(Services:WaitForChild("PlayerData") :: ModuleScript) :: any
local BaseService = require(Services:WaitForChild("BaseService") :: ModuleScript) :: any
local CarryService = require(Services:WaitForChild("CarryService") :: ModuleScript) :: any

local TreadmillService = {}

local folders: { [Player]: Folder } = {}
local lastRun: { [Player]: number } = {}
local runLimit = RateLimit.new(4, 4)
local warned = false

local function template(tier: number): Model?
	local packs = ReplicatedStorage:FindFirstChild("Packs")
	local row = packs and packs:FindFirstChild("TreadmillProgression")
	local m = row and row:FindFirstChild(string.format("Treadmill%02d", tier))
	if not m and not warned then
		warned = true
		warn("[Treadmill] ReplicatedStorage.Packs.TreadmillProgression not found — copy it from FreeTreadmillPack.rbxl (docs/ASSET_SETUP.md); using simple treadmills")
	end
	return if m and m:IsA("Model") then m else nil
end

local function simple(tier: number): Model
	local model = Instance.new("Model")
	model.Name = "Treadmill" .. tier
	local base = Instance.new("Part")
	base.Name = "Root"
	base.Anchored = true
	base.Size = Vector3.new(6, 1, 11)
	base.Material = Enum.Material.SmoothPlastic
	base.Color = Color3.fromRGB(40, 40, 46)
	base.Parent = model
	for _, x in { -3.2, 3.2 } do
		local rail = Instance.new("Part")
		rail.Anchored = true
		rail.CanCollide = false
		rail.Size = Vector3.new(0.4, 0.5, 11)
		rail.CFrame = CFrame.new(x, 0.6, 0)
		rail.Material = Enum.Material.Neon
		rail.Color = Color3.fromHSV((tier - 1) / 15, 0.8, 1)
		rail.Parent = model
	end
	model.PrimaryPart = base
	return model
end

local function label(model: Model, tier: number)
	local box, size = model:GetBoundingBox()
	local anchor = Instance.new("Part")
	anchor.Name = "Label"
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanQuery = false
	anchor.CanTouch = false
	anchor.Transparency = 1
	anchor.Size = Vector3.one * 0.2
	anchor.CFrame = CFrame.new(box.Position + Vector3.new(0, size.Y / 2 + 2, 0))
	anchor.Parent = model
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(200, 40)
	gui.MaxDistance = 80
	gui.Parent = anchor
	local text = Instance.new("TextLabel")
	text.Size = UDim2.fromScale(1, 1)
	text.BackgroundTransparency = 1
	text.Font = Enum.Font.FredokaOne
	text.TextScaled = true
	text.TextColor3 = Color3.new(1, 1, 1)
	text.Text = string.format("Tier %d · +%s speed/s", tier, tostring(math.floor(Pets.treadmillGain(tier, 1) * 100 + 0.5) / 100))
	text.Parent = gui
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Parent = text
end

local function build(player: Player)
	local old = folders[player]
	if old then
		old:Destroy()
		folders[player] = nil
	end
	local base = BaseService.baseOf(player)
	local save = PlayerData.get(player)
	if not base or not save then
		return
	end
	local folder = Instance.new("Folder")
	folder.Name = "Treadmills_" .. player.UserId
	for i, tier in Pets.baseTreadmills(save.rebirths) do
		local src = template(tier)
		local model = if src then src:Clone() else simple(tier)
		for _, d in model:GetDescendants() do
			if d:IsA("LuaSourceContainer") then
				d:Destroy()
			end
		end
		model:SetAttribute("Tier", tier)
		model:SetAttribute("OwnerUserId", player.UserId)
		model:PivotTo(base.frame * CFrame.new(-(Config.Base.Width / 2 + 12), 0.5, -14 + (i - 1) * 14))
		label(model, tier)
		CollectionService:AddTag(model, "Treadmill")
		model.Parent = folder
	end
	local runtime = workspace:FindFirstChild("Runtime") or workspace
	folder.Parent = runtime
	folders[player] = folder
end

-- На ленте ли точка: в границах дорожки по X/Z и не выше 8 studs над ней.
local function onBelt(model: Model, position: Vector3): boolean
	local box, size = model:GetBoundingBox()
	local p = box:PointToObjectSpace(position)
	return math.abs(p.X) <= size.X / 2 and math.abs(p.Z) <= size.Z / 2 and p.Y >= -size.Y / 2 and p.Y <= size.Y / 2 + 8
end

local function tick(dt: number)
	local now = os.clock()
	for player, folder in folders do
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local save = PlayerData.get(player)
		if root and humanoid and humanoid.Health > 0 and save and not CarryService.carrying(player) then
			local running = humanoid.MoveDirection.Magnitude > 0.5 or now - (lastRun[player] or 0) < 1
			if running then
				for _, model in folder:GetChildren() do
					if model:IsA("Model") and onBelt(model, root.Position) then
						local gain = Pets.treadmillGain(model:GetAttribute("Tier") :: number, dt)
						if gain > 0 then
							save.speed = math.floor((save.speed + gain) * 100 + 0.5) / 100
							player:SetAttribute("Speed", save.speed)
							CarryService.applySpeed(player)
						end
						break
					end
				end
			end
		end
	end
end

function TreadmillService.start()
	Remotes.get("Run").OnServerEvent:Connect(function(player)
		if runLimit.allow(player.UserId, os.clock()) then
			lastRun[player] = os.clock()
		end
	end)
	PlayerData.onLoaded(function(player, save)
		player:SetAttribute("Speed", save.speed)
		task.defer(build, player)
	end)
	local function watch(player: Player)
		player:GetAttributeChangedSignal("Rebirths"):Connect(function()
			build(player)
		end)
		player:GetAttributeChangedSignal("BaseIndex"):Connect(function()
			build(player)
		end)
	end
	Players.PlayerAdded:Connect(watch)
	for _, p in Players:GetPlayers() do
		watch(p)
		build(p)
	end
	Players.PlayerRemoving:Connect(function(player)
		local f = folders[player]
		if f then
			f:Destroy()
		end
		folders[player] = nil
		lastRun[player] = nil
		runLimit.forget(player.UserId)
	end)
	task.spawn(function()
		local last = os.clock()
		while true do
			task.wait(0.5)
			local now = os.clock()
			local ok, err = pcall(tick, now - last)
			last = now
			if not ok then
				warn("[Treadmill] tick failed: " .. tostring(err))
			end
		end
	end)
end

return TreadmillService
