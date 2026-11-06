--!strict
-- Библиотека анимаций для клиентов: на каждый тип существа один раз кладёт копию его
-- AnimSaves.Idle в ReplicatedStorage.Runtime.AnimLibrary[creatureId]. Клиент проигрывает её сам.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local AssetCheck = require(script.Parent:WaitForChild("AssetCheck") :: ModuleScript) :: any

local AnimLibrary = {}

local function folder(): Folder
	local runtime = ReplicatedStorage:FindFirstChild("Runtime")
	if not runtime then
		runtime = Instance.new("Folder")
		runtime.Name = "Runtime"
		runtime.Parent = ReplicatedStorage
	end
	local lib = (runtime :: Instance):FindFirstChild("AnimLibrary")
	if not lib then
		lib = Instance.new("Folder")
		lib.Name = "AnimLibrary"
		lib.Parent = runtime
	end
	return lib :: Folder
end

-- true, если анимация Idle этого существа есть в библиотеке.
function AnimLibrary.ensure(creatureId: string): boolean
	local lib = folder()
	if lib:FindFirstChild(creatureId) then
		return true
	end
	local src = AssetCheck.brainrot(creatureId)
	local saves = src and src:FindFirstChild("AnimSaves")
	local idle = saves and saves:FindFirstChild("Idle")
	if not idle or not idle:IsA("KeyframeSequence") then
		return false
	end
	local copy = idle:Clone()
	copy.Name = creatureId
	copy.Parent = lib
	return true
end

function AnimLibrary.start()
	folder()
end

return AnimLibrary
