--!strict
-- Отладочная панель, только в Studio: кнопка DEBUG слева снизу и кнопки команд с сервера.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Rarity = require(Shared:WaitForChild("Rarity") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local DebugPanel = {}

local function make(className: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(className)
	for k, v in props do
		(inst :: any)[k] = v
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

local function corner(parent: Instance, r: number)
	make("UICorner", { CornerRadius = UDim.new(0, r) }, parent)
end

local function button(text: string, color: Color3, parent: Instance, width: number): TextButton
	local b = make("TextButton", {
		Text = text,
		Size = UDim2.new(0, width, 0, 28),
		BackgroundColor3 = color,
		TextColor3 = Color3.new(1, 1, 1),
		Font = Enum.Font.GothamBold,
		TextSize = 14,
		AutoButtonColor = true,
	}, parent)
	corner(b, 6)
	return b
end

function DebugPanel.start()
	if not RunService:IsStudio() then
		return
	end
	local remote = Remotes.get("Debug")
	local notify = Remotes.get("Notify")
	local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

	local gui = make("ScreenGui", { Name = "DebugPanel", ResetOnSpawn = false, DisplayOrder = 50 }, playerGui)
	local toggle = button("DEBUG", Color3.fromRGB(200, 40, 60), gui, 90)
	toggle.Position = UDim2.new(0, 12, 1, -44)

	local panel = make("ScrollingFrame", {
		Visible = false,
		Position = UDim2.new(0, 12, 1, -420),
		Size = UDim2.new(0, 460, 0, 368),
		BackgroundColor3 = Color3.fromRGB(20, 22, 34),
		BackgroundTransparency = 0.1,
		ScrollBarThickness = 6,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
	}, gui)
	corner(panel, 10)
	make("UIPadding", { PaddingTop = UDim.new(0, 8), PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, panel)
	make("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, panel)
	local status = make("TextLabel", {
		LayoutOrder = 0,
		Size = UDim2.new(1, 0, 0, 22),
		BackgroundTransparency = 1,
		Text = "Commands load from the server…",
		TextColor3 = Color3.fromRGB(255, 220, 120),
		Font = Enum.Font.GothamMedium,
		TextSize = 14,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, panel)

	local function run(cmd: string, args: { string })
		remote:FireServer({ cmd = cmd, args = args })
	end

	local function rebuild(list: { { name: string, hint: string } })
		for _, child in panel:GetChildren() do
			if child:IsA("Frame") then
				child:Destroy()
			end
		end
		for i, c in list do
			local row = make("Frame", { LayoutOrder = i, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1 }, panel)
			make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Wraps = true, Padding = UDim.new(0, 4), VerticalAlignment = Enum.VerticalAlignment.Center }, row)
			local box = make("TextBox", {
				LayoutOrder = 2,
				Size = UDim2.new(0, 120, 0, 28),
				PlaceholderText = c.hint,
				Text = "",
				ClearTextOnFocus = false,
				BackgroundColor3 = Color3.fromRGB(40, 44, 64),
				TextColor3 = Color3.new(1, 1, 1),
				Font = Enum.Font.Gotham,
				TextSize = 14,
			}, row)
			corner(box, 6)
			local go = button(c.name, Color3.fromRGB(60, 120, 230), row, 110)
			go.LayoutOrder = 1
			go.Activated:Connect(function()
				local args = {}
				for word in string.gmatch(box.Text, "%S+") do
					table.insert(args, word)
				end
				run(c.name, args)
			end)
			if string.find(c.hint, "<Rarity", 1, true) then
				for k, name in Rarity.Order do
					local col = Rarity.Info[name].color
					local rb = button(string.sub(name, 1, 3), Color3.fromRGB(col[1], col[2], col[3]), row, 44)
					rb.LayoutOrder = 2 + k
					rb.TextColor3 = Color3.fromRGB(20, 20, 30)
					rb.Activated:Connect(function()
						local args = { name }
						for word in string.gmatch(box.Text, "%S+") do
							table.insert(args, word)
						end
						run(c.name, args)
					end)
				end
			end
		end
		status.Text = #list .. " commands"
	end

	remote.OnClientEvent:Connect(function(msg: any)
		if type(msg) == "table" and type(msg.list) == "table" then
			rebuild(msg.list)
		end
	end)
	notify.OnClientEvent:Connect(function(text: any)
		if type(text) == "string" then
			status.Text = text
		end
	end)
	toggle.Activated:Connect(function()
		panel.Visible = not panel.Visible
		if panel.Visible then
			run("list", {})
		end
	end)
end

return DebugPanel
