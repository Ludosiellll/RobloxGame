--!strict
-- Стены ворот у этого игрока: только у него, поэтому не пускают его, но не мешают другим.
-- Какие стены ставить — считает CraterLayout.gateWalls по числу перерождений.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Layout = require(Shared:WaitForChild("CraterLayout") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any

local Gates = {}

local player = Players.LocalPlayer
local folder: Folder? = nil

local function label(part: BasePart, face: Enum.NormalId, text: string)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 20
	gui.LightInfluence = 0
	gui.Parent = part
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextScaled = true
	t.Font = Enum.Font.FredokaOne
	t.TextColor3 = Color3.new(1, 1, 1)
	t.Parent = gui
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Color = Color3.fromRGB(40, 10, 10)
	stroke.Parent = t
end

local function wallPart(cf: CFrame, size: Vector3, gate: number): Part
	local col = Rarity.Info.Legendary.color
	local p = Instance.new("Part")
	p.Name = "Gate"
	p.Anchored = true
	p.CanCollide = true
	p.CanQuery = false
	p.CastShadow = false
	p.Material = Enum.Material.ForceField
	p.Color = Color3.fromRGB(col[1], col[2], col[3])
	p.Transparency = 0.35
	p.CFrame = cf
	p.Size = size
	local text = `REBIRTH {gate} REQUIRED`
	label(p, Enum.NormalId.Front, text)
	label(p, Enum.NormalId.Back, text)
	p.Parent = folder
	return p
end

local function rebuild()
	if folder then
		folder:Destroy()
	end
	folder = Instance.new("Folder")
	folder.Name = "LocalGates"
	local rebirths = (player:GetAttribute("Rebirths") :: number?) or 0
	for _, w in Layout.gateWalls(rebirths) do
		local dir = Vector3.new(math.cos(w.angle), 0, math.sin(w.angle))
		local height = w.topY - w.bottomY
		local midY = (w.topY + w.bottomY) / 2
		if w.kind == "radial" then
			local mid = (w.inner + w.outer) / 2
			local center = Vector3.new(dir.X * mid, midY, dir.Z * mid)
			wallPart(CFrame.lookAt(center, center + dir), Vector3.new(3, height, w.outer - w.inner), w.gate)
		else
			local center = Vector3.new(dir.X * w.r, midY, dir.Z * w.r)
			wallPart(CFrame.lookAt(center, center + dir), Vector3.new(w.width, height, 3), w.gate)
		end
	end
	(folder :: Folder).Parent = workspace
end

function Gates.start()
	rebuild()
	player:GetAttributeChangedSignal("Rebirths"):Connect(rebuild)
end

return Gates
