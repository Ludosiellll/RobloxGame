--!strict
-- Управление: толчок на F, на геймпаде X, на телефоне — экранная кнопка PUSH справа снизу.
-- Отбрасывание от чужого толчка приходит с сервера (Knockback).

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local Input = {}

local player = Players.LocalPlayer
local readyAt = 0

local function onPush(_name: string, state: Enum.UserInputState, _obj: InputObject): Enum.ContextActionResult
	if state ~= Enum.UserInputState.Begin then
		return Enum.ContextActionResult.Pass
	end
	local now = os.clock()
	if now < readyAt then
		return Enum.ContextActionResult.Sink
	end
	readyAt = now + Config.Push.Cooldown
	Remotes.get("Push"):FireServer()
	return Enum.ContextActionResult.Sink
end

function Input.start()
	ContextActionService:BindAction("Push", onPush, true, Enum.KeyCode.F, Enum.KeyCode.ButtonX)
	ContextActionService:SetTitle("Push", "PUSH")
	ContextActionService:SetPosition("Push", UDim2.new(1, -110, 1, -200))
	local button = ContextActionService:GetButton("Push")
	if button then
		button.Size = UDim2.fromOffset(90, 90)
	end
	Remotes.get("Knockback").OnClientEvent:Connect(function(direction: Vector3)
		if typeof(direction) ~= "Vector3" then
			return
		end
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root then
			root:ApplyImpulse(direction * Config.Push.KnockbackSpeed * root.AssemblyMass)
		end
	end)
end

return Input
