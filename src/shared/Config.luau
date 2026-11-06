--!strict
-- Все числа игры. Баланс правится здесь.
-- Координаты — таблицы чисел, а не Vector3, чтобы модуль работал и в тестах вне Roblox.

return {
	Version = "0.1.0",

	BaseWalkSpeed = 22,
	BaseJumpHeight = 7.2,

	Meteor = {
		TelegraphTime = 3, -- круг на земле до удара, с
		FallTime = 1.2, -- полёт огненного шара, последние секунды телеграфа
		CoolTime = 2, -- после удара камень остывает, поднять нельзя
		DespawnUntouched = 90,
		DespawnDropped = 30,
		SpawnIntervalMin = 6,
		SpawnIntervalMax = 10,
		MaxPerZone = 6,
		SpawnEdgeMargin = 15,
		SpawnRayHeight = 400,
		SpawnMaxTries = 8,
		MinSpacing = 12,
		PickupDistance = 10,
		ZoneMutationBonus = 0.06, -- +6% к шансу мутации за каждую следующую зону
		BlockedHitNames = { "Water", "Lava", "Waterfall", "SwampWater" },
	},

	Carry = {
		StrengthPerLevel = 0.025,
		StrengthMaxLevel = 20,
		SpeedCheckInterval = 0.5,
		SpeedTolerance = 1.5,
		SpeedSlack = 5,
	},

	Push = {
		Cooldown = 3,
		Range = 8,
		ConeDegrees = 60,
		StunTime = 1,
		KnockbackSpeed = 60,
		DroppedPickupDelay = 1,
	},

	Base = {
		Width = 60,
		Depth = 45,
		SlotsStart = 6,
		SlotsMax = 24,
		PadCols = 6,
		PadSpacing = 9,
		CreatureHeight = 6,
		SafeZoneHeight = 40,
		OfflineRate = 0.5,
		OfflineMaxHours = 8,
		SellSeconds = 60,
		Layout = {
			Rows = 2,
			Cols = 4,
			ColX = { -120, -40, 40, 120 },
			RowZ = { 67.5, 127.5 },
		},
	},

	Rebirth = {
		IncomeBonus = 0.5,
	},

	Data = {
		StoreName = "PlayerData_v1",
		KeyPrefix = "u_",
		AutosaveSeconds = 60,
		LoadRetries = 3,
		LockStaleSeconds = 300,
		LockWaitSeconds = 5,
		LockWaitTries = 6,
		ReceiptsKept = 50,
	},

	Anim = {
		Fps = 24,
		Radius = 140,
		MaxAnimated = 40,
	},

	Announce = {
		RarityMin = "Mythic",
	},
}
