--!strict
-- Каналы связи между сервером и клиентами. Сервер создаёт их в ReplicatedStorage.Runtime.Remotes,
-- клиент ждёт. Неизвестное имя — ошибка, чтобы опечатка не создала лишний канал.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Remotes = {}

Remotes.Names = {
	"Push", -- клиент → сервер: толкнуть
	"Debug", -- клиент ↔ сервер: отладочные команды (только Studio)
	"Notify", -- сервер → клиент: короткое уведомление
	"Announce", -- сервер → все: объявление на весь сервер
	"Knockback", -- сервер → клиент цели: отбросить персонажа
	"MeteorIncoming", -- сервер → все: скоро падение
	"MeteorImpact", -- сервер → все: удар
	"MeteorRemoved", -- сервер → все: метеорит исчез
	"CreatureRevealed", -- сервер → все: существо появилось на базе
	"ZoneData", -- сервер → клиент: данные зон кратера
	"Upgrade", -- клиент → сервер: купить улучшение ("Strength" | "Slots")
	"Sell", -- клиент → сервер: продать ({mode="slot",slot} | {mode="below",rarity}); сервер → клиент: открыть окно продажи
	"Rebirth", -- клиент → сервер: переродиться
	"Settings", -- клиент → сервер: (id, value); сервер → клиент: все настройки при загрузке
	"Collection", -- сервер → клиент: найденные существа (список id)
	"ClaimIndex", -- клиент → сервер: забрать награды индекса
	"Hatch", -- клиент → сервер: купить и вылупить яйцо (eggId)
	"Equip", -- клиент → сервер: (uid, on) взять или убрать питомца
	"PetInventory", -- сервер → клиент: { pets, equipped }
	"Hatched", -- сервер → клиент: { egg, pet } для анимации вылупления
}

local function getFolder(): Instance
	if RunService:IsServer() then
		local runtime = ReplicatedStorage:FindFirstChild("Runtime")
		if not runtime then
			runtime = Instance.new("Folder")
			runtime.Name = "Runtime"
			runtime.Parent = ReplicatedStorage
		end
		local remotes = runtime:FindFirstChild("Remotes")
		if not remotes then
			remotes = Instance.new("Folder")
			remotes.Name = "Remotes"
			remotes.Parent = runtime
		end
		return remotes
	end
	return ReplicatedStorage:WaitForChild("Runtime"):WaitForChild("Remotes")
end

function Remotes.get(name: string): RemoteEvent
	assert(table.find(Remotes.Names, name), "unknown remote " .. name)
	local folder = getFolder()
	if RunService:IsServer() then
		local existing = folder:FindFirstChild(name)
		if existing then
			return existing :: RemoteEvent
		end
		local remote = Instance.new("RemoteEvent")
		remote.Name = name
		remote.Parent = folder
		return remote
	end
	return folder:WaitForChild(name) :: RemoteEvent
end

-- Сервер: создать все каналы сразу, чтобы клиенты не ждали.
function Remotes.init()
	assert(RunService:IsServer(), "Remotes.init is server-only")
	for _, name in Remotes.Names do
		Remotes.get(name)
	end
end

return Remotes
