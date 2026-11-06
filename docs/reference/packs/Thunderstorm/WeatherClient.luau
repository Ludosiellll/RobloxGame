-- Thunderstorm: client side (everything you see and hear).
--   Arrive -> cinematic cutscene: letterbox, sky darkens, your Nuvems clouds roll in,
--             camera cranes up to the sky, cuts to a wide shot, a giant bolt slams down
--             into your thunderstrike VFX, white flash, title card, camera returns.
--   Strike -> warning glow, bolt from the clouds, thunderstrike burst, crater, thunder.
--   Clear  -> clouds and lighting fade back to normal.
-- Settings: ReplicatedStorage.WeatherConfig

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")
local Debris = game:GetService("Debris")
local SoundService = game:GetService("SoundService")
local StarterGui = game:GetService("StarterGui")

local Config = require(ReplicatedStorage:WaitForChild("WeatherConfig"))
local Remote = ReplicatedStorage:WaitForChild("WeatherRemote")
local Assets = ReplicatedStorage:WaitForChild("WeatherVFX")
local CloudsTemplate = Assets:WaitForChild("Nuvems")
local StrikeTemplate = Assets:WaitForChild("thunderstrike")

local player = Players.LocalPlayer

local fxFolder = Instance.new("Folder")
fxFolder.Name = "WeatherFX"
fxFolder.Parent = workspace

local rad = math.rad

------------------------------------------------------------------ small helpers
local function tween(obj, time, props, style, dir)
	local t = TweenService:Create(obj, TweenInfo.new(time, style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out), props)
	t:Play()
	return t
end

local function rand(range)
	return range[1] + math.random() * (range[2] - range[1])
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
		if k ~= "Parent" then p[k] = v end
	end
	p.Parent = props.Parent or fxFolder
	return p
end

local function sound(def, parent, extra)
	if not def or not def[1] or def[1] == "" then return nil end
	local s = Instance.new("Sound")
	s.SoundId = def[1]
	s.Volume = def[2] or 1
	for k, v in extra or {} do s[k] = v end
	s.Parent = parent or SoundService
	s:Play()
	if not s.Looped then
		s.Ended:Once(function() s:Destroy() end)
		Debris:AddItem(s, 30)
	end
	return s
end

local function soundAt(def, position, extra)
	local holder = Instance.new("Attachment")
	holder.WorldPosition = position
	holder.Parent = workspace.Terrain
	Debris:AddItem(holder, 20)
	extra = extra or {}
	extra.RollOffMinDistance = extra.RollOffMinDistance or 40
	extra.RollOffMaxDistance = extra.RollOffMaxDistance or 1500
	return sound(def, holder, extra)
end

-- Emit every ParticleEmitter once using its EmitCount / EmitDelay attributes.
local function burst(model)
	local longest = 0
	for _, e in model:GetDescendants() do
		if e:IsA("ParticleEmitter") then
			local count = math.max(1, math.floor((e:GetAttribute("EmitCount") or 10) + 0.5))
			local delay = e:GetAttribute("EmitDelay") or 0
			longest = math.max(longest, delay + e.Lifetime.Max)
			if delay > 0 then
				task.delay(delay, function() if e.Parent then e:Emit(count) end end)
			else
				e:Emit(count)
			end
		end
	end
	return longest
end

local function surfaceFrame(position, normal)
	local side = normal:Cross(Vector3.zAxis)
	if side.Magnitude < 0.01 then side = normal:Cross(Vector3.xAxis) end
	return CFrame.fromMatrix(position, normal, side.Unit)
end

------------------------------------------------------------------ camera: shake + cutscene control
local shake = { strength = 0, endT = 0, dur = 1 }
local cutsceneCam -- CFrameValue while a cutscene owns the camera

local function addShake(strength, duration)
	local now = os.clock()
	local remaining = math.max(shake.endT - now, 0)
	local current = shake.strength * math.clamp(remaining / shake.dur, 0, 1)
	shake.strength = math.max(current, strength)
	shake.dur = math.max(duration, remaining)
	shake.endT = now + shake.dur
end

