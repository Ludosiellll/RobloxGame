--!strict
-- Удар молнии в точку: ломаная из неоновых отрезков с ответвлениями, свет, вспышка thunderstrike
-- из пака (если скопирован), треск грома (WeatherClient.lightningBolt + emitThunderstrike).

local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any

local FxUtil = require(script.Parent:WaitForChild("FxUtil") :: ModuleScript) :: any
local CameraFx = require(script.Parent:WaitForChild("CameraFx") :: ModuleScript) :: any

local Lightning = {}

local function boltPath(top: Vector3, bottom: Vector3, segments: number, jitter: number): { Vector3 }
	local points = { top }
	for i = 1, segments - 1 do
		local a = i / segments
		local amp = jitter * (1 - a * 0.7)
		table.insert(points, top:Lerp(bottom, a) + Vector3.new((math.random() - 0.5) * 2 * amp, 0, (math.random() - 0.5) * 2 * amp))
	end
	table.insert(points, bottom)
	return points
end

local function drawPath(points: { Vector3 }, core: number, glow: number, color: Color3, parent: Instance, list: { { any } })
	for i = 1, #points - 1 do
		local a, b = points[i], points[i + 1]
		local len = (b - a).Magnitude
		local cf = CFrame.lookAt((a + b) / 2, b)
		table.insert(list, { FxUtil.part({ Parent = parent, Material = Enum.Material.Neon, Color = color, Transparency = 0.55, Size = Vector3.new(glow, glow, len + glow * 0.5), CFrame = cf }), 0.55 })
		table.insert(list, { FxUtil.part({ Parent = parent, Material = Enum.Material.Neon, Color = Color3.new(1, 1, 1), Transparency = 0, Size = Vector3.new(core, core, len + core * 0.5), CFrame = cf }), 0 })
	end
end

local function thunderstrike(position: Vector3)
	local packs = ReplicatedStorage:FindFirstChild("Packs")
	local weather = packs and packs:FindFirstChild("WeatherVFX")
	local template = weather and weather:FindFirstChild("thunderstrike")
	if not template or not template:IsA("BasePart") then
		return
	end
	local fx = template:Clone()
	fx.Anchored = true
	fx.CanCollide = false
	fx.CanQuery = false
	fx.Transparency = 1
	fx.CFrame = CFrame.new(position + Vector3.new(0, 0.4, 0))
	fx.Parent = FxUtil.folder()
	Debris:AddItem(fx, FxUtil.burst(fx) + 0.5)
end

function Lightning.strike(position: Vector3, scale: number, color: Color3)
	local top = Vector3.new(position.X + math.random(-25, 25), position.Y + Config.Fx.BoltHeight, position.Z + math.random(-25, 25))
	local folder = Instance.new("Folder")
	folder.Name = "Bolt"
	folder.Parent = FxUtil.folder()
	local parts: { { any } } = {}
	local main = boltPath(top, position, 18, 9 * scale)
	drawPath(main, 0.7 * scale, 2.6 * scale, color, folder, parts)
	local bottom = parts[#parts][1] :: Part
	for _ = 1, 4 do
		local from = main[math.random(3, #main - 4)]
		local dir = Vector3.new(math.random() - 0.5, -FxUtil.rand({ 0.6, 1.2 }), math.random() - 0.5).Unit
		drawPath(boltPath(from, from + dir * FxUtil.rand({ 25, 55 }) * scale, 6, 5 * scale), 0.3 * scale, 1.2 * scale, color, folder, parts)
	end
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 60
	light.Brightness = 14
	light.Parent = bottom
	local function setVisible(v: boolean)
		for _, p in parts do
			(p[1] :: Part).Transparency = if v then p[2] else 1
		end
		light.Enabled = v
	end
	task.spawn(function()
		task.wait(0.07)
		setVisible(false)
		task.wait(0.05)
		setVisible(true)
		task.wait(0.09)
		for _, p in parts do
			FxUtil.tween(p[1], 0.3, { Transparency = 1 })
		end
		FxUtil.tween(light, 0.4, { Brightness = 0 })
		Debris:AddItem(folder, 0.5)
	end)
	thunderstrike(position)
	local k = FxUtil.closeness(position, 260)
	CameraFx.skyFlash(0.35 + 0.65 * k, 0.35)
	FxUtil.soundAt(Config.Fx.Sounds.Crack, position, { PlaybackSpeed = FxUtil.rand({ 0.92, 1.05 }) })
	if k > 0.25 then
		local close = Config.Fx.Sounds.Close
		FxUtil.sound({ close[1], close[2] * k, close[3] })
	end
end

return Lightning
