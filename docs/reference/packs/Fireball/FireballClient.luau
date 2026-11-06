-- Fireball: client side (all the visuals).
-- E / ButtonX / on-screen button -> throw a fireball at the mouse.
--   1. charge: the orb ignites in your hand with a growing light
--   2. flight: the orb flies to the target, leaving its flame trail
--   3. impact: fireballimpact burst + light flash + shockwave ring + fireball flash
--              + scorch mark + camera shake / FOV punch / colour flash for nearby players
-- Settings live in ReplicatedStorage.FireballConfig.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")
local Debris = game:GetService("Debris")
local ContextActionService = game:GetService("ContextActionService")

local Config = require(ReplicatedStorage:WaitForChild("FireballConfig"))
local Remote = ReplicatedStorage:WaitForChild("FireballRemote")
local Assets = ReplicatedStorage:WaitForChild("FireballVFX")
local OrbTemplate = Assets:WaitForChild("fireball")
local ImpactTemplate = Assets:WaitForChild("fireballimpact")

local player = Players.LocalPlayer
local mouse = player:GetMouse()

local fxFolder = Instance.new("Folder")
fxFolder.Name = "FireballFX"
fxFolder.Parent = workspace
mouse.TargetFilter = fxFolder

local baseFov = workspace.CurrentCamera.FieldOfView

------------------------------------------------------------------ small helpers
local function tween(obj, time, props, style, dir)
	local t = TweenService:Create(obj, TweenInfo.new(time, style or Enum.EasingStyle.Quart, dir or Enum.EasingDirection.Out), props)
	t:Play()
	return t
end

local function fxPart(props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Locked = true
	for k, v in props do
		p[k] = v
	end
	p.Parent = fxFolder
	return p
end

-- Plays a sound layer list from Config.Sounds: { { id, volume, speed }, ... }
local function playSound(layers, parent)
	for _, layer in layers or {} do
		local id, volume, speed = layer[1], layer[2] or 1, layer[3] or 1
		if id and id ~= "" then
			local s = Instance.new("Sound")
			s.SoundId = id
			s.Volume = volume
			s.PlaybackSpeed = speed * (0.95 + math.random() * 0.1) -- tiny pitch variation
			s.RollOffMinDistance = 10
			s.RollOffMaxDistance = 300
			s.Parent = parent
			s:Play()
			s.Ended:Once(function() s:Destroy() end)
		end
	end
end

-- A frame whose X axis points along the surface normal (cylinders lie flat on the surface).
local function surfaceFrame(position, normal)
	local side = normal:Cross(Vector3.zAxis)
	if side.Magnitude < 0.01 then side = normal:Cross(Vector3.xAxis) end
	return CFrame.fromMatrix(position, normal, side.Unit)
end

local function getCastPart(character)
	return character:FindFirstChild("RightHand")
		or character:FindFirstChild("Right Arm")
		or character:FindFirstChild("HumanoidRootPart")
end

local function handPosition(character)
	local castPart = getCastPart(character)
	local root = character:FindFirstChild("HumanoidRootPart")
	if not castPart then return nil end
	local forward = root and root.CFrame.LookVector or castPart.CFrame.LookVector
	return castPart.Position + forward * Config.HandOffset
end

-- Emits every ParticleEmitter once, using its EmitCount / EmitDelay attributes.
-- Returns how long the burst lasts.
local function burst(part)
	local longest = 0
	for _, e in part:GetDescendants() do
		if e:IsA("ParticleEmitter") then
			local count = e:GetAttribute("EmitCount") or 10
			local delay = e:GetAttribute("EmitDelay") or 0
			longest = math.max(longest, delay + e.Lifetime.Max)
			if delay > 0 then
				task.delay(delay, function()
					if e.Parent then e:Emit(count) end
				end)
			else
				e:Emit(count)
			end
		end
	end
	return longest
end

local function setEmitters(part, enabled)
	for _, e in part:GetDescendants() do
		if e:IsA("ParticleEmitter") then
			e.Enabled = enabled
		end
	end
end

------------------------------------------------------------------ screen feedback
local shakeEnd, shakeStrength, shakeDuration = 0, 0, 1

local function addShake(strength, duration)
	local now = os.clock()
	local remaining = math.max(shakeEnd - now, 0)
	local current = shakeStrength * math.clamp(remaining / shakeDuration, 0, 1)
	shakeStrength = math.max(current, strength)
	shakeDuration = math.max(duration, remaining)
	shakeEnd = now + shakeDuration
end

RunService:BindToRenderStep("FireballShake", Enum.RenderPriority.Camera.Value + 1, function()
	local remaining = shakeEnd - os.clock()
	if remaining <= 0 then return end
	local s = shakeStrength * (remaining / shakeDuration)
	local t = os.clock() * 45
	local cam = workspace.CurrentCamera
	cam.CFrame *= CFrame.Angles(
		math.rad(math.noise(t, 0.3) * s),
		math.rad(math.noise(0.7, t) * s),
		math.rad(math.noise(t, t) * s * 0.5)
	)
end)

local function screenFeedback(position)
	local cam = workspace.CurrentCamera
	local distance = (cam.CFrame.Position - position).Magnitude

	if distance < Config.Shake.MaxDistance then
		local k = 1 - distance / Config.Shake.MaxDistance
		addShake(Config.Shake.Strength * k, Config.Shake.Duration)
	end

	if distance < Config.Flash.MaxDistance then
		local k = 1 - distance / Config.Flash.MaxDistance

		local cc = Instance.new("ColorCorrectionEffect")
		cc.Brightness = 0.22 * k
		cc.Contrast = 0.25 * k
		cc.Saturation = 0.15 * k
		cc.TintColor = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(255, 215, 180), k)
		cc.Parent = Lighting
		tween(cc, 0.5, { Brightness = 0, Contrast = 0, Saturation = 0, TintColor = Color3.new(1, 1, 1) })
		Debris:AddItem(cc, 0.55)

		cam.FieldOfView = baseFov + Config.Flash.FovPunch * k
		tween(cam, 0.45, { FieldOfView = baseFov }, Enum.EasingStyle.Back)
	end
