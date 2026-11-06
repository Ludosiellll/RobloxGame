--!strict
-- Питомцы идут за своими игроками: у каждого до 3 из атрибута Pets (ставит сервер), позади и
-- по бокам, покачиваются на месте и подпрыгивают на бегу. Только у игроков ближе 200 studs.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local PetCatalog = require(Shared:WaitForChild("Catalog"):WaitForChild("Pets") :: ModuleScript) :: any

local PetModel = require(script.Parent.Parent:WaitForChild("Fx"):WaitForChild("PetModel") :: ModuleScript) :: any

local PetFollow = {}

local RANGE = 200
local HEIGHT = 2.6
local OFFSETS = { Vector3.new(-3.2, 0, 3.5), Vector3.new(3.2, 0, 3.5), Vector3.new(0, 0, 6) }

type Pet = { model: Model, cf: CFrame, phase: number }
type Owner = { key: string, pets: { Pet } }

local owners: { [Player]: Owner } = {}
local folder: Folder? = nil

local function clear(player: Player)
	local o = owners[player]
	if o then
		for _, p in o.pets do
			p.model:Destroy()
		end
		owners[player] = nil
	end
end

local function build(player: Player, key: string, root: BasePart)
	clear(player)
	local o: Owner = { key = key, pets = {} }
	for i, id in string.split(key, ",") do
		if id ~= "" and i <= #OFFSETS then
			local def = PetCatalog.byId(id)
			local model = PetModel.build(id, def and def.rarity, HEIGHT)
			local cf = root.CFrame * CFrame.new(OFFSETS[i])
			model:PivotTo(cf)
			model.Parent = folder
			table.insert(o.pets, { model = model, cf = cf, phase = i * 1.7 })
		end
	end
	owners[player] = o
end

local function step(dt: number)
	local cam = workspace.CurrentCamera
	local now = os.clock()
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local key = (player:GetAttribute("Pets") :: string?) or ""
		if not root or not humanoid or key == "" or (cam and (cam.CFrame.Position - root.Position).Magnitude > RANGE) then
			clear(player)
		else
			local o = owners[player]
			if not o or o.key ~= key then
				build(player, key, root)
				o = owners[player]
			end
			local moving = humanoid.MoveDirection.Magnitude > 0.1
			local flat = CFrame.lookAt(root.Position, root.Position + Vector3.new(root.CFrame.LookVector.X, 0, root.CFrame.LookVector.Z))
			local alpha = 1 - math.exp(-dt * 8)
			for i, pet in (o :: Owner).pets do
				local target = flat * CFrame.new(OFFSETS[i]) - Vector3.new(0, humanoid.HipHeight + root.Size.Y / 2 - HEIGHT / 2, 0)
				pet.cf = pet.cf:Lerp(target, alpha)
				local lift = if moving then math.abs(math.sin(now * 9 + pet.phase)) * 0.9 else math.sin(now * 2 + pet.phase) * 0.2 + 0.2
				pet.model:PivotTo(pet.cf + Vector3.new(0, lift, 0))
			end
		end
	end
	for player in owners do
		if not player.Parent then
			clear(player)
		end
	end
end

function PetFollow.start()
	local f = Instance.new("Folder")
	f.Name = "Pets"
	f.Parent = workspace
	folder = f
	local reported = false
	RunService.RenderStepped:Connect(function(dt)
		local ok, err = pcall(step, dt)
		if not ok and not reported then
			reported = true
			warn("[Pets] follow failed: " .. tostring(err))
		end
	end)
	Players.PlayerRemoving:Connect(clear)
end

return PetFollow
