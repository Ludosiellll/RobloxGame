--!strict
-- Интерфейс этапа 1: деньги и доход слева сверху, текущая зона сверху по центру, уведомления
-- справа, большой баннер объявлений, подсказка и луч к своей базе, пока несёшь метеорит.
-- Крупный текст для телефона. На этапе 2 меняется на Folk Stud UI.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Formulas = require(Shared:WaitForChild("Formulas") :: ModuleScript) :: any
local Layout = require(Shared:WaitForChild("CraterLayout") :: ModuleScript) :: any
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any
local Zones = require(Shared:WaitForChild("Zones") :: ModuleScript) :: any

local Hud = {}

local player = Players.LocalPlayer
local FONT = Font.new("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.Heavy) -- как в ките Folk Stud

local function stroke(parent: Instance, thickness: number?)
	local s = Instance.new("UIStroke")
	s.Name = "UIStroke"
	s.Thickness = thickness or 3.7
	s.LineJoinMode = Enum.LineJoinMode.Bevel
	s.Color = Color3.fromRGB(20, 20, 28)
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	s.Parent = parent
end

local function label(parent: Instance, props: { [string]: any }): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.FontFace = FONT
	l.TextScaled = true
	l.TextColor3 = Color3.new(1, 1, 1)
	for k, v in props do
		(l :: any)[k] = v
	end
	stroke(l)
	l.Parent = parent
	return l
end

local function tween(obj: Instance, time: number, props: { [string]: any })
	TweenService:Create(obj, TweenInfo.new(time, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props):Play()
end

local function rarityColor(rarity: string?): Color3
	local info = rarity and Rarity.Info[rarity]
	return if info then Color3.fromRGB(info.color[1], info.color[2], info.color[3]) else Color3.fromRGB(255, 220, 80)
end

function Hud.start()
	local gui = Instance.new("ScreenGui")
	gui.Name = "Hud"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = false
	gui.DisplayOrder = 10

	-- деньги и доход
	local wallet = Instance.new("Frame")
	wallet.BackgroundTransparency = 1
	-- справа сверху: слева рельса окон Folk Stud закрывает угол
	wallet.AnchorPoint = Vector2.new(1, 0)
	wallet.Position = UDim2.new(1, -14, 0, 10)
	wallet.Size = UDim2.fromOffset(260, 86)
	wallet.Parent = gui
	local money = label(wallet, { Size = UDim2.new(1, 0, 0, 52), Text = "$0", TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Color3.fromRGB(120, 255, 120) })
	local income = label(wallet, { Position = UDim2.fromOffset(0, 52), Size = UDim2.new(1, -2, 0, 30), Text = "+$0/s", TextXAlignment = Enum.TextXAlignment.Right })

	local function refreshMoney()
		local m = (player:GetAttribute("Money") :: number?) or 0
		local i = (player:GetAttribute("Income") :: number?) or 0
		money.Text = "$" .. Formulas.formatMoney(m)
		income.Text = "+$" .. Formulas.formatMoney(i) .. "/s"
	end
	player:GetAttributeChangedSignal("Money"):Connect(refreshMoney)
	player:GetAttributeChangedSignal("Income"):Connect(refreshMoney)
	refreshMoney()

	-- текущая зона
	local zoneLabel = label(gui, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 8), Size = UDim2.fromOffset(420, 44), Text = "", TextTransparency = 1 })
	local currentZone: number? = -1
	local function showZone(zone: number?)
		if zone == currentZone then
			return
		end
		currentZone = zone
		local def = zone and Zones.List[zone]
		zoneLabel.Text = if def then def.display else "Crater Rim"
		zoneLabel.TextTransparency = 1
		local s = zoneLabel:FindFirstChildOfClass("UIStroke")
		if s then
			s.Transparency = 1
			tween(s, 0.4, { Transparency = 0 })
		end
		tween(zoneLabel, 0.4, { TextTransparency = 0 })
	end

	-- уведомления справа
	local stack = Instance.new("Frame")
	stack.BackgroundTransparency = 1
	stack.AnchorPoint = Vector2.new(1, 0)
	stack.Position = UDim2.new(1, -14, 0, 110)
	stack.Size = UDim2.fromOffset(340, 300)
	stack.Parent = gui
	local list = Instance.new("UIListLayout")
	list.VerticalAlignment = Enum.VerticalAlignment.Top
	list.HorizontalAlignment = Enum.HorizontalAlignment.Right
	list.Padding = UDim.new(0, 6)
	list.Parent = stack
	local order = 0
	local function notify(text: string)
		order += 1
		local box = Instance.new("Frame")
		box.Size = UDim2.fromOffset(340, 40)
		box.BackgroundColor3 = Color3.fromRGB(25, 25, 35)
		box.BackgroundTransparency = 0.25
		box.LayoutOrder = order
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0, 10)
		corner.Parent = box
		label(box, { Position = UDim2.fromOffset(10, 4), Size = UDim2.new(1, -20, 1, -8), Text = text, TextXAlignment = Enum.TextXAlignment.Right })
		box.Parent = stack
		task.delay(3, function()
			tween(box, 0.3, { BackgroundTransparency = 1 })
			for _, d in box:GetDescendants() do
				if d:IsA("TextLabel") then
					tween(d, 0.3, { TextTransparency = 1 })
				elseif d:IsA("UIStroke") then
					tween(d, 0.3, { Transparency = 1 })
				end
			end
			task.wait(0.32)
			box:Destroy()
		end)
		local children = 0
		for _, c in stack:GetChildren() do
			if c:IsA("Frame") then
				children += 1
			end
		end
		if children > 5 then
			for _, c in stack:GetChildren() do
				if c:IsA("Frame") and c ~= box then
					c:Destroy()
					break
				end
			end
		end
	end
	Remotes.get("Notify").OnClientEvent:Connect(function(text: any)
		if type(text) == "string" then
			notify(text)
		end
	end)

	-- большой баннер объявлений
	local banner = label(gui, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 60), Size = UDim2.new(0.8, 0, 0, 64), Text = "", TextTransparency = 1, Visible = false })
	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new(Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 230, 0))
	gradient.Rotation = 90
	gradient.Parent = banner
	-- объявления идут по очереди, каждое по 4 секунды
	local queue: { { text: string, rarity: string? } } = {}
	local showing = false
	local function pump()
		if showing or #queue == 0 then
			return
		end
		showing = true
		local item = table.remove(queue, 1) :: { text: string, rarity: string? }
		banner.Text = item.text
		banner.TextColor3 = rarityColor(item.rarity)
		banner.Visible = true
		banner.TextTransparency = 1
		banner.Size = UDim2.new(0.6, 0, 0, 48)
		tween(banner, 0.25, { TextTransparency = 0, Size = UDim2.new(0.8, 0, 0, 64) })
		task.delay(4, function()
			tween(banner, 0.4, { TextTransparency = 1 })
			task.wait(0.42)
			banner.Visible = false
			showing = false
			pump()
		end)
	end
	Remotes.get("Announce").OnClientEvent:Connect(function(payload: any)
		local text = if type(payload) == "table" then payload.text elseif type(payload) == "string" then payload else nil
		if type(text) ~= "string" then
			return
		end
		if #queue < 5 then
			table.insert(queue, { text = text, rarity = if type(payload) == "table" and type(payload.rarity) == "string" then payload.rarity else nil })
		end
		pump()
	end)

	-- подсказка и луч к базе, пока несёшь метеорит
	local hint = label(gui, { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -120), Size = UDim2.fromOffset(460, 40), Text = "", Visible = false })
	local beam: Beam? = nil
	local baseAttachment: Attachment? = nil
	local function clearBeam()
		if beam then
			beam:Destroy()
			beam = nil
		end
		if baseAttachment then
			baseAttachment:Destroy()
			baseAttachment = nil
		end
	end
	local function syncCarry()
		local rarity = player:GetAttribute("Carrying") :: string?
		clearBeam()
		if not rarity then
			hint.Visible = false
			return
		end
		hint.Visible = true
		hint.Text = string.upper(rarity) .. " meteor — bring it to your base!"
		hint.TextColor3 = rarityColor(rarity)
		local index = player:GetAttribute("BaseIndex") :: number?
		local runtime = workspace:FindFirstChild("Runtime")
		local bases = runtime and runtime:FindFirstChild("Bases")
		local base = index and bases and bases:FindFirstChild("Base" .. index)
		local floor = base and base:FindFirstChild("Floor") :: BasePart?
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if floor and root then
			local a1 = Instance.new("Attachment")
			a1.Position = Vector3.new(0, 4, 0)
			a1.Parent = floor
			baseAttachment = a1
			local a0 = root:FindFirstChild("RootAttachment") :: Attachment?
			if a0 then
				local b = Instance.new("Beam")
				b.Attachment0 = a0
				b.Attachment1 = a1
				b.Color = ColorSequence.new(rarityColor(rarity))
				b.LightEmission = 1
				b.Width0 = 0.6
				b.Width1 = 3
				b.FaceCamera = true
				b.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(0.15, 0.6), NumberSequenceKeypoint.new(1, 0.35) })
				b.Segments = 20
				b.Parent = root
				beam = b
			end
		end
	end
	player:GetAttributeChangedSignal("Carrying"):Connect(syncCarry)
	player.CharacterAdded:Connect(function()
		task.defer(syncCarry)
	end)

	gui.Parent = player:WaitForChild("PlayerGui")

	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		if acc < 0.25 then
			return
		end
		acc = 0
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root then
			showZone(Layout.zoneAt(root.Position.X, root.Position.Z))
		end
	end)
end

return Hud
