--!strict
-- Переноска метеорита: подбор (проверка на сервере), камень над головой, замедление по редкости,
-- доставка на свою базу, сброс при смерти, выходе, толчке и подозрительной скорости.
-- Здесь же скорость персонажа и оглушение: всё, что меняет WalkSpeed, идёт через applySpeed.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any

local Services = script.Parent
local PlayerData = require(Services:WaitForChild("PlayerData") :: ModuleScript) :: any
local MeteorService = require(Services:WaitForChild("MeteorService") :: ModuleScript) :: any
local BaseService = require(Services:WaitForChild("BaseService") :: ModuleScript) :: any

local CarryService = {}

type Carry = { id: string, rarity: string }

local carrying: { [Player]: Carry } = {}
local stunnedUntil: { [Player]: number } = {}
local lastGood: { [Player]: { pos: Vector3, t: number } } = {}
local DEFAULT_JUMP = 7.2

local function parts(player: Player): (Model?, Humanoid?, BasePart?)
	local character = player.Character
	if not character then
		return nil, nil, nil
	end
	return character, character:FindFirstChildOfClass("Humanoid"), character:FindFirstChild("HumanoidRootPart") :: BasePart?
end

function CarryService.isStunned(player: Player): boolean
	return (stunnedUntil[player] or 0) > os.clock()
end

-- Скорость и прыжок из сохранения, переноски и оглушения.
function CarryService.applySpeed(player: Player)
	local _, humanoid = parts(player)
	if not humanoid then
		return
	end
	local save = PlayerData.get(player)
	local bonus = if save then save.speed else 0
	local strength = if save then save.strength else 0
	local mult = 1
	local c = carrying[player]
	if c then
		mult = Formulas.carryMultiplier(c.rarity, strength)
	end
	if CarryService.isStunned(player) then
		humanoid.WalkSpeed = 0
		humanoid.JumpHeight = 0
		return
	end
	humanoid.UseJumpPower = false
	humanoid.WalkSpeed = (Config.BaseWalkSpeed + bonus) * mult
	humanoid.JumpHeight = DEFAULT_JUMP * mult
end

function CarryService.stun(player: Player, seconds: number)
	stunnedUntil[player] = os.clock() + seconds
	CarryService.applySpeed(player)
	task.delay(seconds + 0.05, function()
		if player.Parent and not CarryService.isStunned(player) then
			CarryService.applySpeed(player)
		end
	end)
end

function CarryService.carrying(player: Player): string?
	local c = carrying[player]
	return c and c.id
end

local function clear(player: Player)
	carrying[player] = nil
	player:SetAttribute("Carrying", nil)
	player:SetAttribute("CarryId", nil)
	CarryService.applySpeed(player)
end

local function groundBelow(position: Vector3, ignore: { Instance }): Vector3
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = ignore
	local hit = workspace:Raycast(position + Vector3.new(0, 4, 0), Vector3.new(0, -300, 0), params)
	return if hit then hit.Position else position
end

-- Уронить метеорит: на землю под игроком (или в точке at), подбор снова доступен через DroppedPickupDelay.
function CarryService.forceDrop(player: Player, reason: string, at: Vector3?)
	local c = carrying[player]
	if not c then
		return
	end
	local character, _, root = parts(player)
	local m = MeteorService.get(c.id)
	local from = at or (root and root.Position) or (m and m.position) or Vector3.zero
	local ignore: { Instance } = {}
	if character then
		table.insert(ignore, character)
	end
	if m and m.model then
		table.insert(ignore, m.model)
	end
	local runtime = workspace:FindFirstChild("Runtime")
	if runtime then
		table.insert(ignore, runtime)
	end
	MeteorService.drop(c.id, groundBelow(from, ignore))
	clear(player)
	if reason == "speed" then
		warn(`[Carry] {player.Name} dropped the meteor: moving too fast`)
	end
end

