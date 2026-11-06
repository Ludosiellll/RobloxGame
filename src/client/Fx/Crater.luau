--!strict
-- Воронка от удара: подпалина, светящееся пятно цвета редкости, ударное кольцо, кольца камней,
-- вылетающих из земли, и разлетающиеся куски (WeatherClient.crater + FireballConfig.GroundDebris).

local Debris = game:GetService("Debris")

local FxUtil = require(script.Parent:WaitForChild("FxUtil") :: ModuleScript) :: any
local ClientSettings = require(script.Parent:WaitForChild("ClientSettings") :: ModuleScript) :: any

local Crater = {}

local RINGS = {
	{ radius = 5, count = 9, size = { 2, 3.5 }, tilt = 45 },
	{ radius = 8.5, count = 13, size = { 1.6, 2.8 }, tilt = 30 },
}
local FLYING = { count = 12, size = { 0.6, 1.5 }, speed = { 25, 50 } }
local LIFETIME = 5

local function groundLook(hit: RaycastResult): (Color3, Enum.Material)
	if hit.Instance:IsA("Terrain") then
		local ok, color = pcall(function()
			return workspace.Terrain:GetMaterialColor(hit.Material)
		end)
		return (if ok then color else Color3.fromRGB(100, 100, 100)), hit.Material
	end
	local p = hit.Instance :: BasePart
	return p.Color, p.Material
end

local function shade(color: Color3): Color3
	local k = 0.65 + math.random() * 0.35
	return Color3.new(color.R * k, color.G * k, color.B * k)
end

function Crater.at(position: Vector3, scale: number, glowColor: Color3?)
	local hit = FxUtil.findGround(position)
	if not hit then
		return
	end
	local center, normal = hit.Position, hit.Normal
	local color, material = groundLook(hit)
	local frame = FxUtil.surfaceFrame(center, normal)
	local glowC = glowColor or Color3.fromRGB(255, 120, 40)

	local scorch = FxUtil.part({ Shape = Enum.PartType.Cylinder, Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(16, 14, 12), Transparency = 0.2, Size = Vector3.new(0.05, 2, 2), CFrame = frame * CFrame.new(0.03, 0, 0) })
	FxUtil.tween(scorch, 0.12, { Size = Vector3.new(0.05, 14 * scale, 14 * scale) })
	task.delay(LIFETIME + 1, function()
		FxUtil.tween(scorch, 1.5, { Transparency = 1 })
	end)
	Debris:AddItem(scorch, LIFETIME + 2.6)

	local glow = FxUtil.part({ Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon, Color = glowC, Transparency = 0.15, Size = Vector3.new(0.06, 9 * scale, 9 * scale), CFrame = frame * CFrame.new(0.04, 0, 0) })
	FxUtil.tween(glow, 2.2, { Transparency = 1, Color = Color3.fromRGB(60, 20, 10) })
	Debris:AddItem(glow, 2.3)

	local ring = FxUtil.part({ Shape = Enum.PartType.Cylinder, Material = Enum.Material.Neon, Color = glowC, Transparency = 0.05, Size = Vector3.new(0.15, 3, 3), CFrame = frame * CFrame.new(0.2, 0, 0) })
	FxUtil.tween(ring, 0.55, { Size = Vector3.new(0.15, 42 * scale, 42 * scale), Transparency = 1 }, Enum.EasingStyle.Quart)
	Debris:AddItem(ring, 0.6)

	if normal.Y < 0.7 or ClientSettings.values.lowDetail then
		return
	end

	for ringIndex, r in RINGS do
		local offset = math.random() * math.pi * 2
		for i = 1, r.count do
			local angle = offset + (i / r.count) * math.pi * 2 + (math.random() - 0.5) * 0.25
			local out = Vector3.new(math.cos(angle), 0, math.sin(angle))
			local s = FxUtil.rand(r.size) * scale
			local size = Vector3.new(s * FxUtil.rand({ 0.9, 1.4 }), s * FxUtil.rand({ 0.5, 0.8 }), s * FxUtil.rand({ 0.8, 1.2 }))
			local radius = r.radius * scale + (math.random() - 0.5) * 1.2
			local finalCF = CFrame.lookAt(center + out * radius, center + out * (radius + 1)) * CFrame.Angles(math.rad(-r.tilt + math.random(-10, 10)), 0, math.rad(math.random(-15, 15))) * CFrame.new(0, size.Y * 0.15, 0)
			local startCF = finalCF * CFrame.new(0, -size.Y * 1.3, 0)
			local rock = FxUtil.part({ Size = size, Color = shade(color), Material = material, CFrame = startCF, CastShadow = true })
			task.delay((ringIndex - 1) * 0.04 + math.random() * 0.03, function()
				FxUtil.tween(rock, 0.16, { CFrame = finalCF }, Enum.EasingStyle.Back)
			end)
			task.delay(LIFETIME + math.random() * 0.8, function()
				FxUtil.tween(rock, 0.7, { CFrame = startCF, Size = size * 0.7 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
				Debris:AddItem(rock, 0.75)
			end)
		end
	end

	for _ = 1, math.floor(FLYING.count * scale) do
		local angle = math.random() * math.pi * 2
		local out = Vector3.new(math.cos(angle), 0, math.sin(angle))
		local s = FxUtil.rand(FLYING.size) * scale
		local chunk = FxUtil.part({
			Size = Vector3.new(s, s * FxUtil.rand({ 0.6, 1 }), s * FxUtil.rand({ 0.7, 1.1 })),
			Color = shade(color),
			Material = material,
			CFrame = CFrame.new(center + out * FxUtil.rand({ 0.5, 3 }) + Vector3.new(0, 1, 0)) * CFrame.Angles(math.random() * 6, math.random() * 6, math.random() * 6),
			Anchored = false,
			CanCollide = false,
		})
		chunk.AssemblyLinearVelocity = out * FxUtil.rand(FLYING.speed) * 0.6 + Vector3.new(0, FxUtil.rand({ 30, 60 }), 0)
		chunk.AssemblyAngularVelocity = Vector3.new(math.random(-20, 20), math.random(-20, 20), math.random(-20, 20))
		task.delay(3 + math.random(), function()
			FxUtil.tween(chunk, 0.5, { Size = chunk.Size * 0.2, Transparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
			Debris:AddItem(chunk, 0.55)
		end)
	end
end

return Crater
