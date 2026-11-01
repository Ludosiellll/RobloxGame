--!strict
-- Точка входа клиента.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config") :: ModuleScript)

print(`[Client] Rojo работает у игрока {Players.LocalPlayer.Name}. Версия проекта: {Config.Version}`)