local function pickUp(player: Player, id: string)
	if carrying[player] or CarryService.isStunned(player) then
		return
	end
	local character, humanoid, root = parts(player)
	local head = character and character:FindFirstChild("Head") :: BasePart?
	local m = MeteorService.get(id)
	if not character or not humanoid or humanoid.Health <= 0 or not root or not head or not m or not m.model then
		return
	end
	if m.state ~= "ready" and m.state ~= "dropped" then
		return
	end
	local rock = m.model.PrimaryPart
	if not rock or (rock.Position - root.Position).Magnitude > Config.Meteor.PickupDistance + 6 then
		return
	end
	MeteorService.setCarried(id, player)
	carrying[player] = { id = id, rarity = m.rarity }
	local offset = 3.5 + rock.Size.Y / 2
	for _, d in m.model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanCollide = false
			d.Massless = true
			d.Anchored = false
		end
	end
	m.model:PivotTo(head.CFrame * CFrame.new(0, offset, 0))
	for _, d in m.model:GetDescendants() do
		if d:IsA("BasePart") then
			local weld = Instance.new("WeldConstraint")
			weld.Part0 = head
			weld.Part1 = d
			weld.Parent = d
		end
	end
	player:SetAttribute("Carrying", m.rarity)
	player:SetAttribute("CarryId", id)
	lastGood[player] = { pos = root.Position, t = os.clock() }
	CarryService.applySpeed(player)
end

-- Законно ли игрок переместился с прошлой проверки. Нет — метеорит падает в последней нормальной точке,
-- игрока возвращает туда же. Проверка идёт перед доставкой, поэтому телепорт на базу не засчитывается.
local function movedLegally(player: Player, root: BasePart, humanoid: Humanoid, now: number): boolean
	local prev = lastGood[player]
	if not prev then
		lastGood[player] = { pos = root.Position, t = now }
		return true
	end
	local launched = (player:GetAttribute("LaunchedAt") :: number?) or 0
	local sinceLaunch = workspace:GetServerTimeNow() - launched
	local flat = Vector3.new(root.Position.X - prev.pos.X, 0, root.Position.Z - prev.pos.Z).Magnitude
	if Formulas.moveAllowed(flat, now - prev.t, humanoid.WalkSpeed, sinceLaunch) then
		lastGood[player] = { pos = root.Position, t = now }
		return true
	end
	CarryService.forceDrop(player, "speed", prev.pos)
	root.CFrame = CFrame.new(prev.pos) * root.CFrame.Rotation
	return false
end

-- Доставка: сначала забираем метеорит и снимаем переноску, потом кладём существо —
-- ошибка при постройке модели не даст доставить один метеорит дважды.
local function deliver(player: Player, c: Carry)
	local m = MeteorService.get(c.id)
	clear(player)
	if not m then
		return
	end
	local creatureId, mutation = m.creatureId, m.mutation
	MeteorService.consume(c.id)
	local ok, err = pcall(BaseService.addCreature, player, creatureId, mutation)
	if not ok then
		warn(`[Carry] delivery for {player.Name} failed: {err}`)
	end
end

local function checkCarrier(player: Player, c: Carry, now: number)
	local _, humanoid, root = parts(player)
	if not root or not humanoid or humanoid.Health <= 0 then
		CarryService.forceDrop(player, "lost")
	elseif movedLegally(player, root, humanoid, now) and BaseService.isInOwnBase(player, root.Position) then
		deliver(player, c)
	end
end

local function onCharacter(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10) :: Humanoid?
	if not humanoid then
		return
	end
	CarryService.applySpeed(player)
	humanoid.Died:Connect(function()
		CarryService.forceDrop(player, "died")
	end)
end

function CarryService.start()
	MeteorService.onPickup(pickUp)
	local function onPlayer(player: Player)
		player.CharacterAdded:Connect(function(character)
			onCharacter(player, character)
		end)
		player.CharacterRemoving:Connect(function()
			CarryService.forceDrop(player, "respawn")
		end)
		if player.Character then
			task.spawn(onCharacter, player, player.Character)
		end
	end
	Players.PlayerAdded:Connect(onPlayer)
	for _, p in Players:GetPlayers() do
		onPlayer(p)
	end
	PlayerData.onLoaded(function(player)
		CarryService.applySpeed(player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		CarryService.forceDrop(player, "left")
		carrying[player] = nil
		stunnedUntil[player] = nil
		lastGood[player] = nil
	end)
	task.spawn(function()
		while true do
			task.wait(0.2)
			local now = os.clock()
			for player, c in carrying do
				local ok, err = pcall(checkCarrier, player, c, now)
				if not ok then
					warn(`[Carry] check for {player.Name} failed: {err}`)
				end
			end
		end
	end)
end

return CarryService
