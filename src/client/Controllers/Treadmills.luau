--!strict
-- Дорожки у клиента. Встал на ленту своей дорожки — персонаж сам бежит на месте: лента везёт назад
-- со скоростью бега (как конвейер), а персонаж бежит вперёд. Чтобы сойти — шагни в сторону или прыгни.
-- Скорость (прирост) считает сервер: он сам проверяет, что игрок на ленте, и получает сигнал Run.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Treadmills = {}

local player = Players.LocalPlayer
local RANGE = 140

type Entry = { model: Model, root: BasePart?, belt: BasePart?, forward: Vector3, slats: { BasePart }, straight: number, radius: number, length: number, pitch: number, scale: number, phase: number }

local entries: { [Model]: Entry } = {}
local controls: any = nil

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
	local beltInst = model:FindFirstChild("BeltWalkingCollider", true) or model:FindFirstChild("Root")
	local belt = if beltInst and beltInst:IsA("BasePart") then beltInst else nil
	local root = model:FindFirstChild("Root") :: BasePart?
	-- бежим лицом к пульту; у простой дорожки — вдоль основания
	local console = model:FindFirstChild("ControlConsole", true)
	local forward = Vector3.new(0, 0, -1)
	if belt then
		local target = if console and console:IsA("Model") then console:GetPivot().Position elseif console and console:IsA("BasePart") then console.Position else (belt.CFrame * CFrame.new(0, 0, -1)).Position
		local flat = Vector3.new(target.X - belt.Position.X, 0, target.Z - belt.Position.Z)
		if flat.Magnitude > 0.1 then
			forward = flat.Unit
		end
	end
	local animated = model:FindFirstChild("AnimatedBelt")
	local slats: { BasePart } = {}
	if animated then
		for _, s in animated:GetChildren() do
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
		belt = belt,
		forward = forward,
		slats = slats,
		straight = straight,
		radius = radius,
		length = length,
		pitch = if #slats > 0 then length / #slats else 0,
		scale = (model:GetAttribute("BuildScale") :: number?) or 1,
		phase = 0,
	}
end

local function onBelt(e: Entry, position: Vector3): boolean
	local belt = e.belt
	if not belt then
		return false
	end
	local p = belt.CFrame:PointToObjectSpace(position)
	local s = belt.Size
	return math.abs(p.X) <= s.X / 2 + 1 and math.abs(p.Z) <= s.Z / 2 + 1 and p.Y >= 0 and p.Y <= s.Y / 2 + 7
end

-- Игрок сам управляет (жмёт клавиши / двигает стик) — тогда не ведём его.
local function steering(): boolean
	if not controls then
		local ok, module = pcall(function()
			return require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule") :: ModuleScript) :: any
		end)
		controls = if ok and module then module:GetControls() else false
	end
	if controls then
		local ok, v = pcall(function()
			return controls:GetMoveVector()
		end)
		return ok and v.Magnitude > 0.1
	end
	return false
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
	local active: Entry? = nil
	RunService:BindToRenderStep("TreadmillAutoRun", Enum.RenderPriority.Input.Value + 1, function(dt)
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local current: Entry? = nil
		if root and humanoid and humanoid.Health > 0 and humanoid.FloorMaterial ~= Enum.Material.Air then
			for model, e in entries do
				if model:GetAttribute("OwnerUserId") == player.UserId and onBelt(e, root.Position) then
					current = e
					break
				end
			end
		end
		if active and active ~= current and active.belt then
			active.belt.AssemblyLinearVelocity = Vector3.zero
		end
		active = current
		if current and humanoid and current.belt then
			-- лента везёт назад со скоростью бега, персонаж бежит вперёд — стоит на месте
			current.belt.AssemblyLinearVelocity = -current.forward * humanoid.WalkSpeed
			if not steering() then
				humanoid:Move(current.forward, false)
			end
			local now = os.clock()
			if now - lastPing > 0.5 then
				lastPing = now
				Remotes.get("Run"):FireServer()
			end
		end
		-- анимация планок ленты у ближних дорожек
		local cam = workspace.CurrentCamera
		local parts: { BasePart } = {}
		local frames: { CFrame } = {}
		for model, e in entries do
			if not model.Parent then
				entries[model] = nil
			elseif e.root and #e.slats > 0 and e.length > 0 and cam and (cam.CFrame.Position - e.root.Position).Magnitude < RANGE then
				e.phase += dt * (if e == current then 7 else 0.8)
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
