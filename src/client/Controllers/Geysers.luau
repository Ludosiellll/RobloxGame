--!strict
-- Гейзеры: коснулся — персонажа подбрасывает по рассчитанной дуге на ярус выше.
-- Полёт ведёт LinearVelocity, поэтому он одинаковый на телефоне и ПК и не зависит от управления.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any

local Geysers = {}

local player = Players.LocalPlayer
local FLIGHT_TIME = 1.5
local LANDING_INSET = Config.Crater.Geysers.inset -- садимся чуть дальше края яруса
local busyUntil = 0

-- Ярус, на который ведёт гейзер с высотой назначения toY.
local function landingFor(toY: number): (number?, number?)
	local targetY = toY - Config.Crater.Geysers.overshoot
	for _, ring in Config.Crater.Rings do
		if math.abs(ring.y - targetY) < 1 then
			return ring.inner + LANDING_INSET, ring.y
		end
	end
	return nil, nil
end

local function launch(geyser: BasePart)
	local now = os.clock()
	if now < busyUntil then
		return
	end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not root or not humanoid or humanoid.Health <= 0 then
		return
	end
	local toY = geyser:GetAttribute("ToY") :: number?
	if not toY then
		return
	end
	local landR, landY = landingFor(toY)
	if not landR or not landY then
		return
	end
	busyUntil = now + FLIGHT_TIME + 0.5
	local start = root.Position
	local r = math.sqrt(start.X * start.X + start.Z * start.Z)
	local dir = if r > 1e-3 then Vector3.new(start.X / r, 0, start.Z / r) else Vector3.new(1, 0, 0)
	local g = workspace.Gravity
	local dy = (landY :: number) + 4 - start.Y
	local vy = (dy + 0.5 * g * FLIGHT_TIME * FLIGHT_TIME) / FLIGHT_TIME
	local vh = ((landR :: number) - r) / FLIGHT_TIME

	local attachment = root:FindFirstChild("RootAttachment") :: Attachment?
	if not attachment then
		return
	end
	local lv = Instance.new("LinearVelocity")
	lv.Attachment0 = attachment
	lv.RelativeTo = Enum.ActuatorRelativeTo.World
	lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	lv.MaxForce = math.huge
	lv.VectorVelocity = dir * vh + Vector3.new(0, vy, 0)
	lv.Parent = root
	humanoid:ChangeState(Enum.HumanoidStateType.Freefall)
	local t0 = os.clock()
	local conn: RBXScriptConnection
	conn = RunService.Heartbeat:Connect(function()
		local t = os.clock() - t0
		if t >= FLIGHT_TIME or not lv.Parent then
			conn:Disconnect()
			lv:Destroy()
			return
		end
		lv.VectorVelocity = dir * vh + Vector3.new(0, vy - g * t, 0)
	end)
end

local function watch(part: Instance)
	if not part:IsA("BasePart") then
		return
	end
	part.Touched:Connect(function(hit)
		local character = player.Character
		if character and hit:IsDescendantOf(character) then
			launch(part)
		end
	end)
end

function Geysers.start()
	for _, part in CollectionService:GetTagged("Geyser") do
		watch(part)
	end
	CollectionService:GetInstanceAddedSignal("Geyser"):Connect(watch)
end

return Geysers