local function shakeOffset()
	local now = os.clock()
	local remaining = shake.endT - now
	if remaining <= 0 then return CFrame.identity end
	local s = shake.strength * (remaining / shake.dur)
	local t = now * 38
	return CFrame.Angles(
		rad(math.noise(t, 0.3) * s),
		rad(math.noise(0.7, t) * s),
		rad(math.noise(t, t) * s * 0.5)
	)
end

RunService:BindToRenderStep("WeatherCamera", Enum.RenderPriority.Camera.Value + 2, function()
	local cam = workspace.CurrentCamera
	if cutsceneCam then
		cam.CFrame = cutsceneCam.Value * shakeOffset()
	else
		cam.CFrame *= shakeOffset()
	end
end)

------------------------------------------------------------------ screen overlay (letterbox, flash, title)
local gui = Instance.new("ScreenGui")
gui.Name = "WeatherScreen"
gui.IgnoreGuiInset = true
gui.ResetOnSpawn = false
gui.DisplayOrder = 50
gui.Parent = player:WaitForChild("PlayerGui")

local function bar(anchorY)
	local f = Instance.new("Frame")
	f.AnchorPoint = Vector2.new(0, anchorY)
	f.Position = UDim2.fromScale(0, anchorY)
	f.Size = UDim2.fromScale(1, 0)
	f.BackgroundColor3 = Color3.new(0, 0, 0)
	f.BorderSizePixel = 0
	f.ZIndex = 5
	f.Parent = gui
	return f
end
local topBar, bottomBar = bar(0), bar(1)

local flashFrame = Instance.new("Frame")
flashFrame.Size = UDim2.fromScale(1, 1)
flashFrame.BackgroundColor3 = Color3.fromRGB(230, 240, 255)
flashFrame.BackgroundTransparency = 1
flashFrame.BorderSizePixel = 0
flashFrame.ZIndex = 4
flashFrame.Parent = gui

local function textLabel(text, posY, height, weight)
	local t = Instance.new("TextLabel")
	t.AnchorPoint = Vector2.new(0.5, 0.5)
	t.Position = UDim2.fromScale(0.5, posY)
	t.Size = UDim2.fromScale(0.8, height)
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextScaled = true
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextTransparency = 1
	t.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", weight)
	t.ZIndex = 6
	t.Parent = gui
	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(15, 30, 70)
	stroke.Thickness = 2
	stroke.Transparency = 1
	stroke.Parent = t
	local grad = Instance.new("UIGradient")
	grad.Rotation = 90
	grad.Color = ColorSequence.new(Color3.new(1, 1, 1), Config.BoltColor)
	grad.Parent = t
	local scale = Instance.new("UIScale")
	scale.Parent = t
	return t, stroke, scale
end
local title, titleStroke, titleScale = textLabel(Config.Cutscene.Title, 0.42, 0.11, Enum.FontWeight.Heavy)
local subtitle, subtitleStroke = textLabel(Config.Cutscene.Subtitle, 0.52, 0.035, Enum.FontWeight.Medium)

local function showTitle(main, sub, holdTime)
	title.Text, subtitle.Text = main, sub
	titleScale.Scale = 1.25
	tween(title, 0.35, { TextTransparency = 0 })
	tween(titleStroke, 0.35, { Transparency = 0.2 })
	tween(titleScale, 1.6, { Scale = 1 }, Enum.EasingStyle.Quint)
	task.delay(0.25, function()
		tween(subtitle, 0.4, { TextTransparency = 0.1 })
		tween(subtitleStroke, 0.4, { Transparency = 0.3 })
	end)
	task.delay(holdTime, function()
		for _, o in { title, subtitle } do tween(o, 0.5, { TextTransparency = 1 }) end
		for _, o in { titleStroke, subtitleStroke } do tween(o, 0.5, { Transparency = 1 }) end
	end)
end

local function screenFlash(strength, time)
	flashFrame.BackgroundTransparency = 1 - strength
	tween(flashFrame, time, { BackgroundTransparency = 1 }, Enum.EasingStyle.Quad)
end

