--!strict
-- Карточка игрока: тап или клик по другому игроку показывает его ник, перерождения, деньги,
-- лучшее существо и сколько поймано. Данные — атрибуты игрока, которые ставит сервер.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Creatures = require(Shared:WaitForChild("Catalog"):WaitForChild("Creatures") :: ModuleScript) :: any

local Profile = {}

local player = Players.LocalPlayer
local FONT = Font.new("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.Heavy)
local shown = 0

local function stroke(parent: Instance, thickness: number)
	local s = Instance.new("UIStroke")
	s.Name = "UIStroke"
	s.Thickness = thickness
	s.LineJoinMode = Enum.LineJoinMode.Bevel
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	s.Parent = parent
end

local function line(parent: Instance, y: number, h: number, text: string, color: Color3?)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Position = UDim2.fromOffset(18, y)
	l.Size = UDim2.new(1, -36, 0, h)
	l.FontFace = FONT
	l.TextScaled = true
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = color or Color3.new(1, 1, 1)
	l.Text = text
	stroke(l, 3.7)
	l.Parent = parent
end

local function num(p: Player, name: string): number
	local v = p:GetAttribute(name)
	return if type(v) == "number" then v else 0
end

local function show(gui: ScreenGui, target: Player)
	gui:ClearAllChildren()
	shown += 1
	local token = shown
	local card = Instance.new("Frame")
	card.AnchorPoint = Vector2.new(0.5, 1)
	card.Position = UDim2.new(0.5, 0, 1, -24)
	card.Size = UDim2.fromOffset(360, 196)
	card.BackgroundColor3 = Color3.fromRGB(0, 98, 255)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 16)
	corner.Parent = card
	local outline = Instance.new("UIStroke")
	outline.Thickness = 4
	outline.Parent = card
	local scale = Instance.new("UIScale")
	scale.Scale = 0.6
	scale.Parent = card
	line(card, 10, 42, target.DisplayName)
	line(card, 56, 30, `Rebirth {num(target, "Rebirths")}   ${Formulas.formatMoney(num(target, "Money"))}`)
	local bestId = target:GetAttribute("BestCreature")
	local def = type(bestId) == "string" and Creatures.byId(bestId) or nil
	if def then
		local c = Rarity.Info[def.rarity].color
		line(card, 92, 30, `Best: {def.name}`, Color3.fromRGB(c[1], c[2], c[3]))
		line(card, 124, 26, `{def.rarity}  ${Formulas.formatMoney(num(target, "BestCatch"))}/s`, Color3.fromRGB(c[1], c[2], c[3]))
	else
		line(card, 92, 30, "No creatures yet")
	end
	line(card, 156, 28, `Caught {Formulas.formatMoney(num(target, "Caught"))}`)
	card.Parent = gui
	TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	task.delay(6, function()
		if token == shown and card.Parent then
			card:Destroy()
		end
	end)
end

local function playerAt(screen: Vector2): Player?
	local cam = workspace.CurrentCamera
	if not cam then
		return nil
	end
	local ray = cam:ViewportPointToRay(screen.X, screen.Y)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = if player.Character then { player.Character } else {}
	local hit = workspace:Raycast(ray.Origin, ray.Direction * 300, params)
	local model = hit and hit.Instance:FindFirstAncestorOfClass("Model")
	while model and not model:FindFirstChildOfClass("Humanoid") do
		model = model:FindFirstAncestorOfClass("Model")
	end
	return model and Players:GetPlayerFromCharacter(model)
end

function Profile.start()
	local gui = Instance.new("ScreenGui")
	gui.Name = "ProfileCard"
	gui.ResetOnSpawn = false
	gui.DisplayOrder = 20
	gui.Parent = player:WaitForChild("PlayerGui")
	UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then
			return
		end
		local target = playerAt(Vector2.new(input.Position.X, input.Position.Y))
		if target and target ~= player then
			show(gui, target)
		end
	end)
end

return Profile
