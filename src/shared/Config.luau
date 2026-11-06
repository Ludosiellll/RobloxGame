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

	-- Анимации игрока, опубликованные Денисом (docs/ANIMATIONS.md). Пусто — анимация выключена.
	PlayerAnims = {
		Carry = "",
		Push = "",
		Celebrate = "",
	},

	Announce = {
		RarityMin = "Mythic",
	},

	-- Карта — гигантский кратер с центром в начале координат (studs).
	Crater = {
		PlainRadius = 2500, -- равнина вокруг кратера
		RimRadius = 1950, -- край кратера
		RimY = 0,
		BaseRadius = 2120, -- базы по кругу на краю
		BaseCount = 8,
		Rings = {
			{ zones = { 1, 2, 3, 4 }, inner = 1380, outer = 1800, y = -60, startDeg = 45 },
			{ zones = { 5, 6, 7, 8, 9, 10 }, inner = 880, outer = 1300, y = -150, startDeg = 30 },
			{ zones = { 11, 12, 13, 14 }, inner = 480, outer = 800, y = -240, startDeg = 45 },
		},
		Moat = { inner = 400, outer = 480 }, -- лавовый обрыв между кольцом 3 и ядром (круче MaxSlopeAngle)
		Core = { zone = 17, radius = 400, y = -330 },
		Paths = { { zone = 15, deg = 67.5 }, { zone = 16, deg = 247.5 } }, -- дамбы через ров к ядру
		PathWidth = 80,
		PathOverhang = 20, -- дамба заходит на кольцо 3 и в ядро на столько studs
		Ramps = { perTransition = 8, startDeg = 22.5, width = 70, overhang = 24 },
		Geysers = { perTransition = 8, startDeg = 0, inset = 30, overshoot = 25 },
		MaxSlopeAngle = 40, -- круче персонаж не заходит: обрывы между кольцами только через спуски и гейзеры
		ChunkLength = 125, -- длина куска биома, который раскладывается по дуге
		SkipNames = { "Wall", "EndWall", "1", "2", "3", "Ground", "GrassTop" },
		SpawnMargin = 20,
		-- Материал Terrain для пола каждого сектора (имена Enum.Material).
		ZoneMaterials = {
			Forest = "LeafyGrass",
			Savana = "Ground",
			Desert = "Sand",
			Jungle = "Mud",
			Ocean = "Sandstone",
			Mountains = "Rock",
			Taiga = "Pebble",
			Winter = "Snow",
			PrehistoricForest = "Grass",
			DeepWaters = "Glacier",
			Hell = "Basalt",
			AncientRuins = "Limestone",
			MythicalParadise = "Salt",
			ShadowRealm = "Slate",
			HarvestFields = "WoodPlanks",
			PhantomHarbor = "Cobblestone",
			NuclearWasteland = "Basalt",
		},
		Materials = {
			Plain = "Grass",
			Slope = "Ground",
			Cliff = "Rock",
			Moat = "CrackedLava",
			Ramp = "Pavement",
		},
		-- Цвета материалов Terrain (общие на всю карту), RGB 0–255.
		MaterialColors = {
			Grass = { 106, 176, 76 },
			LeafyGrass = { 72, 140, 60 },
			Salt = { 236, 178, 222 },
			Slate = { 70, 56, 92 },
			Glacier = { 120, 170, 220 },
		},
		SlabThickness = 24, -- толщина слоя Terrain под поверхностью
		SlabStep = 40, -- шаг плит по дуге, studs
	},
}
