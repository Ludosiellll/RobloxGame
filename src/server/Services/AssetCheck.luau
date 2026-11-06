--!strict
-- Проверка ассетов при запуске и доступ к ним. Чего не хватает — пишет в Output, куда положить.
-- Игра не падает без ассетов: у каждого места есть запасной вариант в коде, который его использует.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local AssetCheck = {}

type Check = { name: string, find: () -> Instance?, hint: string, optional: boolean? }

local function path(root: Instance, ...: string): Instance?
	local node: Instance? = root
	for _, name in { ... } do
		if not node then
			return nil
		end
		node = node:FindFirstChild(name)
	end
	return node
end

-- Пак брейнротов вставляется в Studio вручную (Insert from File): Rojo не переносит сетки MeshPart.
-- Подходит любое из мест: ServerStorage.Packs.Brainrots, ServerStorage["Brainrot Pack!"] и т. п.
local function brainrotFolder(): Instance?
	return path(ServerStorage, "Packs", "Brainrots")
		or path(ServerStorage, "Packs", "Brainrot Pack!")
		or path(ServerStorage, "Brainrot Pack!")
		or path(ServerStorage, "Brainrots")
end

local CHECKS: { Check } = {
	{ name = "Crater", find = function() return workspace:FindFirstChild("Crater") end, hint = "build it: Command Bar → require(game.ServerStorage.StudioTools.CraterBuilder).build() (docs/ASSET_SETUP.md)" },
	{ name = "Crater.BaseSlots", find = function() return path(workspace, "Crater", "BaseSlots") end, hint = "rebuild the crater, it creates the 8 base slots" },
	{ name = "Brainrots pack", find = brainrotFolder, hint = "ServerStorage → Insert from File → assets/packs/Brainrots.rbxm (docs/ASSET_SETUP.md)" },
	{ name = "VFX (Rojo)", find = function() return ReplicatedStorage:FindFirstChild("VFX") end, hint = "synced by Rojo from assets/vfx — connect Rojo" },
	{ name = "FireballVFX", find = function() return AssetCheck.fireball() end, hint = "synced by Rojo from assets/vfx/FireballVFX.rbxmx — connect Rojo" },
	{ name = "WeatherVFX", find = function() return AssetCheck.weather() end, hint = "synced by Rojo from assets/vfx/WeatherVFX.rbxmx — connect Rojo" },
	{ name = "MeteorRock", find = function() return path(ReplicatedStorage, "Packs", "MeteorRock") end, hint = "optional: Import 3D assets/meshes/meteor_1.obj, rename to MeteorRock, put into ReplicatedStorage.Packs", optional = true },
}

function AssetCheck.run(): { [string]: boolean }
	local result: { [string]: boolean } = {}
	for _, check in CHECKS do
		local ok = check.find() ~= nil
		result[check.name] = ok
		if ok then
			print("[Assets] OK " .. check.name)
		elseif check.optional then
			print("[Assets] optional, missing " .. check.name .. ": " .. check.hint)
		else
			warn("[Assets] MISSING " .. check.name .. ": " .. check.hint)
		end
	end
	return result
end

-- Модель брейнрота по id каталога (Rojo кладёт модели прямо в Packs.Brainrots; старый путь — запасной).
function AssetCheck.brainrot(id: string): Model?
	local folder = brainrotFolder()
	if not folder then
		return nil
	end
	local model = folder:FindFirstChild(id) or path(folder, "Brainrot Pack!", id)
	return if model and model:IsA("Model") then model else nil
end

function AssetCheck.crater(): Instance?
	return workspace:FindFirstChild("Crater")
end

function AssetCheck.fireball(): Instance?
	return path(ReplicatedStorage, "VFX", "FireballVFX") or path(ReplicatedStorage, "Packs", "FireballVFX")
end

function AssetCheck.weather(): Instance?
	return path(ReplicatedStorage, "VFX", "WeatherVFX") or path(ReplicatedStorage, "Packs", "WeatherVFX")
end

function AssetCheck.vfx(name: string): Instance?
	return path(ReplicatedStorage, "VFX", name)
end

function AssetCheck.meteorRock(): BasePart?
	local rock = path(ReplicatedStorage, "Packs", "MeteorRock")
	return if rock and rock:IsA("BasePart") then rock else nil
end

function AssetCheck.start()
	AssetCheck.run()
end

return AssetCheck