------------------------------------------------------------------ lighting: storm grade + flashes
local cc = Lighting:FindFirstChildOfClass("ColorCorrectionEffect")
if not cc then
	cc = Instance.new("ColorCorrectionEffect")
	cc.Name = "StormGrade"
	cc.Parent = Lighting
end
local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")

local function snapshot(obj, props)
	local t = {}
	for k in props do t[k] = obj[k] end
	return t
end

local S = Config.StormLighting
local original = {
	Lighting = snapshot(Lighting, S.Lighting),
	CC = snapshot(cc, S.ColorCorrection),
	Atmosphere = atmosphere and snapshot(atmosphere, S.Atmosphere),
}

local function setStormLighting(on, time)
	tween(Lighting, time, if on then S.Lighting else original.Lighting, Enum.EasingStyle.Sine)
	tween(cc, time, if on then S.ColorCorrection else original.CC, Enum.EasingStyle.Sine)
	if atmosphere then
		tween(atmosphere, time, if on then S.Atmosphere else original.Atmosphere, Enum.EasingStyle.Sine)
	end
end

local flashCC = Instance.new("ColorCorrectionEffect")
flashCC.Name = "LightningFlash"
flashCC.Parent = Lighting

local function skyFlash(strength, time)
	flashCC.Brightness = 0.5 * strength
	flashCC.Contrast = 0.3 * strength
	flashCC.TintColor = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(205, 225, 255), strength)
	tween(flashCC, time or 0.3, { Brightness = 0, Contrast = 0, TintColor = Color3.new(1, 1, 1) })
end

------------------------------------------------------------------ clouds (your Nuvems), faded in/out
local clouds -- { model, beams = { {beam, keypoints} }, emitters = { {emitter, rate} }, alpha }

local function setCloudAlpha(a)
	if not clouds then return end
	clouds.alpha = a
	for _, b in clouds.beams do
		local kps = {}
		for i, kp in b.keypoints do
			kps[i] = NumberSequenceKeypoint.new(kp.Time, 1 - (1 - kp.Value) * a, kp.Envelope)
		end
		b.beam.Transparency = NumberSequence.new(kps)
	end
	for _, e in clouds.emitters do
		e.emitter.Rate = e.rate * a
		e.emitter.Enabled = a > 0.05
	end
end

-- Makes a transparency sequence more solid while keeping its shape.
local function boostKeypoints(keypoints, boost)
	local out = {}
	for i, kp in keypoints do
		local opacity = math.min((1 - kp.Value) * boost, 1)
		out[i] = NumberSequenceKeypoint.new(kp.Time, 1 - opacity, kp.Envelope)
	end
	return out
end

local function peakOpacity(keypoints)
	local best = 0
	for _, kp in keypoints do best = math.max(best, 1 - kp.Value) end
	return best
end

local function spawnClouds()
	if clouds then clouds.model:Destroy() end
	local model = CloudsTemplate:Clone()
	clouds = { model = model, beams = {}, emitters = {}, alpha = 0 }
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
		elseif d:IsA("Beam") then
			table.insert(clouds.beams, { beam = d, keypoints = boostKeypoints(d.Transparency.Keypoints, Config.CloudBeamBoost) })
		elseif d:IsA("ParticleEmitter") then
			-- thicken the cloud puffs (the in-cloud lightning emitters are left as they are)
			local isLightning = d.Name:find("Lightning") or d.Name == "Glow"
			local rate = d.Rate
			if not isLightning then
				d.Transparency = NumberSequence.new(boostKeypoints(d.Transparency.Keypoints, Config.CloudParticleOpacity))
				d.Lifetime = NumberRange.new(d.Lifetime.Min * Config.CloudParticleLifetime, d.Lifetime.Max * Config.CloudParticleLifetime)
				rate *= Config.CloudParticleRate
			end
			table.insert(clouds.emitters, { emitter = d, rate = rate })
		end
	end
	setCloudAlpha(0)
	model.Parent = workspace
end

