-- Shared settings for the fireball. Server and client both read this,
-- so timing and damage always match what players see.

return {
	-- input
	Keys = { Enum.KeyCode.E, Enum.KeyCode.ButtonX },
	Cooldown = 0.8,

	-- flight
	ChargeTime = 0.22,       -- orb sits in the hand before launching
	Speed = 150,             -- studs per second
	MaxRange = 350,
	HandOffset = 1.5,        -- studs in front of the hand the orb appears

	-- damage (server)
	Damage = 25,
	Radius = 12,             -- full damage at the centre, half at the edge
	Knockback = 55,
	DummiesCanDie = false,   -- NPCs (like the Rig) stay at 1 HP for showcasing

	-- look
	Color = Color3.fromRGB(255, 110, 30),
	OrbLight = { Range = 16, Brightness = 4 },
	ImpactLight = { Range = 40, Brightness = 10, FadeTime = 0.7 },
	RingSize = 26,           -- final width of the ground shockwave ring
	ScorchTime = 4,          -- how long the burn mark stays on the ground

	-- ground destruction (crater rocks + flying chunks), only on fairly flat ground
	GroundDebris = {
		Enabled = true,
		Rings = {                -- each ring of rocks around the crater
			{ Radius = 5, Count = 9, Size = { 2, 3.5 }, Tilt = 45 },
			{ Radius = 8.5, Count = 13, Size = { 1.6, 2.8 }, Tilt = 30 },
		},
		FlyingCount = 12,        -- small chunks thrown into the air
		FlyingSize = { 0.6, 1.5 },
		FlyingSpeed = { 25, 50 },
		Lifetime = 4,            -- seconds before rocks sink back into the ground
	},

	-- the moment the fireball leaves the hand
	Muzzle = {
		FlameSpeed = { 25, 55 },  -- flames blasted forward out of the hand
		Spread = 25,
		RingSize = 7,
	},
	CastScreenFX = {          -- only the caster sees these
		Enabled = true,
		ScreenFlames = true,     -- your fireball flames streak past the camera like a dash
		FlameScale = 0.35,       -- size of the streaking flames
		StreakCount = 10,
		StreakRadius = 0.62,     -- where streaks start: 0 = screen centre, 1 = screen edge        -- how many streak spawners ring the screen
		StreakSpeed = { 45, 70 },
		StreakStretch = -2,      -- particle Squash: more negative = longer streaks (-3 max)
		DashFov = 14,            -- FOV surge on release (the "dash" feeling)
		Vignette = 0.35,         -- orange glow around the screen edges (0 = off, 1 = solid)
		Blur = 5,
		Recoil = 0.8,            -- camera kick strength
	},

	-- screen feedback for players near the impact
	Shake = { MaxDistance = 70, Strength = 1.4, Duration = 0.45 },
	Flash = { MaxDistance = 45, FovPunch = 6 },

	-- sounds: { id, volume, playbackSpeed }. Put several in a list to layer them.
	Sounds = {
		Cast = { { "rbxassetid://9114444052", 0.9, 1.1 } },            -- Fire Whoosh 5 (ProSoundEffects)
		Flight = { { "rbxassetid://113831670560719", 0.8, 1 } },        -- FireballSwoosh
		Impact = {
			{ "rbxassetid://130565967505452", 1.2, 1 },                  -- FireballExplosion
			{ "rbxassetid://139900006476219", 0.7, 1.05 },               -- Large fire explosion 3 (low boom layer)
		},
	},

	-- cast animation (procedural, no animation upload needed). Angles in degrees.
	Animation = {
		ThrowTime = 0.08,   -- snap from wind-up into the throw
		HoldTime = 0.18,    -- hold the throw pose
		ReturnTime = 0.3,   -- ease back to normal
	},
}
