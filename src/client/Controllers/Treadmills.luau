--!strict
-- Дорожки у клиента: лента едет по кругу (как в паке FreeTreadmill), на своей дорожке при беге
-- персонаж остаётся на месте, а сервер получает сигнал Run. Скорость считает сервер.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Treadmills = {}

local player = Players.LocalPlayer
local RANGE = 140

type Entry = { model: Model, root: BasePart?, slats: { BasePart }, straight: number, radius: number, length: number, pitch: number, scale: number, phase: number }

local entries: { [Model]: Entry } = {}

local function scaled(cf: CFrame, s: number): CFrame
	return CFrame.new(cf.Position * s) * cf.Rotation
end

-- Путь планки по ленте (из TreadmillProgressionClient пака): верх, загиб, низ, загиб.
local function path(s: number, straight: number, radius: number, length: number): CFrame
	s %= length
	if s < straight then
		return CFrame.new(0, 1.45, -straight / 2 + s)
	end
	s -= straight
	if s < math.pi * radius then
		local a = s / radius
		return CFrame.fromMatrix(Vector3.new(0, 1.17 + radius * math.cos(a), straight / 2 + radius * math.sin(a)), Vector3.xAxis, Vector3.new(0, math.cos(a), math.sin(a)), Vector3.new(0, -math.sin(a), math.cos(a)))
	end
	s -= math.pi * radius
	if s < straight then
		return CFrame.new(0, 0.89, straight / 2 - s) * CFrame.Angles(math.pi, 0, 0)
	end
	s -= straight
	local a = math.pi + s / radius
	return CFrame.fromMatrix(Vector3.new(0, 1.17 + radius * math.cos(a), -straight / 2 + radius * math.sin(a)), Vector3.xAxis, Vector3.new(0, math.cos(a), math.sin(a)), Vector3.new(0, -math.sin(a), math.cos(a)))
end

local function track(model: Instance)
	if not model:IsA("Model") then
		return
	end
	local belt = model:FindFirstChild("AnimatedBelt")
	local root = model:FindFirstChild("Root") :: BasePart?
	local slats: { BasePart } = {}
	if belt then
		for _, s in belt:GetChildren() do
			if s:IsA("BasePart") then
				table.insert(slats, s)
			end
		end
		table.sort(slats, function(a, b)
			return ((a:GetAttribute("Index") :: number?) or 0) < ((b:GetAttribute("Index") :: number?) or 0)
		end)
	end
	local straight = (model:GetAttribute("BeltStraight") :: number?) or 0
	local radius = (model:GetAttribute("BeltRadius") :: number?) or 0
	local length = 2 * straight + 2 * math.pi * radius
	entries[model] = {
		model = model,
		root = root,
		slats = slats,
		straight = straight,
		radius = radius,
		length = length,
		pitch = if #slats > 0 then length / #slats else 0,
		scale = (model:GetAttribute("BuildScale") :: number?) or 1,
		phase = 0,
	}
end

local function onBelt(model: Model, position: Vector3): boolean
	local box, size = model:GetBoundingBox()
	local p = box:PointToObjectSpace(position)
	return math.abs(p.X) <= size.X / 2 and math.abs(p.Z) <= size.Z / 2 and p.Y >= -size.Y / 2 and p.Y <= size.Y / 2 + 8
end

function Treadmills.start()
	for _, m in CollectionService:GetTagged("Treadmill") do
		track(m)
	end
	CollectionService:GetInstanceAddedSignal("Treadmill"):Connect(track)
	CollectionService:GetInstanceRemovedSignal("Treadmill"):Connect(function(m)
		entries[m :: Model] = nil
	end)
	local lastPing = 0
	RunService.Stepped:Connect(function(_, dt)
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local cam = workspace.CurrentCamera
		local runningOn: Model? = nil
		if root and humanoid and humanoid.MoveDirection.Magnitude > 0.5 then
			for model in entries do
				if model:GetAttribute("OwnerUserId") == player.UserId and onBelt(model, root.Position) then
					runningOn = model
					break
				end
			end
		end
		if runningOn and root then
			-- лента «уносит» назад: персонаж бежит на месте
			local v = root.AssemblyLinearVelocity
			root.AssemblyLinearVelocity = Vector3.new(0, v.Y, 0)
			local now = os.clock()
			if now - lastPing > 0.5 then
				lastPing = now
				Remotes.get("Run"):FireServer()
			end
		end
		local parts: { BasePart } = {}
		local frames: { CFrame } = {}
		for model, e in entries do
			if not model.Parent then
				entries[model] = nil
			elseif e.root and #e.slats > 0 and e.length > 0 and cam and (cam.CFrame.Position - e.root.Position).Magnitude < RANGE then
				e.phase += dt * (if model == runningOn then 7 else 0.8)
				local base = e.root.CFrame
				local s = model:GetScale() / e.scale
				for i, slat in e.slats do
					table.insert(parts, slat)
					table.insert(frames, base * scaled(path((i - 1) * e.pitch + e.phase, e.straight, e.radius, e.length), s))
				end
			end
		end
		if #parts > 0 then
			workspace:BulkMoveTo(parts, frames, Enum.BulkMoveMode.FireCFrameChanged)
		end
	end)
end

return Treadmills