local cloudFadeToken = 0
local function fadeClouds(target, time, destroyAfter)
	if not clouds then return end
	cloudFadeToken += 1
	local token = cloudFadeToken
	local from = clouds.alpha
	local start = os.clock()
	task.spawn(function()
		while token == cloudFadeToken and clouds do
			local a = math.clamp((os.clock() - start) / time, 0, 1)
			setCloudAlpha(from + (target - from) * a)
			if a >= 1 then break end
			task.wait(1 / 30)
		end
		if destroyAfter and token == cloudFadeToken and clouds then
			clouds.model:Destroy()
			clouds = nil
		end
	end)
end

------------------------------------------------------------------ ground: finding it + crater
local function findGround(position)
	local ignore = { fxFolder }
	if clouds then table.insert(ignore, clouds.model) end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	for _ = 1, 4 do
		params.FilterDescendantsInstances = ignore
		local ground = workspace:Raycast(position + Vector3.new(0, 3, 0), Vector3.new(0, -12, 0), params)
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

local function groundLook(ground)
	if ground.Instance:IsA("Terrain") then
		local ok, color = pcall(function() return workspace.Terrain:GetMaterialColor(ground.Material) end)
		return (ok and color) or Color3.fromRGB(100, 100, 100), ground.Material
	end
	return ground.Instance.Color, ground.Instance.Material
end

local function shade(color, lo, hi)
	local k = (lo or 0.65) + math.random() * ((hi or 1) - (lo or 0.65))
	return Color3.new(color.R * k, color.G * k, color.B * k)
end

local CRATER_RINGS = {
	{ Radius = 4.5, Count = 9, Size = { 1.8, 3.2 }, Tilt = 50 },
	{ Radius = 8, Count = 13, Size = { 1.4, 2.6 }, Tilt = 32 },
}

