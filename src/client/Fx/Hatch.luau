--!strict
-- Вылупление: яйцо по центру экрана трясётся всё сильнее, вспышка цвета редкости, потом питомец
-- и карточка: имя, редкость, бонус. Нажатие или 3 секунды — закрыть.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Eggs = require(Shared:WaitForChild("Catalog"):WaitForChild("Eggs") :: ModuleScript) :: any
local PetCatalog = require(Shared:WaitForChild("Catalog"):WaitForChild("Pets") :: ModuleScript) :: any

local PetModel = require(script.Parent:WaitForChild("PetModel") :: ModuleScript) :: any
local FxUtil = require(script.Parent:WaitForChild("FxUtil") :: ModuleScript) :: any

local Hatch = {}

local FONT = Font.new("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.Heavy)
local BONUS_NAME = { speed = "Speed", luck = "Luck", income = "Income" }
local busy = false
local queue: { { egg: string, pet: string } } = {}

local function label(parent: Instance, text: string, y: number, h: number, color: Color3?)
	local l = Instance.new("TextLabel")
	l.AnchorPoint = Vector2.new(0.5, 0.5)
	l.Position = UDim2.new(0.5, 0, 0.5, y)
	l.Size = UDim2.fromOffset(520, h)
	l.BackgroundTransparency = 1
	l.FontFace = FONT
	l.TextScaled = true
	l.TextColor3 = color or Color3.new(1, 1, 1)
	l.Text = text
	local s = Instance.new("UIStroke")
	s.Name = "UIStroke"
	s.Thickness = 3.7
	s.LineJoinMode = Enum.LineJoinMode.Bevel
	s.Parent = l
	l.Parent = parent
	return l
end

local function show(egg: string, pet: string)
	busy = true
	local eggDef = Eggs.byId(egg)
	local petDef = PetCatalog.byId(pet)
	local rarity = if petDef then petDef.rarity else "Common"
	local c = Rarity.Info[rarity].color
	local color = Color3.fromRGB(c[1], c[2], c[3])

	local gui = Instance.new("ScreenGui")
	gui.Name = "Hatch"
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 60
	gui.ResetOnSpawn = false
	local dim = Instance.new("TextButton")
	dim.Size = UDim2.fromScale(1, 1)
	dim.BackgroundColor3 = Color3.new(0, 0, 0)
	dim.BackgroundTransparency = 0.45
	dim.Text = ""
	dim.AutoButtonColor = false
	dim.Parent = gui
	local view = Instance.new("ViewportFrame")
	view.AnchorPoint = Vector2.new(0.5, 0.5)
	view.Position = UDim2.fromScale(0.5, 0.45)
	view.Size = UDim2.fromOffset(320, 320)
	view.BackgroundTransparency = 1
	view.Parent = gui
	local cam = Instance.new("Camera")
	cam.FieldOfView = 40
	view.CurrentCamera = cam
	cam.Parent = view
	gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")

	local eggModel = PetModel.build(if eggDef then eggDef.model else egg, nil, 4)
	eggModel:PivotTo(CFrame.new())
	eggModel.Parent = view
	cam.CFrame = CFrame.lookAt(Vector3.new(0, 1, 9), Vector3.zero)

	local t0 = os.clock()
	local conn = RunService.RenderStepped:Connect(function()
		local t = os.clock() - t0
		local k = math.clamp(t / 1.2, 0, 1)
		eggModel:PivotTo(CFrame.Angles(0, 0, math.sin(t * (10 + 25 * k)) * 0.35 * k))
	end)
	FxUtil.sound(Config.Fx.Sounds.Reveal)
	task.wait(1.2)
	conn:Disconnect()
	eggModel:Destroy()

	local flash = Instance.new("Frame")
	flash.Size = UDim2.fromScale(1, 1)
	flash.BackgroundColor3 = color:Lerp(Color3.new(1, 1, 1), 0.5)
	flash.BorderSizePixel = 0
	flash.Parent = gui
	TweenService:Create(flash, TweenInfo.new(0.5), { BackgroundTransparency = 1 }):Play()

	local petModel = PetModel.build(pet, rarity, 4)
	petModel:PivotTo(CFrame.Angles(0, math.pi, 0))
	petModel.Parent = view
	local spin = RunService.RenderStepped:Connect(function(dt)
		petModel:PivotTo(petModel:GetPivot() * CFrame.Angles(0, dt * 1.2, 0))
	end)
	label(gui, if petDef then petDef.name else pet, 150, 52)
	label(gui, string.upper(rarity), 200, 34, color)
	if petDef then
		local bonus = Config.Pets.Bonus[rarity] or 0
		label(gui, `+{math.floor(bonus * 100 + 0.5)}% {BONUS_NAME[petDef.bonus]}`, 238, 30, Color3.fromRGB(120, 255, 120))
	end
	local closed = false
	local function close()
		if closed then
			return
		end
		closed = true
		spin:Disconnect()
		gui:Destroy()
		busy = false
		local nextOne = table.remove(queue, 1)
		if nextOne then
			task.spawn(show, nextOne.egg, nextOne.pet)
		end
	end
	dim.Activated:Connect(close)
	task.delay(3, close)
end

function Hatch.play(egg: string, pet: string)
	if busy then
		if #queue < 5 then
			table.insert(queue, { egg = egg, pet = pet })
		end
		return
	end
	task.spawn(show, egg, pet)
end

return Hatch
