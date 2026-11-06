--!strict
-- Все числа игры. Баланс правится здесь.
-- Координаты — таблицы чисел, а не Vector3, чтобы модуль работал и в тестах вне Roblox.

-- Масштаб кратера (см. Crater.Scale).
local CRATER_SCALE = 0.4

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
		SpeedTolerance = 1.5,
		SpeedSlack = 5,
		GeyserSpeed = 120, -- предел горизонтальной скорости в полёте с гейзера, studs/s
		GeyserWindow = 3, -- сколько секунд после гейзера действует этот предел
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
		CostBase = 25000, -- порог: CostBase × CostGrowth^n
		CostGrowth = 3,
	},

	-- Улучшения за деньги: цена base × growth^n.
	Upgrades = {
		Strength = { base = 150, growth = 1.55, max = 20 },
		Slots = { base = 500, growth = 1.8 },
	},

	-- Награда за полностью собранную редкость в индексе.
	IndexRewards = { Common = 1000, Rare = 5000, Epic = 25000, Legendary = 100000, Mythic = 500000, Secret = 2000000 },

	-- Питомцы: сколько ходит с игроком, сколько можно держать, бонус по редкости, веса вылупления.
	Pets = {
		Equipped = 3,
		MaxOwned = 60,
		Bonus = { Common = 0.05, Rare = 0.10, Epic = 0.20, Legendary = 0.35, Mythic = 0.60, Secret = 1.00 },
		Weight = { Common = 60, Rare = 25, Epic = 10, Legendary = 4, Mythic = 0.9, Secret = 0.1 },
	},

	-- Беговые дорожки: уровень k даёт Base × Growth^(k−1) скорости в секунду бега.
	Treadmill = { Tiers = 15, Base = 0.2, Growth = 1.5, PerBase = 3 },

	Leaderboard = {
		RefreshSeconds = 120,
		Top = 10,
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

	-- Эффекты падения и раскрытия (клиент). Звуки: { id, громкость, скорость }.
	Fx = {
		MaxDistance = 550, -- дальше этого — без шара, взрыва и воронки
		ColumnDistance = 1200, -- дальше этого — совсем ничего, ближе — только столб света
		FlightDistance = 220, -- откуда прилетает огненный шар
		FlightDir = { -0.45, 1, 0.25 },
		Shake = { MaxDistance = 120, Strength = 1.6, Duration = 0.5 },
		Flash = { MaxDistance = 70, FovPunch = 6 },
		BoltHeight = 220,
		Sounds = {
			Flight = { "rbxassetid://113831670560719", 0.8, 1 },
			Impact = { "rbxassetid://130565967505452", 1.1, 1 },
			ImpactLow = { "rbxassetid://139900006476219", 0.7, 1.05 },
			Crack = { "rbxassetid://9116282646", 1.8, 1 },
			Close = { "rbxassetid://91289467382888", 1.2, 1 },
			Reveal = { "rbxasset://sounds/electronicpingshort.wav", 0.9, 1.2 },
		},
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
		-- Все размеры кратера умножаются на Scale: 1 — исходный размер (около 80 с бега от базы до ядра),
		-- 0.4 — после проверки Дениса 2026-11-06 «карта огромная» (около 30 с). Углы склонов от масштаба не зависят.
		Scale = CRATER_SCALE,
		PlainRadius = 2500 * CRATER_SCALE, -- равнина вокруг кратера
		RimRadius = 1950 * CRATER_SCALE, -- край кратера
		RimY = 0,
		BaseRadius = 2120 * CRATER_SCALE, -- базы по кругу на краю
		BaseCount = 8,
		Rings = {
			{ zones = { 1, 2, 3, 4 }, inner = 1380 * CRATER_SCALE, outer = 1800 * CRATER_SCALE, y = -60 * CRATER_SCALE, startDeg = 45 },
			{ zones = { 5, 6, 7, 8, 9, 10 }, inner = 880 * CRATER_SCALE, outer = 1300 * CRATER_SCALE, y = -150 * CRATER_SCALE, startDeg = 30 },
			{ zones = { 11, 12, 13, 14 }, inner = 480 * CRATER_SCALE, outer = 800 * CRATER_SCALE, y = -240 * CRATER_SCALE, startDeg = 45 },
		},
		Moat = { inner = 400 * CRATER_SCALE, outer = 480 * CRATER_SCALE }, -- лавовый обрыв между кольцом 3 и ядром (круче MaxSlopeAngle)
		Core = { zone = 17, radius = 400 * CRATER_SCALE, y = -330 * CRATER_SCALE },
		Paths = { { zone = 15, deg = 67.5 }, { zone = 16, deg = 247.5 } }, -- дамбы через ров к ядру
		PathWidth = 80 * CRATER_SCALE,
		PathOverhang = 20 * CRATER_SCALE, -- дамба заходит на кольцо 3 и в ядро на столько studs
		Ramps = { perTransition = 8, startDeg = 22.5, width = 70 * CRATER_SCALE, overhang = 24 * CRATER_SCALE },
		Geysers = { perTransition = 8, startDeg = 0, inset = 30 * CRATER_SCALE, overshoot = 25 * CRATER_SCALE },
		MaxSlopeAngle = 40, -- круче персонаж не заходит: обрывы между кольцами только через спуски и гейзеры
		ChunkLength = 125, -- длина куска биома, который раскладывается по дуге
		SkipNames = { "Wall", "EndWall", "1", "2", "3", "Ground", "GrassTop" },
		SpawnMargin = 20 * CRATER_SCALE,
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
			Plain = "Ground", -- без травы: декоративная трава прорастает сквозь пол баз
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
