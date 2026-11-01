--!strict
-- Точка входа сервера.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config") :: ModuleScript)

print(`[Server] Rojo работает. Версия проекта: {Config.Version}`)
