-- Thunderstorm: server side.
-- Runs the clear/storm cycle, picks where lightning lands, deals strike damage,
-- and tells clients what to draw. Late joiners read ReplicatedStorage's "Weather" attribute.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TextChatService = game:GetService("TextChatService")

local Config = require(ReplicatedStorage:WaitForChild("WeatherConfig"))
local Remote = ReplicatedStorage:WaitForChild("WeatherRemote")

local state = "Clear"
local stormToken = 0
local nextChange = os.clock() + Config.FirstStormDelay
ReplicatedStorage:SetAttribute("Weather", "Clear")

------------------------------------------------------------------ helpers
local function rand(range)
	return range[1] + math.random() * (range[2] - range[1])
end

-- Ground point under (x, z), looking through characters.
local function groundAt(x, z)
	local ignore = {}
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	for _ = 1, 5 do
		params.FilterDescendantsInstances = ignore
		local result = workspace:Raycast(Vector3.new(x, 1000, z), Vector3.new(0, -2000, 0), params)
		if not result then return nil end
		local model = result.Instance:FindFirstAncestorOfClass("Model")
		if model and model:FindFirstChildOfClass("Humanoid") then
			table.insert(ignore, model)
		else
			return result.Position
		end
	end
	return nil
end

local function randomPlayerRoot()
	local roots = {}
	for _, p in Players:GetPlayers() do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		if root then table.insert(roots, root) end
	end
	return roots[math.random(1, math.max(#roots, 1))]
end

------------------------------------------------------------------ damage
local function damageAt(position)
	local hit = {}
	for _, part in workspace:GetPartBoundsInRadius(position, Config.Radius) do
		local model = part:FindFirstAncestorOfClass("Model")
		local humanoid = model and model:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health > 0 then
			hit[humanoid] = model
		end
	end

	for humanoid, model in hit do
		local root = model:FindFirstChild("HumanoidRootPart") or model.PrimaryPart
		local distance = root and (root.Position - position).Magnitude or 0
		local falloff = 1 - 0.5 * math.clamp(distance / Config.Radius, 0, 1)
		local damage = Config.Damage * falloff

		if Players:GetPlayerFromCharacter(model) or Config.DummiesCanDie then
			humanoid:TakeDamage(damage)
		else
			humanoid.Health = math.max(humanoid.Health - damage, 1)
		end

		if root and not root.Anchored then
			local away = root.Position - position
			away = Vector3.new(away.X, 0, away.Z)
			away = if away.Magnitude > 0.01 then away.Unit else Vector3.zero
			root:ApplyImpulse((away + Vector3.new(0, 0.8, 0)) * Config.Knockback * falloff * root.AssemblyMass)
		end
	end
end

------------------------------------------------------------------ strikes
local function strike(position)
	Remote:FireAllClients("Strike", position)
	task.delay(Config.TelegraphTime, damageAt, position)
end

local function randomStrikePosition()
	local root = randomPlayerRoot()
	local center = root and root.Position or Vector3.zero
	local distance = if math.random() < Config.DirectHitChance then math.random() * 6 else rand(Config.StrikeRange)
	local angle = math.random() * math.pi * 2
	return groundAt(center.X + math.cos(angle) * distance, center.Z + math.sin(angle) * distance)
end

local function stormLoop(token)
	task.wait(if Config.Cutscene.Enabled then Config.Cutscene.Length else 2)
	while state == "Storm" and stormToken == token do
		local pos = randomStrikePosition()
		if pos then strike(pos) end
		task.wait(rand(Config.StrikeInterval))
	end
end

------------------------------------------------------------------ state changes
local function startStorm()
	if state == "Storm" then return end
	state = "Storm"
	stormToken += 1
	nextChange = os.clock() + Config.StormDuration
	ReplicatedStorage:SetAttribute("Weather", "Storm")

	-- the arrival bolt lands in front of a random player (or the map centre)
	local root = randomPlayerRoot()
	local arrival
	if root then
		local look = root.CFrame.LookVector
		local flat = Vector3.new(look.X, 0, look.Z)
		flat = if flat.Magnitude > 0.01 then flat.Unit else Vector3.zAxis
		local p = root.Position + flat * Config.Cutscene.ArrivalDistance
		arrival = groundAt(p.X, p.Z)
	end
	arrival = arrival or groundAt(0, 0) or Vector3.zero

	Remote:FireAllClients("Arrive", arrival)
	task.spawn(stormLoop, stormToken)
end

local function clearStorm()
	if state == "Clear" then return end
	state = "Clear"
	stormToken += 1
	nextChange = os.clock() + Config.ClearDuration
	ReplicatedStorage:SetAttribute("Weather", "Clear")
	Remote:FireAllClients("Clear")
end

-- auto cycle
task.spawn(function()
	while true do
		task.wait(1)
		if Config.AutoCycle and os.clock() >= nextChange then
			if state == "Clear" then startStorm() else clearStorm() end
		end
	end
end)

------------------------------------------------------------------ chat commands: /storm and /clear
local function allowed(player)
	return RunService:IsStudio() or player.UserId == game.CreatorId
end

local lastCommand = 0
local function runCommand(player, text)
	if not Config.ChatCommands or not player or not allowed(player) then return end
	if os.clock() - lastCommand < 1 then return end
	text = string.lower(text)
	if text:match("^/storm") then
		lastCommand = os.clock()
		clearStorm()
		startStorm()
	elseif text:match("^/clear") then
		lastCommand = os.clock()
		clearStorm()
	end
end

for alias, name in { ["/storm"] = "WeatherStorm", ["/clear"] = "WeatherClear" } do
	local cmd = Instance.new("TextChatCommand")
	cmd.Name = name
	cmd.PrimaryAlias = alias
	cmd.Parent = TextChatService
	cmd.Triggered:Connect(function(source, text)
		runCommand(Players:GetPlayerByUserId(source.UserId), text)
	end)
end

local function hookChat(player)
	player.Chatted:Connect(function(text)
		runCommand(player, text)
	end)
end
Players.PlayerAdded:Connect(hookChat)
for _, p in Players:GetPlayers() do hookChat(p) end

-- other server scripts can call these too
local api = Instance.new("BindableFunction")
api.Name = "WeatherControl"
api.OnInvoke = function(action)
	if action == "Storm" then clearStorm() startStorm()
	elseif action == "Clear" then clearStorm()
	elseif typeof(action) == "Vector3" then strike(action) end
	return state
end
api.Parent = script

-- Studio shortcut: during a playtest, set this script's "Command" attribute to Storm or Clear
-- in the Properties panel (server view) to trigger it instantly.
script:SetAttribute("Command", "")
script:GetAttributeChangedSignal("Command"):Connect(function()
	local command = script:GetAttribute("Command")
	if command == "Storm" then
		clearStorm()
		startStorm()
	elseif command == "Clear" then
		clearStorm()
	end
	if command ~= "" then script:SetAttribute("Command", "") end
end)
