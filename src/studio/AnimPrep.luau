--!strict
-- Подготовка анимаций игрока к публикации. Только Studio, режим редактирования.
-- Command Bar: require(game.ServerStorage.StudioTools.AnimPrep).run()
-- Ставит в Workspace манекен R15 «AnimRig» с папкой AnimSaves (Carry, Push, Celebrate).
-- Дальше: Avatar → Animation Editor → выбрать AnimRig → «…» → Load → анимация → «…» → Publish to Roblox.

local Players = game:GetService("Players")

local AnimPrep = {}

function AnimPrep.run(): Model
	local anims = script.Parent:FindFirstChild("Anims")
	assert(anims, "ServerStorage.StudioTools.Anims not found — connect Rojo")
	local old = workspace:FindFirstChild("AnimRig")
	if old then
		old:Destroy()
	end
	local rig = Players:CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
	rig.Name = "AnimRig"
	local root = rig:FindFirstChild("HumanoidRootPart") :: BasePart
	root.Anchored = true
	rig:PivotTo(CFrame.new(0, 10, 0))
	local saves = Instance.new("ObjectValue")
	saves.Name = "AnimSaves"
	saves.Parent = rig
	for _, ks in anims:GetChildren() do
		if ks:IsA("KeyframeSequence") then
			ks:Clone().Parent = saves
		end
	end
	rig.Parent = workspace
	print(`[AnimPrep] AnimRig ready with {#saves:GetChildren()} animations. Open Animation Editor, select AnimRig, Load → Publish.`)
	return rig
end

return AnimPrep
