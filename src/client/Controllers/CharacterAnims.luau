--!strict
-- Анимации своего персонажа: несёт метеорит (атрибут Carrying), толкнул (Push с сервера),
-- перерождение (рост атрибута Rebirths). Анимации своего персонажа Roblox сам показывает другим.
-- Пустой id в Config.PlayerAnims — анимация выключена, игра работает без неё.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config") :: ModuleScript) :: any
local Remotes = require(Shared:WaitForChild("Remotes") :: ModuleScript) :: any

local CharacterAnims = {}

local player = Players.LocalPlayer
local tracks: { [string]: AnimationTrack } = {}

local function load(animator: Animator, name: string, looped: boolean)
	local id = Config.PlayerAnims[name]
	if type(id) ~= "string" or id == "" then
		return
	end
	local anim = Instance.new("Animation")
	anim.AnimationId = if string.find(id, "rbxassetid://", 1, true) then id else "rbxassetid://" .. id
	local ok, track = pcall(function()
		return animator:LoadAnimation(anim)
	end)
	if ok and track then
		track.Looped = looped
		track.Priority = Enum.AnimationPriority.Action
		tracks[name] = track
	else
		warn(`[Anims] can't load {name} ({id}): {track}`)
	end
end

local function syncCarry()
	local t = tracks.Carry
	if not t then
		return
	end
	if player:GetAttribute("Carrying") then
		if not t.IsPlaying then
			t:Play(0.15)
		end
	elseif t.IsPlaying then
		t:Stop(0.2)
	end
end

local function onCharacter(character: Model)
	table.clear(tracks)
	local humanoid = character:WaitForChild("Humanoid", 10) :: Humanoid?
	local animator = humanoid and humanoid:WaitForChild("Animator", 10) :: Animator?
	if not animator then
		return
	end
	load(animator, "Carry", true)
	load(animator, "Push", false)
	load(animator, "Celebrate", false)
	syncCarry()
end

function CharacterAnims.start()
	player.CharacterAdded:Connect(onCharacter)
	if player.Character then
		task.spawn(onCharacter, player.Character)
	end
	player:GetAttributeChangedSignal("Carrying"):Connect(syncCarry)
	local rebirths = (player:GetAttribute("Rebirths") :: number?) or 0
	player:GetAttributeChangedSignal("Rebirths"):Connect(function()
		local now = (player:GetAttribute("Rebirths") :: number?) or 0
		if now > rebirths and tracks.Celebrate then
			tracks.Celebrate:Play(0.1)
		end
		rebirths = now
	end)
	Remotes.get("Push").OnClientEvent:Connect(function(pusher: Player)
		if pusher == player and tracks.Push then
			tracks.Push:Play(0.05)
		end
	end)
end

return CharacterAnims
