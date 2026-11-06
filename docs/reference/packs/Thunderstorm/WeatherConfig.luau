-- Thunderstorm settings. Server and client both read this.

return {
	------------------------------------------------ cycle
	AutoCycle = true,
	FirstStormDelay = 8,    -- seconds after the server starts (short so you see it fast in Studio)
	StormDuration = 120,
	ClearDuration = 90,
	ChatCommands = true,     -- "/storm" and "/clear" (anyone in Studio, only the place owner live)

	------------------------------------------------ arrival cutscene
	Cutscene = {
		Enabled = true,
		ArrivalDistance = 55,  -- how far in front of a player the arrival bolt lands
		Length = 7.6,          -- keep in sync with the client timeline
		Title = "",           -- title card text during the cutscene (empty = no title card)
		Subtitle = "",
	},

	------------------------------------------------ lightning strikes during the storm
	StrikeInterval = { 3.5, 8 },  -- seconds between strikes
	StrikeRange = { 20, 90 },     -- distance from a random player
	DirectHitChance = 0.25,       -- chance a strike targets right next to a player
	TelegraphTime = 0.9,          -- warning glow on the ground before the bolt lands
	Damage = 20,
	Radius = 12,
	Knockback = 70,
	DummiesCanDie = false,        -- NPCs stay at 1 HP

	------------------------------------------------ look
	CloudBaseY = 210,             -- bolts start here (bottom of your Nuvems clouds)
	BoltColor = Color3.fromRGB(150, 200, 255),
	FadeTime = 4.5,               -- storm fade in / out
	-- cloud thickness (1 = exactly as you built Nuvems)
	CloudBeamBoost = 4,           -- how solid the light-ray beams are
	CloudParticleOpacity = 1.8,   -- how solid each cloud puff is
	CloudParticleRate = 2.2,      -- more puffs at once
	CloudParticleLifetime = 1.8,  -- puffs live longer, so they overlap into a thick layer
	StormLighting = {
		Lighting = {
			Brightness = 1.1,
			Ambient = Color3.fromRGB(38, 42, 58),
			OutdoorAmbient = Color3.fromRGB(52, 58, 80),
			ExposureCompensation = -0.35,
		},
		ColorCorrection = {
			Brightness = -0.04,
			Contrast = 0.22,
			Saturation = -0.35,
			TintColor = Color3.fromRGB(195, 210, 255),
		},
		Atmosphere = {
			Density = 0.52,
			Color = Color3.fromRGB(95, 105, 130),
			Decay = Color3.fromRGB(40, 46, 64),
			Haze = 1.6,
		},
	},

	------------------------------------------------ sounds { id, volume }
	Sounds = {
		Ambience = { "rbxassetid://9120018695", 0.7 },   -- Thunder Distant Rumble 2 (ProSoundEffects), loops
		BuildUp = { "rbxassetid://138412364654043", 1.2 }, -- WX_Thunder_Muffled_02
		Crack = { "rbxassetid://9116282646", 2.2 },     -- Lightning Strike Sharp Hissing Crack 3 (ProSoundEffects)
		Close = { "rbxassetid://91289467382888", 1.4 },  -- WX_Thunder_Close_03
		Distant = {
			{ "rbxassetid://105118686124791", 0.8 },      -- WX_Thunder_Distant_03
			{ "rbxassetid://72113341430811", 0.8 },       -- WX_Thunder_Rolling_01
		},
	},
}