local function crater(position, scale)
	local ground = findGround(position)
	if not ground then return end
	local center, normal = ground.Position, ground.Normal
	local color, material = groundLook(ground)
	local frame = surfaceFrame(center, normal)

	-- burnt scorch + electric glow that cools down
	local scorch = fxPart({
		Shape = Enum.PartType.Cylinder, Material = Enum.Material.SmoothPlastic,
		Color = Color3.fromRGB(14, 16, 22), Transparency = 0.2,
		Size = Vector3.new(0.05, 2, 2), CFrame = frame * CFrame.new(0.03, 0, 0),
	})
	tween(scorch, 0.12, { Size = Vector3.new(0.05, 13 * scale, 13 * scale) })
	task.delay(6, function() tween(scorch, 1.5, { Transparency = 1 }) end)
	Debris:AddItem(scorch, 7.6)

	local glow = fxPart({
		Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon,
		Color = Config.BoltColor, Transparency = 0.2,
		Size = Vector3.new(0.06, 8 * scale, 8 * scale), CFrame = frame * CFrame.new(0.04, 0, 0),
	})
	tween(glow, 1.6, { Transparency = 1, Color = Color3.fromRGB(40, 60, 140) })
	Debris:AddItem(glow, 1.7)

	local ring = fxPart({
		Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon,
		Color = Config.BoltColor, Transparency = 0.05,
		Size = Vector3.new(0.15, 3, 3), CFrame = frame * CFrame.new(0.2, 0, 0),
	})
	tween(ring, 0.55, { Size = Vector3.new(0.15, 40 * scale, 40 * scale), Transparency = 1 }, Enum.EasingStyle.Quart)
	Debris:AddItem(ring, 0.6)

	if normal.Y < 0.7 then return end

	-- rings of rocks punching up, tilted outward
	for ringIndex, r in CRATER_RINGS do
		local offset = math.random() * math.pi * 2
		for i = 1, r.Count do
			local angle = offset + (i / r.Count) * math.pi * 2 + (math.random() - 0.5) * 0.25
			local out = Vector3.new(math.cos(angle), 0, math.sin(angle))
			local s = rand(r.Size) * scale
			local size = Vector3.new(s * rand({ 0.9, 1.4 }), s * rand({ 0.5, 0.8 }), s * rand({ 0.8, 1.2 }))
			local radius = r.Radius * scale + (math.random() - 0.5) * 1.2
			local finalCF = CFrame.lookAt(center + out * radius, center + out * (radius + 1))
				* CFrame.Angles(rad(-r.Tilt + math.random(-10, 10)), 0, rad(math.random(-15, 15)))
				* CFrame.new(0, size.Y * 0.15, 0)
			local startCF = finalCF * CFrame.new(0, -size.Y * 1.3, 0)
			local rock = fxPart({ Size = size, Color = shade(color), Material = material, CFrame = startCF, CastShadow = true })
			task.delay((ringIndex - 1) * 0.04 + math.random() * 0.03, function()
				tween(rock, 0.16, { CFrame = finalCF }, Enum.EasingStyle.Back)
			end)
			task.delay(5 + math.random() * 0.8, function()
				tween(rock, 0.7, { CFrame = startCF, Size = size * 0.7 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
				Debris:AddItem(rock, 0.75)
			end)
		end
	end

	-- chunks blown into the air
	for _ = 1, math.floor(12 * scale) do
		local angle = math.random() * math.pi * 2
		local out = Vector3.new(math.cos(angle), 0, math.sin(angle))
		local s = rand({ 0.6, 1.5 }) * scale
		local chunk = fxPart({
			Size = Vector3.new(s, s * rand({ 0.6, 1 }), s * rand({ 0.7, 1.1 })),
			Color = shade(color), Material = material,
			CFrame = CFrame.new(center + out * rand({ 0.5, 3 }) + Vector3.new(0, 1, 0)) * CFrame.Angles(math.random() * 6, math.random() * 6, math.random() * 6),
			Anchored = false, CanCollide = true, Massless = true,
		})
		chunk.AssemblyLinearVelocity = out * rand({ 15, 35 }) + Vector3.new(0, rand({ 30, 60 }), 0)
		chunk.AssemblyAngularVelocity = Vector3.new(math.random(-20, 20), math.random(-20, 20), math.random(-20, 20))
		task.delay(3 + math.random(), function()
			tween(chunk, 0.5, { Size = chunk.Size * 0.2, Transparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
			Debris:AddItem(chunk, 0.55)
		end)
	end
end

------------------------------------------------------------------ the lightning bolt
local function boltPath(top, bottom, segments, jitter)
	local points = { top }
	for i = 1, segments - 1 do
		local a = i / segments
		local amp = jitter * (1 - a * 0.7)
		local p = top:Lerp(bottom, a) + Vector3.new((math.random() - 0.5) * 2 * amp, 0, (math.random() - 0.5) * 2 * amp)
		table.insert(points, p)
	end
	table.insert(points, bottom)
	return points
end

local function drawPath(points, coreWidth, glowWidth, parent, list)
	for i = 1, #points - 1 do
		local a, b = points[i], points[i + 1]
		local len = (b - a).Magnitude
		local cf = CFrame.lookAt((a + b) / 2, b)
		table.insert(list, { fxPart({ Parent = parent, Material = Enum.Material.Neon, Color = Config.BoltColor, Transparency = 0.55, Size = Vector3.new(glowWidth, glowWidth, len + glowWidth * 0.5), CFrame = cf }), 0.55 })
		table.insert(list, { fxPart({ Parent = parent, Material = Enum.Material.Neon, Color = Color3.new(1, 1, 1), Transparency = 0, Size = Vector3.new(coreWidth, coreWidth, len + coreWidth * 0.5), CFrame = cf }), 0 })
	end
end

local function lightningBolt(groundPos, scale)
	scale = scale or 1
	local top = Vector3.new(groundPos.X + math.random(-25, 25), Config.CloudBaseY, groundPos.Z + math.random(-25, 25))
	local folder = Instance.new("Folder")
	folder.Name = "Bolt"
	folder.Parent = fxFolder

	local parts = {}
	local main = boltPath(top, groundPos, 18, 9 * scale)
	drawPath(main, 0.7 * scale, 2.6 * scale, folder, parts)
	local groundSegment = parts[#parts][1] -- bottom of the main bolt, for the light

	-- forks branching off the main bolt
	for _ = 1, 4 do
		local from = main[math.random(3, #main - 4)]
		local dir = Vector3.new(math.random() - 0.5, -rand({ 0.6, 1.2 }), math.random() - 0.5).Unit
		local to = from + dir * rand({ 25, 55 }) * scale
		drawPath(boltPath(from, to, 6, 5 * scale), 0.3 * scale, 1.2 * scale, folder, parts)
	end

	local light = Instance.new("PointLight")
	light.Color = Config.BoltColor
	light.Range = 60
	light.Brightness = 14
	light.Shadows = true
	light.Parent = groundSegment

	local function setVisible(v)
		for _, p in parts do p[1].Transparency = if v then p[2] else 1 end
		light.Enabled = v
	end

	task.spawn(function()
		task.wait(0.07)
		setVisible(false)
		task.wait(0.05)
		setVisible(true)
		task.wait(0.09)
		for _, p in parts do tween(p[1], 0.3, { Transparency = 1 }) end
		tween(light, 0.4, { Brightness = 0 })
		Debris:AddItem(folder, 0.5)
	end)
end

------------------------------------------------------------------ one full strike
local function telegraph(position, time)
	local ground = findGround(position)
	local frame = if ground then surfaceFrame(ground.Position, ground.Normal) else CFrame.new(position) * CFrame.Angles(0, 0, rad(90))

	local ring = fxPart({
		Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon,
		Color = Config.BoltColor, Transparency = 0.75,
		Size = Vector3.new(0.1, 2, 2), CFrame = frame * CFrame.new(0.05, 0, 0),
	})
	tween(ring, time, { Size = Vector3.new(0.1, Config.Radius * 2, Config.Radius * 2), Transparency = 0.35 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	Debris:AddItem(ring, time + 0.05)

	-- faint column of light from the sky marking the target
	local height = 140
	local column = fxPart({
		Material = Enum.Material.Neon, Color = Config.BoltColor, Transparency = 1,
		Size = Vector3.new(0.6, height, 0.6), CFrame = CFrame.new(position + Vector3.new(0, height / 2, 0)),
	})
	tween(column, time, { Transparency = 0.82, Size = Vector3.new(2.2, height, 2.2) }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	Debris:AddItem(column, time + 0.05)
end

local function emitThunderstrike(position)
	local fx = StrikeTemplate:Clone()
	fx.Anchored = true
	fx.CanCollide = false
	fx.CanQuery = false
	fx.Transparency = 1
	fx.CFrame = CFrame.new(position + Vector3.new(0, 0.4, 0))
	fx.Parent = fxFolder
	Debris:AddItem(fx, burst(fx) + 0.5)
end

-- How close the camera is to a point, 0 (far) .. 1 (on top of it)
local function closeness(position, range)
	local cam = workspace.CurrentCamera
	return math.clamp(1 - (cam.CFrame.Position - position).Magnitude / range, 0, 1)
end

local function strike(position, opts)
	opts = opts or {}
	local tele = opts.telegraph or Config.TelegraphTime
	local scale = opts.scale or 1

	telegraph(position, tele)
	-- your thunderstrike's boom is timed 0.4s in, so start it early to land with the bolt
	task.delay(math.max(tele - 0.4, 0), emitThunderstrike, position)
	task.wait(tele)

	lightningBolt(position, scale)
	crater(position, scale)

	local k = closeness(position, 220)
	skyFlash(0.35 + 0.65 * k, 0.35)
	soundAt(Config.Sounds.Crack, position, { PlaybackSpeed = rand({ 0.92, 1.05 }) })
	if k > 0.25 then
		sound(Config.Sounds.Close, SoundService, { Volume = Config.Sounds.Close[2] * k })
	end

	if not opts.cinematic then
		screenFlash(0.55 * k ^ 1.5, 0.35)
		addShake(2.6 * k, 0.6)
		local cam = workspace.CurrentCamera
		local fov = cam.FieldOfView
		if k > 0.3 and not cutsceneCam then
			cam.FieldOfView = fov + 8 * k
			tween(cam, 0.4, { FieldOfView = fov }, Enum.EasingStyle.Back)
		end
	end
end

------------------------------------------------------------------ storm on / off
local stormOn = false
local ambience

local function startAmbience(fadeTime)
	if not ambience then
		ambience = sound(Config.Sounds.Ambience, SoundService, { Looped = true, Volume = 0 })
	end
	if ambience then tween(ambience, fadeTime, { Volume = Config.Sounds.Ambience[2] }) end
end

local function stopAmbience(fadeTime)
	local a = ambience
	ambience = nil
	if a then
		tween(a, fadeTime, { Volume = 0 })
		Debris:AddItem(a, fadeTime + 0.1)
	end
end

-- distant flashes inside the clouds while the storm is active
task.spawn(function()
	while true do
		task.wait(rand({ 4, 10 }))
		if stormOn and not cutsceneCam then
			skyFlash(rand({ 0.15, 0.35 }), 0.25)
			task.delay(0.1, skyFlash, rand({ 0.1, 0.25 }), 0.3)
			local list = Config.Sounds.Distant
			task.delay(rand({ 0.4, 1.5 }), sound, list[math.random(1, #list)])
		end
	end
end)

local function enterStorm(instant)
	stormOn = true
	spawnClouds()
	local t = if instant then 0.5 else Config.FadeTime
	fadeClouds(1, t)
	setStormLighting(true, t)
	startAmbience(t)
end

local function leaveStorm()
	stormOn = false
	fadeClouds(0, Config.FadeTime, true)
	setStormLighting(false, Config.FadeTime)
	stopAmbience(Config.FadeTime)
end

------------------------------------------------------------------ the arrival cutscene
local hiddenCore = {}
local function setHud(visible)
	if not visible then
		hiddenCore = {}
		for _, t in { Enum.CoreGuiType.Backpack, Enum.CoreGuiType.PlayerList, Enum.CoreGuiType.Chat, Enum.CoreGuiType.Health, Enum.CoreGuiType.EmotesMenu } do
			local ok, enabled = pcall(StarterGui.GetCoreGuiEnabled, StarterGui, t)
			if ok and enabled then
				table.insert(hiddenCore, t)
				pcall(StarterGui.SetCoreGuiEnabled, StarterGui, t, false)
			end
		end
	else
		for _, t in hiddenCore do pcall(StarterGui.SetCoreGuiEnabled, StarterGui, t, true) end
		hiddenCore = {}
	end
end

-- Freezes the player during the cutscene. Uses Roblox's PlayerModule when the place has one,
-- otherwise holds the character still. Returns a function that undoes it.
local function freezePlayer()
	local module = player:FindFirstChild("PlayerScripts") and player.PlayerScripts:FindFirstChild("PlayerModule")
	if module then
		local ok, controls = pcall(function() return require(module):GetControls() end)
		if ok and controls then
			controls:Disable()
			return function() controls:Enable() end
		end
	end
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not humanoid then return function() end end
	local walk, jump, jumpPower = humanoid.WalkSpeed, humanoid.JumpHeight, humanoid.JumpPower
	humanoid.WalkSpeed, humanoid.JumpHeight, humanoid.JumpPower = 0, 0, 0
	return function()
		if humanoid.Parent then
			humanoid.WalkSpeed, humanoid.JumpHeight, humanoid.JumpPower = walk, jump, jumpPower
		end
	end
end

local function letterbox(on, time)
	local h = if on then 0.11 else 0
	tween(topBar, time, { Size = UDim2.fromScale(1, h) }, Enum.EasingStyle.Quart)
	tween(bottomBar, time, { Size = UDim2.fromScale(1, h) }, Enum.EasingStyle.Quart)
end

local cutsceneToken = 0
local activeUnfreeze -- undo for the current cutscene's freeze, so a restarted cutscene can't lock you in place

local function playArrivalCutscene(strikePos)
	cutsceneToken += 1
	local token = cutsceneToken
	local cam = workspace.CurrentCamera
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local baseFov = cam.FieldOfView

	-- take over the camera
	local camValue = Instance.new("CFrameValue")
	camValue.Value = cam.CFrame
	local returnCF = cam.CFrame
	cutsceneCam = camValue
	cam.CameraType = Enum.CameraType.Scriptable
	if activeUnfreeze then activeUnfreeze() end
	setHud(true)
	activeUnfreeze = freezePlayer()
	setHud(false)
	letterbox(true, 0.7)

	local function wait(t)
		task.wait(t)
		return token == cutsceneToken
	end

	-- where things are
	local origin = if root then root.Position else strikePos + Vector3.new(0, 5, 60)
	local toStrike = strikePos - origin
	toStrike = Vector3.new(toStrike.X, 0, toStrike.Z)
	toStrike = if toStrike.Magnitude > 1 then toStrike.Unit else Vector3.zAxis
	local side = toStrike:Cross(Vector3.yAxis).Unit

	-- SHOT 1 (0 - 3.0s): the sky turns, camera cranes up from behind you to the clouds
	sound(Config.Sounds.BuildUp)
	addShake(0.35, 3)
	tween(camValue, 3, {
		Value = CFrame.lookAt(origin - toStrike * 9 + Vector3.new(0, 2.5, 0) + side * 3, strikePos + Vector3.new(0, 150, 0)),
	}, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)

	if not wait(1.6) then return end
	-- the clouds start crackling
	for i = 1, 3 do
		skyFlash(rand({ 0.25, 0.5 }), 0.2)
		if not wait(rand({ 0.12, 0.3 })) then return end
	end
	local list = Config.Sounds.Distant
	sound(list[math.random(1, #list)])
	if not wait(0.8) then return end

	-- SHOT 2 (3.0 - 3.9s): hard cut to a wide low shot of the strike spot, slow dolly in
	local wideFrom = strikePos + side * 62 - toStrike * 20 + Vector3.new(0, 5, 0)
	local wideTo = strikePos + side * 52 - toStrike * 16 + Vector3.new(0, 4, 0)
	local lookAt = strikePos + Vector3.new(0, 16, 0) -- ground sits in the lower third, sky above
	camValue.Value = CFrame.lookAt(wideFrom, lookAt)
	tween(camValue, 1.1, { Value = CFrame.lookAt(wideTo, lookAt) }, Enum.EasingStyle.Linear)
	skyFlash(0.3, 0.2)

	task.spawn(strike, strikePos, { telegraph = 0.9, scale = 1.6, cinematic = true })
	if not wait(0.9) then return end

	-- IMPACT (3.9s): blinding flash, heavy shake, FOV punch
	screenFlash(0.95, 0.6)
	addShake(3.2, 1.1)
	cam.FieldOfView = baseFov + 16
	tween(cam, 0.9, { FieldOfView = baseFov }, Enum.EasingStyle.Quart)
	sound(Config.Sounds.Close, SoundService, { Volume = Config.Sounds.Close[2] * 1.2 })

	-- SHOT 3 (3.9 - 6.3s): slow push in on the smoking impact, title card
	local pushTo = strikePos + side * 26 - toStrike * 8 + Vector3.new(0, 4, 0)
	tween(camValue, 2.4, { Value = CFrame.lookAt(pushTo, strikePos + Vector3.new(0, 6, 0)) }, Enum.EasingStyle.Quint)
	if Config.Cutscene.Title ~= "" then
		task.delay(0.35, showTitle, Config.Cutscene.Title, Config.Cutscene.Subtitle, 1.9)
	end
	if not wait(2.4) then return end

	-- SHOT 4 (6.3 - 7.4s): glide back to you and hand the camera back
	letterbox(false, 1)
	local back = tween(camValue, 1.1, { Value = returnCF }, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut)
	if not wait(1.1) then return end

	cutsceneCam = nil
	cam.CameraType = Enum.CameraType.Custom
	cam.FieldOfView = baseFov
	if activeUnfreeze then activeUnfreeze() activeUnfreeze = nil end
	setHud(true)
	camValue:Destroy()
end

------------------------------------------------------------------ server events
Remote.OnClientEvent:Connect(function(kind, position)
	if kind == "Arrive" then
		enterStorm(false)
		if Config.Cutscene.Enabled then
			task.spawn(playArrivalCutscene, position)
		else
			task.spawn(strike, position, { scale = 1.6 })
		end
	elseif kind == "Strike" then
		task.spawn(strike, position)
	elseif kind == "Clear" then
		leaveStorm()
	end
end)

-- joined while a storm is already going
if ReplicatedStorage:GetAttribute("Weather") == "Storm" then
	enterStorm(true)
end