end

------------------------------------------------------------------ impact pieces
local function lightFlash(position)
	local holder = Instance.new("Attachment")
	holder.WorldPosition = position
	holder.Parent = workspace.Terrain

	local light = Instance.new("PointLight")
	light.Color = Config.Color
	light.Range = Config.ImpactLight.Range
	light.Brightness = Config.ImpactLight.Brightness
	light.Parent = holder

	tween(light, Config.ImpactLight.FadeTime, { Brightness = 0, Range = Config.ImpactLight.Range * 0.4 }, Enum.EasingStyle.Quad)
	Debris:AddItem(holder, Config.ImpactLight.FadeTime + 0.1)
end

local function shockwaveRing(frame)
	local ring = fxPart({
		Shape = Enum.PartType.Cylinder,
		Material = Enum.Material.Neon,
		Color = Config.Color,
		Transparency = 0.1,
		Size = Vector3.new(0.12, 3, 3),
		CFrame = frame * CFrame.new(0.15, 0, 0),
	})
	tween(ring, 0.5, { Size = Vector3.new(0.12, Config.RingSize, Config.RingSize), Transparency = 1 })
	Debris:AddItem(ring, 0.55)
end

local function fireFlash(position)
	local ball = fxPart({
		Shape = Enum.PartType.Ball,
		Material = Enum.Material.Neon,
		Color = Color3.fromRGB(255, 200, 120),
		Transparency = 0.05,
		Size = Vector3.one * 3,
		CFrame = CFrame.new(position),
	})
	tween(ball, 0.28, { Size = Vector3.one * 13, Transparency = 1, Color = Config.Color })
	Debris:AddItem(ball, 0.3)
end

-- Finds the floor under a point, looking through any characters in the way.
local function findGround(position)
	local ignore = { fxFolder }
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude

	for _ = 1, 4 do
		params.FilterDescendantsInstances = ignore
		local ground = workspace:Raycast(position + Vector3.new(0, 1, 0), Vector3.new(0, -10, 0), params)
		if not ground then return nil end
		local model = ground.Instance:FindFirstAncestorOfClass("Model")
		if model and model:FindFirstChildOfClass("Humanoid") then
			table.insert(ignore, model)
		else
			return ground
		end
	end
	return nil
end

