--!strict
-- Падение метеорита у клиента: круг-предупреждение цвета редкости → огненный шар из неба
-- (клон fireball из пака, перекрашенный) → взрыв (fireballimpact), воронка, тряска, вспышка.
-- Legendary и выше — ещё молния, Mythic и Secret — две. Без паков — неоновый шар со следом.

local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any

local FxUtil = require(script.Parent:WaitForChild("FxUtil") :: ModuleScript) :: any
local CameraFx = require(script.Parent:WaitForChild("CameraFx") :: ModuleScript) :: any
local Crater = require(script.Parent:WaitForChild("Crater") :: ModuleScript) :: any
local Lightning = require(script.Parent:WaitForChild("Lightning") :: ModuleScript) :: any

local MeteorFall = {}

export type Info = { id: string, position: Vector3, rarity: string, mutation: string?, impactAt: number }

local function packPart(name: string): BasePart?
	local packs = ReplicatedStorage:FindFirstChild("Packs")
	local fire = packs and packs:FindFirstChild("FireballVFX")
	local p = fire and fire:FindFirstChild(name)
	return if p and p:IsA("BasePart") then p else nil
end

local function telegraph(position: Vector3, time: number, color: Color3, scale: number, columnOnly: boolean)
	local hit = FxUtil.findGround(position)
	local frame = if hit then FxUtil.surfaceFrame(hit.Position, hit.Normal) else CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90))
	local radius = 7 * scale
	if columnOnly then
		local height = 160
		local column = FxUtil.part({ Material = Enum.Material.Neon, Color = color, Transparency = 1, Size = Vector3.new(2 * scale, height, 2 * scale), CFrame = CFrame.new(position + Vector3.new(0, height / 2, 0)) })
		FxUtil.tween(column, time, { Transparency = 0.7 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
		task.delay(time + 0.2, function()
			column:Destroy()
		end)
		return
	end
	local disc = FxUtil.part({ Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon, Color = color, Transparency = 0.85, Size = Vector3.new(0.08, 2, 2), CFrame = frame * CFrame.new(0.04, 0, 0) })
	local ring = FxUtil.part({ Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon, Color = color, Transparency = 0.3, Size = Vector3.new(0.12, radius * 2, radius * 2), CFrame = frame * CFrame.new(0.06, 0, 0) })
	FxUtil.tween(disc, time, { Size = Vector3.new(0.08, radius * 2, radius * 2), Transparency = 0.55 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	local alive = true
	task.spawn(function()
		local t0 = os.clock()
		while alive and ring.Parent do
			local k = 0.5 + 0.5 * math.sin((os.clock() - t0) * 10)
			ring.Transparency = 0.15 + 0.4 * k
			RunService.Heartbeat:Wait()
		end
	end)
	local height = 160
	local column = FxUtil.part({ Material = Enum.Material.Neon, Color = color, Transparency = 1, Size = Vector3.new(0.6, height, 0.6), CFrame = CFrame.new(position + Vector3.new(0, height / 2, 0)) })
	FxUtil.tween(column, time, { Transparency = 0.82, Size = Vector3.new(2.2 * scale, height, 2.2 * scale) }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	task.delay(time, function()
		alive = false
		disc:Destroy()
		ring:Destroy()
		column:Destroy()
	end)
end

local function makeOrb(color: Color3, scale: number): BasePart
	local template = packPart("fireball")
	local orb: BasePart
	if template then
		orb = template:Clone()
		orb.Anchored = true
		orb.CanCollide = false
		orb.CanQuery = false
		FxUtil.recolor(orb, color)
		FxUtil.setEmitters(orb, true)
		for _, e in orb:GetDescendants() do
			if e:IsA("ParticleEmitter") then
				e.Size = NumberSequence.new((function()
					local pts = {}
					for _, kp in e.Size.Keypoints do
						table.insert(pts, NumberSequenceKeypoint.new(kp.Time, kp.Value * scale, kp.Envelope * scale))
					end
					return pts
				end)())
			end
		end
	elseif FxUtil.vfx("MeteorTrail") then
		-- метеор с хвостом из пака VFX (Rojo кладёт его сам)
		orb = FxUtil.vfx("MeteorTrail") :: BasePart
		FxUtil.recolor(orb, color)
		FxUtil.setEmitters(orb, true)
		orb.Size *= scale
	else
		orb = FxUtil.part({ Shape = Enum.PartType.Ball, Material = Enum.Material.Neon, Color = color, Size = Vector3.one * 3 * scale })
		local a0 = Instance.new("Attachment")
		a0.Position = Vector3.new(0, 1.2 * scale, 0)
		a0.Parent = orb
		local a1 = Instance.new("Attachment")
		a1.Position = Vector3.new(0, -1.2 * scale, 0)
		a1.Parent = orb
		local trail = Instance.new("Trail")
		trail.Attachment0 = a0
		trail.Attachment1 = a1
		trail.Color = ColorSequence.new(color, Color3.fromRGB(255, 220, 120))
		trail.LightEmission = 1
		trail.Lifetime = 0.5
		trail.Transparency = NumberSequence.new(0.1, 1)
		trail.Parent = orb
	end
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 20 * scale
	light.Brightness = 5
	light.Parent = orb
	orb.Parent = FxUtil.folder()
	return orb
end

local function fly(position: Vector3, duration: number, color: Color3, scale: number)
	local d = Config.Fx.FlightDir
	local start = position + Vector3.new(d[1], d[2], d[3]).Unit * Config.Fx.FlightDistance
	local orb = makeOrb(color, scale)
	orb.CFrame = CFrame.lookAt(start, position)
	FxUtil.sound(Config.Fx.Sounds.Flight, orb)
	local t0 = os.clock()
	while true do
		local a = math.min((os.clock() - t0) / duration, 1)
		orb.CFrame = CFrame.lookAt(start:Lerp(position, a * a), position + (position - start).Unit)
		if a >= 1 then
			break
		end
		RunService.Heartbeat:Wait()
	end
	FxUtil.setEmitters(orb, false)
	local light = orb:FindFirstChildOfClass("PointLight")
	if light then
		light:Destroy()
	end
	orb.Transparency = 1
	Debris:AddItem(orb, 1.3)
end

local function impact(info: Info, color: Color3, scale: number)
	local position = info.position
	local template = packPart("fireballimpact")
	if template then
		local fx = template:Clone()
		fx.Anchored = true
		fx.CanCollide = false
		fx.CanQuery = false
		fx.Transparency = 1
		fx.CFrame = CFrame.new(position + Vector3.new(0, 0.5, 0))
		FxUtil.recolor(fx, color)
		fx.Parent = FxUtil.folder()
		Debris:AddItem(fx, FxUtil.burst(fx) + 0.5)
	else
		FxUtil.burstVfx("ExplosionPack", position + Vector3.new(0, 1, 0), nil, "GreandeExplosion")
	end
	local ball = FxUtil.part({ Shape = Enum.PartType.Ball, Material = Enum.Material.Neon, Color = Color3.fromRGB(255, 220, 160), Transparency = 0.05, Size = Vector3.one * 3, CFrame = CFrame.new(position + Vector3.new(0, 1, 0)) })
	FxUtil.tween(ball, 0.3, { Size = Vector3.one * 14 * scale, Transparency = 1, Color = color })
	Debris:AddItem(ball, 0.32)
	local holder = Instance.new("Attachment")
	holder.WorldPosition = position + Vector3.new(0, 2, 0)
	holder.Parent = workspace.Terrain
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 40 * scale
	light.Brightness = 10
	light.Parent = holder
	FxUtil.tween(light, 0.8, { Brightness = 0, Range = 16 * scale })
	Debris:AddItem(holder, 0.9)
	Crater.at(position, scale, color)
	FxUtil.soundAt(Config.Fx.Sounds.Impact, position)
	FxUtil.soundAt(Config.Fx.Sounds.ImpactLow, position)

	local cam = workspace.CurrentCamera
	local distance = if cam then (cam.CFrame.Position - position).Magnitude else math.huge
	local S, F = Config.Fx.Shake, Config.Fx.Flash
	local reach = 0.75 + 0.25 * scale
	if distance < S.MaxDistance * reach then
		CameraFx.shake(S.Strength * scale * (1 - distance / (S.MaxDistance * reach)), S.Duration)
	end
	if distance < F.MaxDistance * reach then
		local k = 1 - distance / (F.MaxDistance * reach)
		CameraFx.flash(0.35 * k, 0.4, color:Lerp(Color3.new(1, 1, 1), 0.6))
		CameraFx.fovPunch(F.FovPunch * k)
	end

	local idx = Rarity.index(info.rarity)
	if idx >= Rarity.index("Legendary") then
		Lightning.strike(position, scale * 0.8, color:Lerp(Color3.new(1, 1, 1), 0.35))
	end
	if idx >= Rarity.index("Mythic") then
		task.delay(0.25, function()
			Lightning.strike(position + Vector3.new(math.random(-6, 6), 0, math.random(-6, 6)), scale * 0.9, color:Lerp(Color3.new(1, 1, 1), 0.2))
		end)
	end
end

function MeteorFall.play(info: Info)
	local cam = workspace.CurrentCamera
	local level = Formulas.fxLevel(if cam then (cam.CFrame.Position - info.position).Magnitude else math.huge)
	if level == "none" then
		return
	end
	local color = FxUtil.rarityColor(info.rarity)
	local scale = FxUtil.rarityScale(info.rarity)
	local untilImpact = math.max(info.impactAt - workspace:GetServerTimeNow(), 0.1)
	telegraph(info.position, untilImpact, color, scale, level == "column")
	if level == "column" then
		return
	end
	local flight = math.min(Config.Meteor.FallTime, untilImpact)
	task.delay(untilImpact - flight, function()
		local ok, err = pcall(fly, info.position, flight, color, scale)
		if not ok then
			warn("[Fx] fall flight failed: " .. tostring(err))
		end
		local ok2, err2 = pcall(impact, info, color, scale)
		if not ok2 then
			warn("[Fx] impact failed: " .. tostring(err2))
		end
	end)
end

return MeteorFall
