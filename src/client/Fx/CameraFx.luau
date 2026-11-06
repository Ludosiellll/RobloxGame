--!strict
-- Тряска камеры, вспышка экрана, вспышка неба, толчок FOV (из WeatherClient: addShake, shakeOffset,
-- screenFlash, skyFlash). Камеру не забираем — только добавляем смещение поверх обычной.

local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local FxUtil = require(script.Parent:WaitForChild("FxUtil") :: ModuleScript) :: any

local CameraFx = {}

local shake = { strength = 0, endT = 0, dur = 1 }
local started = false
local flashFrame: Frame? = nil
local flashCC: ColorCorrectionEffect? = nil
local baseFov: number? = nil

local function ensure()
	if started then
		return
	end
	started = true
	RunService:BindToRenderStep("MeteorCameraFx", Enum.RenderPriority.Camera.Value + 2, function()
		local now = os.clock()
		local remaining = shake.endT - now
		if remaining <= 0 then
			return
		end
		local s = shake.strength * (remaining / shake.dur)
		local t = now * 38
		local cam = workspace.CurrentCamera
		if cam then
			cam.CFrame *= CFrame.Angles(math.rad(math.noise(t, 0.3) * s), math.rad(math.noise(0.7, t) * s), math.rad(math.noise(t, t) * s * 0.5))
		end
	end)
	local gui = Instance.new("ScreenGui")
	gui.Name = "MeteorFlash"
	gui.IgnoreGuiInset = true
	gui.ResetOnSpawn = false
	gui.DisplayOrder = 40
	local frame = Instance.new("Frame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = Color3.new(1, 1, 1)
	frame.BackgroundTransparency = 1
	frame.BorderSizePixel = 0
	frame.Parent = gui
	gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
	flashFrame = frame
	local cc = Instance.new("ColorCorrectionEffect")
	cc.Name = "MeteorSkyFlash"
	cc.Parent = Lighting
	flashCC = cc
end

function CameraFx.shake(strength: number, duration: number)
	ensure()
	local now = os.clock()
	local remaining = math.max(shake.endT - now, 0)
	local current = shake.strength * math.clamp(remaining / shake.dur, 0, 1)
	shake.strength = math.max(current, strength)
	shake.dur = math.max(duration, remaining)
	shake.endT = now + shake.dur
end

function CameraFx.flash(strength: number, time: number, color: Color3?)
	ensure()
	local f = flashFrame
	if not f then
		return
	end
	f.BackgroundColor3 = color or Color3.new(1, 1, 1)
	f.BackgroundTransparency = 1 - math.clamp(strength, 0, 1)
	FxUtil.tween(f, time, { BackgroundTransparency = 1 })
end

function CameraFx.skyFlash(strength: number, time: number)
	ensure()
	local cc = flashCC
	if not cc then
		return
	end
	cc.Brightness = 0.5 * strength
	cc.Contrast = 0.3 * strength
	cc.TintColor = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(205, 225, 255), strength)
	FxUtil.tween(cc, time, { Brightness = 0, Contrast = 0, TintColor = Color3.new(1, 1, 1) })
end

function CameraFx.fovPunch(amount: number)
	local cam = workspace.CurrentCamera
	if not cam then
		return
	end
	baseFov = baseFov or cam.FieldOfView
	cam.FieldOfView = (baseFov :: number) + amount
	FxUtil.tween(cam, 0.45, { FieldOfView = baseFov }, Enum.EasingStyle.Back)
end

return CameraFx