-- What the ground looks like, so the rocks match it.
local function groundLook(ground)
	if ground.Instance:IsA("Terrain") then
		local ok, color = pcall(function()
			return workspace.Terrain:GetMaterialColor(ground.Material)
		end)
		return (ok and color) or Color3.fromRGB(110, 105, 100), ground.Material
	end
	return ground.Instance.Color, ground.Instance.Material
end

local function rand(range)
	return range[1] + math.random() * (range[2] - range[1])
end

local function shade(color)
	local k = 0.7 + math.random() * 0.35
	return Color3.new(color.R * k, color.G * k, color.B * k)
end

local function groundDebris(position)
	local D = Config.GroundDebris
	if not D.Enabled then return end

	local ground = findGround(position)
	if not ground or ground.Normal.Y < 0.7 then return end

	local center = ground.Position
	local color, material = groundLook(ground)

	-- 1. crater: rings of rocks punch up out of the ground, tilted outward
	for ringIndex, ring in D.Rings do
		local offsetAngle = math.random() * math.pi * 2
		for i = 1, ring.Count do
			local angle = offsetAngle + (i / ring.Count) * math.pi * 2 + (math.random() - 0.5) * 0.25
			local out = Vector3.new(math.cos(angle), 0, math.sin(angle))
			local s = rand(ring.Size)
			local size = Vector3.new(s * rand({ 0.9, 1.4 }), s * rand({ 0.5, 0.8 }), s * rand({ 0.8, 1.2 }))
			local radius = ring.Radius + (math.random() - 0.5) * 1.2

			local finalCF = CFrame.lookAt(center + out * radius, center + out * (radius + 1))
				* CFrame.Angles(math.rad(-ring.Tilt + math.random(-10, 10)), 0, math.rad(math.random(-15, 15)))
				* CFrame.new(0, size.Y * 0.15, 0)
			local startCF = finalCF * CFrame.new(0, -size.Y * 1.3, 0)

			local rock = fxPart({
				Size = size,
				Color = shade(color),
				Material = material,
				CFrame = startCF,
				CastShadow = true,
			})

			task.delay((ringIndex - 1) * 0.04 + math.random() * 0.03, function()
				tween(rock, 0.18, { CFrame = finalCF }, Enum.EasingStyle.Back)
			end)

			task.delay(D.Lifetime + math.random() * 0.8, function()
				tween(rock, 0.7, { CFrame = startCF, Size = size * 0.7 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
				Debris:AddItem(rock, 0.75)
			end)
		end
	end

	-- 2. chunks thrown up and out, real physics
	for _ = 1, D.FlyingCount do
		local angle = math.random() * math.pi * 2
		local out = Vector3.new(math.cos(angle), 0, math.sin(angle))
		local s = rand(D.FlyingSize)

		local chunk = fxPart({
			Size = Vector3.new(s, s * rand({ 0.6, 1 }), s * rand({ 0.7, 1.1 })),
			Color = shade(color),
			Material = material,
			CFrame = CFrame.new(center + out * rand({ 0.5, 3 }) + Vector3.new(0, 1, 0))
				* CFrame.Angles(math.random() * 6, math.random() * 6, math.random() * 6),
			Anchored = false,
			CanCollide = true,
			Massless = true,
		})
		chunk.AssemblyLinearVelocity = out * rand(D.FlyingSpeed) * 0.6 + Vector3.new(0, rand(D.FlyingSpeed), 0)
		chunk.AssemblyAngularVelocity = Vector3.new(math.random(-20, 20), math.random(-20, 20), math.random(-20, 20))

		task.delay(D.Lifetime * 0.6 + math.random(), function()
			tween(chunk, 0.5, { Size = chunk.Size * 0.2, Transparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
			Debris:AddItem(chunk, 0.55)
		end)
	end
end

local function scorchMark(position)
	local ground = findGround(position)
	if not ground then return end

	local frame = surfaceFrame(ground.Position, ground.Normal)

	local scorch = fxPart({
		Shape = Enum.PartType.Cylinder,
		Material = Enum.Material.SmoothPlastic,
		Color = Color3.fromRGB(20, 14, 12),
		Transparency = 0.25,
		Size = Vector3.new(0.05, 2, 2),
		CFrame = frame * CFrame.new(0.03, 0, 0),
	})
	tween(scorch, 0.15, { Size = Vector3.new(0.05, 11, 11) })

	-- glowing embers rim that cools down
	local glow = fxPart({
		Shape = Enum.PartType.Cylinder,
		Material = Enum.Material.Neon,
		Color = Config.Color,
		Transparency = 0.35,
		Size = Vector3.new(0.06, 7, 7),
		CFrame = frame * CFrame.new(0.04, 0, 0),
	})
	tween(glow, 1.4, { Transparency = 1, Color = Color3.fromRGB(120, 20, 0) }, Enum.EasingStyle.Quad)
	Debris:AddItem(glow, 1.5)

	task.delay(Config.ScorchTime, function()
		tween(scorch, 1, { Transparency = 1 }, Enum.EasingStyle.Linear)
	end)
	Debris:AddItem(scorch, Config.ScorchTime + 1.1)
end

local function impact(position, normal)
	local effect = ImpactTemplate:Clone()
	effect.CFrame = CFrame.new(position + normal * 0.5)
	effect.Parent = fxFolder
	Debris:AddItem(effect, burst(effect) + 0.5)

	playSound(Config.Sounds.Impact, effect)
	lightFlash(position + normal)
	fireFlash(position + normal * 0.5)
	shockwaveRing(surfaceFrame(position, normal))
	scorchMark(position)
	groundDebris(position)
	screenFeedback(position)
end

------------------------------------------------------------------ release / muzzle blast
-- Flames blasted forward out of the hand, seen by everyone.
local function muzzleBurst(position, dir)
	local M = Config.Muzzle
	local frame = CFrame.lookAt(position, position + dir)

	local holder = fxPart({ Transparency = 1, Size = Vector3.one * 0.6, CFrame = frame })
	for _, e in OrbTemplate:GetDescendants() do
		if e:IsA("ParticleEmitter") then
			local c = e:Clone()
			c.Enabled = false
			c.LockedToPart = false
			c.EmissionDirection = Enum.NormalId.Front
			c.SpreadAngle = Vector2.new(M.Spread, M.Spread)
			c.Speed = NumberRange.new(M.FlameSpeed[1], M.FlameSpeed[2])
			c.Drag = 6
			c.Parent = holder
			c:Emit(7)
		end
	end
	Debris:AddItem(holder, 1.5)

	-- blast ring facing the throw direction (cylinder X axis along dir)
	local ring = fxPart({
		Shape = Enum.PartType.Cylinder,
		Material = Enum.Material.Neon,
		Color = Color3.fromRGB(255, 170, 80),
		Transparency = 0.15,
		Size = Vector3.new(0.1, 1, 1),
		CFrame = frame * CFrame.new(0, 0, -1) * CFrame.Angles(0, math.rad(90), 0),
	})
	tween(ring, 0.25, { Size = Vector3.new(0.1, M.RingSize, M.RingSize), Transparency = 1, CFrame = ring.CFrame * CFrame.new(-3, 0, 0) })
	Debris:AddItem(ring, 0.3)

	local holderLight = Instance.new("PointLight")
	holderLight.Color = Config.Color
	holderLight.Range = 20
	holderLight.Brightness = 6
	holderLight.Parent = holder
	tween(holderLight, 0.35, { Brightness = 0 }, Enum.EasingStyle.Quad)
end

-- Caster-only screen effects ----------------------------------------------
local screenGui, vignette
local vignetteEdges = {}

local function getVignette()
	if vignette and vignette.Parent then return vignetteEdges end
	vignetteEdges = {}

	screenGui = Instance.new("ScreenGui")
	screenGui.Name = "FireballScreenFX"
	screenGui.IgnoreGuiInset = true
	screenGui.ResetOnSpawn = false
	screenGui.DisplayOrder = 5
	screenGui.Parent = player:WaitForChild("PlayerGui")

	vignette = Instance.new("Frame")
	vignette.Size = UDim2.fromScale(1, 1)
	vignette.BackgroundTransparency = 1
	vignette.Parent = screenGui

	-- four soft edges: { size, position, gradient rotation }
	local edges = {
		{ UDim2.fromScale(1, 0.3), UDim2.fromScale(0, 0), 90 },
		{ UDim2.fromScale(1, 0.35), UDim2.fromScale(0, 0.65), -90 },
		{ UDim2.fromScale(0.25, 1), UDim2.fromScale(0, 0), 0 },
		{ UDim2.fromScale(0.25, 1), UDim2.fromScale(0.75, 0), 180 },
	}
	for _, edge in edges do
		local f = Instance.new("Frame")
		f.Size = edge[1]
		f.Position = edge[2]
		f.BackgroundColor3 = Config.Color
		f.BackgroundTransparency = 1
		f.BorderSizePixel = 0
		f.Parent = vignette
		table.insert(vignetteEdges, f)
		local g = Instance.new("UIGradient")
		g.Rotation = edge[3]
		g.Transparency = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.1),
			NumberSequenceKeypoint.new(0.35, 0.85),
			NumberSequenceKeypoint.new(1, 1),
		})
		g.Color = ColorSequence.new(Color3.fromRGB(255, 230, 150), Config.Color)
		g.Parent = f
	end
	return vignetteEdges
end

-- Dash streaks: your fireball's own flame emitters, cloned onto a ring of spawners
-- around the edge of the screen, shooting stretched flames back past the camera.
-- Feels like you're lunging forward with the throw.
local streakEmitters -- picked once from the fireball template

local function getStreakEmitters()
	if streakEmitters then return streakEmitters end
	streakEmitters = {}
	local seen = {}
	for _, e in OrbTemplate:GetDescendants() do
		if e:IsA("ParticleEmitter") and e.Name:find("Fire") and not seen[e.Name] then
			seen[e.Name] = true
			table.insert(streakEmitters, e)
		end
	end
	return streakEmitters
end

local function screenFlames()
	local S = Config.CastScreenFX
	local cam = workspace.CurrentCamera
	local depth = 9
	local holders = {}

	for i = 1, S.StreakCount do
		-- spread around an ellipse that sits just inside the screen edge, skipping the centre
		local angle = (i / S.StreakCount) * math.pi * 2 + (math.random() - 0.5) * 0.4
		local spread = S.StreakRadius * (0.9 + math.random() * 0.2)
		local radial = Vector3.new(math.cos(angle) * 10.5 * spread, math.sin(angle) * 6.2 * spread, 0)
		local offset = radial + Vector3.new(0, 0, -depth)
		-- aim mostly outward across the screen, slightly toward the camera,
		-- so the stretched flames read as radial speed lines
		local aim = offset + radial.Unit * 6 + Vector3.new(0, 0, 2)

		local holder = fxPart({ Transparency = 1, Size = Vector3.new(1.5, 1.5, 0.2) })
		local emitters = {}
		for _, e in getStreakEmitters() do
			local c = e:Clone()
			local kps = {}
			for _, kp in c.Size.Keypoints do
				table.insert(kps, NumberSequenceKeypoint.new(kp.Time, kp.Value * S.FlameScale, kp.Envelope * S.FlameScale))
			end
			c.Size = NumberSequence.new(kps)
			c.Squash = NumberSequence.new(S.StreakStretch)
			c.Orientation = Enum.ParticleOrientation.VelocityParallel
			c.Rotation = NumberRange.new(0, 0)
			c.RotSpeed = NumberRange.new(0, 0)
			c.LockedToPart = true
			c.EmissionDirection = Enum.NormalId.Front
			c.SpreadAngle = Vector2.new(6, 6)
			c.Speed = NumberRange.new(S.StreakSpeed[1], S.StreakSpeed[2])
			c.Lifetime = NumberRange.new(0.12, 0.24)
			c.Rate = 12
			c.Enabled = true
			c.Parent = holder
			table.insert(emitters, c)
		end
		table.insert(holders, { part = holder, offset = offset, aim = aim, emitters = emitters })
	end

	local function place()
		local cf = cam.CFrame
		for _, h in holders do
			h.part.CFrame = CFrame.lookAt(cf * h.offset, cf * h.aim)
		end
	end
	place()
	for _, h in holders do
		for _, c in h.emitters do c:Emit(1) end
	end

	local conn = RunService.RenderStepped:Connect(place)
	task.delay(0.2, function()
		for _, h in holders do
			for _, c in h.emitters do c.Enabled = false end
		end
	end)
	task.delay(0.6, function()
		conn:Disconnect()
		for _, h in holders do h.part:Destroy() end
	end)
end

local function castScreenFX()
	local S = Config.CastScreenFX
	if not S.Enabled then return end

	if S.Vignette > 0 then
		for _, edge in getVignette() do
			edge.BackgroundTransparency = 1 - S.Vignette
			tween(edge, 0.45, { BackgroundTransparency = 1 }, Enum.EasingStyle.Quad)
		end
	end

	local cc = Instance.new("ColorCorrectionEffect")
	cc.TintColor = Color3.fromRGB(255, 215, 175)
	cc.Brightness = 0.08
	cc.Contrast = 0.12
	cc.Parent = Lighting
	tween(cc, 0.4, { TintColor = Color3.new(1, 1, 1), Brightness = 0, Contrast = 0 })
	Debris:AddItem(cc, 0.45)

	if S.Blur > 0 then
		local blur = Instance.new("BlurEffect")
		blur.Size = S.Blur
		blur.Parent = Lighting
		tween(blur, 0.3, { Size = 0 })
		Debris:AddItem(blur, 0.35)
	end

	if S.ScreenFlames then
		screenFlames()
	end

	addShake(S.Recoil, 0.22)
end

------------------------------------------------------------------ cast animation
-- Procedural pose layered on top of whatever animation is playing.
-- Joint.Transform is written by the Animator every frame, so we multiply our pose in
-- right after it (PreSimulation), which works for any character without uploading an animation.
local rad = math.rad

local POSES = {
	R15 = {
		Windup = {
			RightShoulder = CFrame.Angles(rad(45), rad(-20), rad(-35)),
			RightElbow = CFrame.Angles(rad(95), 0, 0),
			Waist = CFrame.Angles(rad(-5), rad(-30), 0),
		},
		Throw = {
			RightShoulder = CFrame.Angles(rad(95), rad(10), rad(5)),
			RightElbow = CFrame.Angles(rad(8), 0, 0),
			Waist = CFrame.Angles(rad(8), rad(22), 0),
		},
	},
	R6 = {
		Windup = {
			["Right Shoulder"] = CFrame.Angles(rad(-30), 0, rad(55)),
		},
		Throw = {
			["Right Shoulder"] = CFrame.Angles(0, 0, rad(95)),
		},
	},
}

local activeCasts = {} -- [character] = { start = os.clock(), joints = { [name] = joint }, poses = POSES.R15 }

local function easeOut(a) return 1 - (1 - a) ^ 3 end

local function findJoint(character, name)
	for _, d in character:GetDescendants() do
		if d.Name == name and (d:IsA("Motor6D") or d:IsA("AnimationConstraint")) then
			return d
		end
	end
	return nil
end

local function startCastPose(character)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then return end
	local poses = if humanoid.RigType == Enum.HumanoidRigType.R6 then POSES.R6 else POSES.R15
	local joints = {}
	for name in poses.Windup do
		joints[name] = findJoint(character, name)
	end
	activeCasts[character] = { start = os.clock(), joints = joints, poses = poses }
end

-- 0..1 blend for each stage of the cast
local function poseFor(poses, name, t)
	local A = Config.Animation
	local windup = poses.Windup[name] or CFrame.identity
	local throw = poses.Throw[name] or CFrame.identity
	local c = Config.ChargeTime

	if t < c then
		return CFrame.identity:Lerp(windup, easeOut(t / c))
	end
	t -= c
	if t < A.ThrowTime then
		return windup:Lerp(throw, easeOut(t / A.ThrowTime))
	end
	t -= A.ThrowTime
	if t < A.HoldTime then
		return throw
	end
	t -= A.HoldTime
	if t < A.ReturnTime then
		return throw:Lerp(CFrame.identity, easeOut(t / A.ReturnTime))
	end
	return nil
end

RunService.PreSimulation:Connect(function()
	local now = os.clock()
	for character, cast in activeCasts do
		if not character.Parent then
			activeCasts[character] = nil
			continue
		end
		local t = now - cast.start
		local finished = true
		for name, joint in cast.joints do
			local pose = poseFor(cast.poses, name, t)
			if pose then
				finished = false
				joint.Transform *= pose
			end
		end
		if finished then
			activeCasts[character] = nil
		end
	end
end)

------------------------------------------------------------------ the fireball
local function playFireball(caster, serverHitPos)
	local character = caster.Character
	if not character then return end
	local start = handPosition(character)
	if not start then return end

	startCastPose(character)

	-- 1. charge in the hand
	local orb = OrbTemplate:Clone()
	orb.CFrame = CFrame.new(start)
	setEmitters(orb, true)

	local light = Instance.new("PointLight")
	light.Color = Config.Color
	light.Range = Config.OrbLight.Range
	light.Brightness = 0
	light.Parent = orb
	orb.Parent = fxFolder

	playSound(Config.Sounds.Cast, orb)
	tween(light, Config.ChargeTime, { Brightness = Config.OrbLight.Brightness * 1.5 })

	local elapsed = 0
	while elapsed < Config.ChargeTime do
		elapsed += RunService.Heartbeat:Wait()
		local pos = character.Parent and handPosition(character)
		if pos then orb.CFrame = CFrame.new(pos) end
	end
	tween(light, 0.15, { Brightness = Config.OrbLight.Brightness })

	-- work out where it lands
	start = orb.Position
	local hitPos, normal
	if serverHitPos then
		hitPos = serverHitPos
	else
		local target = mouse.Hit.Position
		local dir = (target - start)
		dir = if dir.Magnitude > 0.01 then dir.Unit else Vector3.zAxis
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { character, fxFolder }
		local result = workspace:Raycast(start, dir * Config.MaxRange, params)
		hitPos = if result then result.Position else start + dir * Config.MaxRange
		normal = result and result.Normal
	end

	local travel = hitPos - start
	local distance = travel.Magnitude
	local dir = if distance > 0.01 then travel.Unit else Vector3.zAxis
	normal = normal or -dir

	-- release: flames blast out of the hand
	muzzleBurst(start, dir)
	if caster == player then
		castScreenFX()
	end

	-- 2. flight
	playSound(Config.Sounds.Flight, orb)
	if caster == player then
		local cam = workspace.CurrentCamera
		-- dash surge: FOV snaps wide, then settles back
		tween(cam, 0.07, { FieldOfView = baseFov + Config.CastScreenFX.DashFov }, Enum.EasingStyle.Quad)
		task.delay(0.07, function()
			tween(cam, 0.5, { FieldOfView = baseFov }, Enum.EasingStyle.Quart)
		end)
	end
	local travelTime = distance / Config.Speed
	elapsed = 0
	while elapsed < travelTime do
		elapsed += RunService.Heartbeat:Wait()
		local alpha = math.min(elapsed / travelTime, 1)
		orb.CFrame = CFrame.lookAt(start:Lerp(hitPos, alpha), hitPos + dir)
	end

	-- leave the trail to fade out on its own
	setEmitters(orb, false)
	light:Destroy()
	Debris:AddItem(orb, 1.3)

	-- 3. boom
	impact(hitPos, normal)
end

------------------------------------------------------------------ input
local lastCast = 0

local function onAction(_, state)
	if state ~= Enum.UserInputState.Begin then
		return Enum.ContextActionResult.Pass
	end

	local now = os.clock()
	if now - lastCast < Config.Cooldown then
		return Enum.ContextActionResult.Sink
	end

	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not humanoid or humanoid.Health <= 0 or not root then
		return Enum.ContextActionResult.Sink
	end
	lastCast = now

	-- face the target
	local target = mouse.Hit.Position
	local flat = Vector3.new(target.X, root.Position.Y, target.Z)
	if (flat - root.Position).Magnitude > 0.5 then
		root.CFrame = CFrame.lookAt(root.Position, flat)
	end

	Remote:FireServer(target)
	task.spawn(playFireball, player, nil)
	return Enum.ContextActionResult.Sink
end

ContextActionService:BindAction("Fireball", onAction, true, table.unpack(Config.Keys))
ContextActionService:SetTitle("Fireball", "Fire")

-- other players' fireballs
Remote.OnClientEvent:Connect(function(caster, _origin, hitPos)
	task.spawn(playFireball, caster, hitPos)
end)
