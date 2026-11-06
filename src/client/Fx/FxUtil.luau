--!strict
-- Общие помощники эффектов (перенесены из WeatherClient и FireballClient паков Thunderstorm и Fireball):
-- твины, детали эффектов, вспышка частиц, перекраска, звуки, поиск земли.

local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any

local FxUtil = {}

local folder: Folder? = nil

function FxUtil.folder(): Folder
	if folder and folder.Parent then
		return folder
	end
	local f = Instance.new("Folder")
	f.Name = "ClientFx"
	f.Parent = workspace
	folder = f
	return f
end

function FxUtil.tween(obj: Instance, time: number, props: { [string]: any }, style: Enum.EasingStyle?, dir: Enum.EasingDirection?): Tween
	local t = TweenService:Create(obj, TweenInfo.new(time, style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out), props)
	t:Play()
	return t
end

function FxUtil.rand(range: { number }): number
	return range[1] + math.random() * (range[2] - range[1])
end

function FxUtil.part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		if k ~= "Parent" then
			(p :: any)[k] = v
		end
	end
	p.Parent = props.Parent or FxUtil.folder()
	return p
end

-- Один выброс всех ParticleEmitter по атрибутам EmitCount / EmitDelay. Возвращает длительность.
function FxUtil.burst(root: Instance): number
	local longest = 0
	for _, e in root:GetDescendants() do
		if e:IsA("ParticleEmitter") then
			local count = math.max(1, math.floor(((e:GetAttribute("EmitCount") :: number?) or 10) + 0.5))
			local delay = (e:GetAttribute("EmitDelay") :: number?) or 0
			longest = math.max(longest, delay + e.Lifetime.Max)
			if delay > 0 then
				task.delay(delay, function()
					if e.Parent then
						e:Emit(count)
					end
				end)
			else
				e:Emit(count)
			end
		end
	end
	return longest
end

function FxUtil.setEmitters(root: Instance, enabled: boolean)
	for _, e in root:GetDescendants() do
		if e:IsA("ParticleEmitter") then
			e.Enabled = enabled
		end
	end
end

-- Перекрасить пламя, следы, лучи и свет в цвет (сохраняя яркость ключевых точек).
function FxUtil.recolor(root: Instance, color: Color3)
	local function shift(seq: ColorSequence): ColorSequence
		local points = {}
		for _, kp in seq.Keypoints do
			local _, _, v = kp.Value:ToHSV()
			local h, s = color:ToHSV()
			table.insert(points, ColorSequenceKeypoint.new(kp.Time, Color3.fromHSV(h, s, math.max(v, 0.6))))
		end
		return ColorSequence.new(points)
	end
	for _, d in root:GetDescendants() do
		if d:IsA("ParticleEmitter") or d:IsA("Trail") or d:IsA("Beam") then
			(d :: any).Color = shift((d :: any).Color)
		elseif d:IsA("PointLight") or d:IsA("SpotLight") then
			(d :: any).Color = color
		end
	end
end

function FxUtil.sound(def: { any }?, parent: Instance?, extra: { [string]: any }?): Sound?
	if not def or type(def[1]) ~= "string" or def[1] == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.SoundId = def[1]
	s.Volume = def[2] or 1
	s.PlaybackSpeed = def[3] or 1
	for k, v in extra or {} do
		(s :: any)[k] = v
	end
	s.Parent = parent or SoundService
	s:Play()
	s.Ended:Once(function()
		s:Destroy()
	end)
	Debris:AddItem(s, 20)
	return s
end

function FxUtil.soundAt(def: { any }?, position: Vector3, extra: { [string]: any }?): Sound?
	local holder = Instance.new("Attachment")
	holder.WorldPosition = position
	holder.Parent = workspace.Terrain
	Debris:AddItem(holder, 20)
	local e = extra or {}
	e.RollOffMinDistance = e.RollOffMinDistance or 40
	e.RollOffMaxDistance = e.RollOffMaxDistance or 1200
	return FxUtil.sound(def, holder, e)
end

-- Земля под точкой (пропуская персонажей и эффекты).
function FxUtil.findGround(position: Vector3): RaycastResult?
	local ignore: { Instance } = { FxUtil.folder() }
	local runtime = workspace:FindFirstChild("Runtime")
	if runtime then
		local meteors = runtime:FindFirstChild("Meteors")
		if meteors then
			table.insert(ignore, meteors)
		end
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	for _ = 1, 4 do
		params.FilterDescendantsInstances = ignore
		local hit = workspace:Raycast(position + Vector3.new(0, 6, 0), Vector3.new(0, -30, 0), params)
		if not hit then
			return nil
		end
		local model = hit.Instance:FindFirstAncestorOfClass("Model")
		if model and model:FindFirstChildOfClass("Humanoid") then
			table.insert(ignore, model)
		else
			return hit
		end
	end
	return nil
end

-- Кадр на поверхности: ось X — нормаль (так цилиндр ложится плашмя).
function FxUtil.surfaceFrame(position: Vector3, normal: Vector3): CFrame
	local side = normal:Cross(Vector3.zAxis)
	if side.Magnitude < 0.01 then
		side = normal:Cross(Vector3.xAxis)
	end
	return CFrame.fromMatrix(position, normal, side.Unit)
end

-- Насколько камера близко к точке: 0 — далеко, 1 — рядом.
function FxUtil.closeness(position: Vector3, range: number): number
	local cam = workspace.CurrentCamera
	if not cam then
		return 0
	end
	return math.clamp(1 - (cam.CFrame.Position - position).Magnitude / range, 0, 1)
end

function FxUtil.rarityColor(rarity: string): Color3
	local info = Rarity.Info[rarity] or Rarity.Info.Common
	return Color3.fromRGB(info.color[1], info.color[2], info.color[3])
end

-- Масштаб эффекта по редкости: Common 1 … Secret 2.
function FxUtil.rarityScale(rarity: string): number
	local i = Rarity.index(rarity)
	return 1 + (i - 1) / math.max(#Rarity.Order - 1, 1)
end

return FxUtil
