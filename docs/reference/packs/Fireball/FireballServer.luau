-- Fireball: server side.
-- Checks each cast, works out where it lands, tells the other clients to draw it,
-- then deals area damage + knockback when the orb arrives.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("FireballConfig"))
local Remote = ReplicatedStorage:WaitForChild("FireballRemote")

local lastCast = {}

local function getCastPart(character)
	return character:FindFirstChild("RightHand")
		or character:FindFirstChild("Right Arm")
		or character:FindFirstChild("HumanoidRootPart")
end

local function isBadVector(v)
	return v.X ~= v.X or v.Y ~= v.Y or v.Z ~= v.Z
end

local function explode(caster, position)
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { caster.Character }

	local hit = {}
	for _, part in workspace:GetPartBoundsInRadius(position, Config.Radius, params) do
		local model = part:FindFirstAncestorOfClass("Model")
		local humanoid = model and model:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health > 0 and not hit[humanoid] then
			hit[humanoid] = model
		end
	end

	for humanoid, model in hit do
		local root = model:FindFirstChild("HumanoidRootPart") or model.PrimaryPart
		local distance = root and (root.Position - position).Magnitude or 0
		local falloff = 1 - 0.5 * math.clamp(distance / Config.Radius, 0, 1)
		local damage = Config.Damage * falloff

		local isPlayer = Players:GetPlayerFromCharacter(model) ~= nil
		if isPlayer or Config.DummiesCanDie then
			humanoid:TakeDamage(damage)
		else
			humanoid.Health = math.max(humanoid.Health - damage, 1)
		end

		if root and not root.Anchored then
			local away = root.Position - position
			away = Vector3.new(away.X, 0, away.Z)
			away = if away.Magnitude > 0.01 then away.Unit else Vector3.zero
			local push = (away + Vector3.new(0, 0.6, 0)) * Config.Knockback * falloff
			root:ApplyImpulse(push * root.AssemblyMass)
		end
	end
end

Remote.OnServerEvent:Connect(function(player, target)
	if typeof(target) ~= "Vector3" or isBadVector(target) then return end

	local now = os.clock()
	if lastCast[player] and now - lastCast[player] < Config.Cooldown * 0.9 then return end

	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local castPart = character and getCastPart(character)
	if not humanoid or humanoid.Health <= 0 or not castPart then return end

	lastCast[player] = now

	local origin = castPart.Position
	local offset = target - origin
	if offset.Magnitude < 1 then return end
	local dir = offset.Unit

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character }
	local result = workspace:Raycast(origin, dir * Config.MaxRange, params)
	local hitPos = if result then result.Position else origin + dir * Config.MaxRange

	for _, other in Players:GetPlayers() do
		if other ~= player then
			Remote:FireClient(other, player, origin, hitPos)
		end
	end

	local travelTime = Config.ChargeTime + (hitPos - origin).Magnitude / Config.Speed
	task.delay(travelTime, explode, player, hitPos)
end)

Players.PlayerRemoving:Connect(function(player)
	lastCast[player] = nil
end)
