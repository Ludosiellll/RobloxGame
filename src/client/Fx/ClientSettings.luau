--!strict
-- Настройки игрока на клиенте: громкость, тряска камеры, слабый режим. Сервер присылает
-- сохранённые значения, окно Settings меняет их. Эффекты читают значения отсюда.

local SoundService = game:GetService("SoundService")

local ClientSettings = {}

ClientSettings.values = { music = 70, sfx = 100, shake = true, lowDetail = false } :: { [string]: any }

local changed = Instance.new("BindableEvent")
ClientSettings.changed = changed.Event

local function group(name: string, key: string): SoundGroup
	local g = SoundService:FindFirstChild(name)
	if not g then
		g = Instance.new("SoundGroup")
		g.Name = name
		g.Volume = ((ClientSettings.values[key] :: number?) or 100) / 100 -- у SoundGroup по умолчанию 0.5
		g.Parent = SoundService
	end
	return g :: SoundGroup
end

function ClientSettings.sfxGroup(): SoundGroup
	return group("Sfx", "sfx")
end

function ClientSettings.musicGroup(): SoundGroup
	return group("Music", "music")
end

function ClientSettings.set(id: string, value: any)
	ClientSettings.values[id] = value
	if id == "music" and type(value) == "number" then
		ClientSettings.musicGroup().Volume = value / 100
	elseif id == "sfx" and type(value) == "number" then
		ClientSettings.sfxGroup().Volume = value / 100
	end
	changed:Fire(id, value)
end

return ClientSettings
