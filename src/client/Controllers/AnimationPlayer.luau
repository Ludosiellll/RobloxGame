--!strict
-- Свой проигрыватель анимаций существ: анимации пака не принадлежат игре, поэтому Animator
-- их не запустит. Клиент сам ставит Bone.Transform по кадрам Idle из
-- ReplicatedStorage.Runtime.AnimLibrary, только у ближайших существ (Config.Anim).
-- Нет костей или анимации — мягкое покачивание. У мутации Rainbow крутит цвет.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local AnimClip = require(Shared:WaitForChild("AnimClip") :: ModuleScript) :: any

local AnimationPlayer = {}

type Entry = {
	model: Model,
	id: string,
	bones: { [string]: Bone },
	parts: { BasePart },
	phase: number,
	scale: number,
	bob: number,
	since: number,
}

local entries: { [Model]: Entry } = {}
local clips: { [string]: any } = {}
local reported: { [string]: boolean } = {}
local library: Instance? = nil
local rng = Random.new()

local function lerpCFrame(a: CFrame, b: CFrame, e: number): CFrame
	return a:Lerp(b, e)
end

local function parse(ks: KeyframeSequence): any
	local frames = {}
	for _, kf in ks:GetKeyframes() do
		local poses = {}
		for _, p in kf:GetDescendants() do
			if p:IsA("Pose") then
				poses[p.Name] = { value = p.CFrame, style = p.EasingStyle.Value, dir = p.EasingDirection.Value, weight = p.Weight }
			end
		end
		table.insert(frames, { time = (kf :: Keyframe).Time, poses = poses })
	end
	return AnimClip.fromKeyframes(frames, ks.Loop)
end

local function clipFor(id: string): any
	local cached = clips[id]
	if cached then
		return cached
	end
	local ks = library and library:FindFirstChild(id)
	if ks and ks:IsA("KeyframeSequence") then
		local clip = parse(ks)
		clips[id] = clip
		return clip
	end
	return nil
end

-- Кости и детали модели (заново — если после стриминга старые экземпляры пропали).
local function scan(model: Model): ({ [string]: Bone }, { BasePart })
	local bones: { [string]: Bone } = {}
	local parts: { BasePart } = {}
	for _, d in model:GetDescendants() do
		if d:IsA("Bone") then
			bones[d.Name] = d
		elseif d:IsA("BasePart") then
			table.insert(parts, d)
		end
	end
	return bones, parts
end

local function stale(e: any): boolean
	local _, bone = next(e.bones)
	if bone then
		return bone.Parent == nil
	end
	return #e.parts == 0 or e.parts[1].Parent == nil
end

local function track(model: Instance)
	if not model:IsA("Model") or entries[model] then
		return
	end
	local id = model:GetAttribute("CreatureId")
	if type(id) ~= "string" then
		return
	end
	local bones, parts = scan(model)
	entries[model] = {
		model = model,
		id = id,
		bones = bones,
		parts = parts,
		phase = rng:NextNumber() * 10,
		scale = (model:GetAttribute("AnimScale") :: number?) or 1,
		bob = 0,
		since = os.clock(),
	}
end

local function report(id: string, why: string)
	if reported[id] then
		return
	end
	reported[id] = true
	warn(`[Anim] {id}: {why} — gentle bob instead`)
end

local function animate(e: Entry, clip: any, now: number)
	local values = AnimClip.sample(clip, now + e.phase, lerpCFrame)
	for name, cf in values do
		local bone = e.bones[name]
		if bone then
			if e.scale ~= 1 then
				cf = CFrame.new(cf.Position * e.scale) * cf.Rotation
			end
			bone.Transform = cf
		end
	end
end

local function bob(e: Entry, now: number)
	if e.model:GetAttribute("Carried") then
		return
	end
	local offset = math.sin((now + e.phase) * math.pi) * 0.3 -- период 2 с
	e.model:PivotTo(e.model:GetPivot() * CFrame.new(0, offset - e.bob, 0))
	e.bob = offset
end

local function rainbow(e: Entry, now: number)
	local c = Color3.fromHSV(((now + e.phase) / 3) % 1, 0.75, 1)
	for _, p in e.parts do
		p.Color = c
	end
end

local function origin(): Vector3?
	local character = Players.LocalPlayer.Character
	local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if root then
		return root.Position
	end
	local camera = workspace.CurrentCamera
	return camera and camera.CFrame.Position
end

local function step()
	local from = origin()
	if not from then
		return
	end
	local near: { { e: Entry, d: number } } = {}
	for model, e in entries do
		if model.Parent then
			local d = (model:GetPivot().Position - from).Magnitude
			if d <= Config.Anim.Radius then
				table.insert(near, { e = e, d = d })
			end
		else
			entries[model] = nil
		end
	end
	table.sort(near, function(a, b)
		return a.d < b.d
	end)
	local now = os.clock()
	for i = 1, math.min(#near, Config.Anim.MaxAnimated) do
		local e = near[i].e
		if stale(e) or (not next(e.bones) and now - e.since < 5) then
			e.bones, e.parts = scan(e.model)
		end
		local clip = if next(e.bones) then clipFor(e.id) else nil
		if clip then
			animate(e, clip, now)
		else
			bob(e, now)
			if not next(e.bones) then
				report(e.id, "model has no bones")
			elseif now - e.since > 5 then
				report(e.id, "no Idle animation in AnimLibrary")
			end
		end
		if e.model:GetAttribute("Rainbow") then
			rainbow(e, now)
		end
	end
end

function AnimationPlayer.start()
	task.spawn(function()
		library = ReplicatedStorage:WaitForChild("Runtime"):WaitForChild("AnimLibrary")
	end)
	for _, m in CollectionService:GetTagged("Creature") do
		track(m)
	end
	CollectionService:GetInstanceAddedSignal("Creature"):Connect(track)
	CollectionService:GetInstanceRemovedSignal("Creature"):Connect(function(m)
		entries[m :: Model] = nil
	end)
	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		local frame = 1 / Config.Anim.Fps
		if acc < frame then
			return
		end
		acc = 0
		local ok, err = pcall(step)
		if not ok then
			warn("[Anim] step failed: " .. tostring(err))
		end
	end)
end

return AnimationPlayer
