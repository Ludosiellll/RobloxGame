--!strict
-- Кит Folk Stud UI из навыка Дениса (assets/imported/folk-stud-ui.skill, scripts/FolkStudUI.lua).
-- Одно изменение: рельса может уменьшаться до 0.3 (было 0.6), иначе 7 кнопок не влезают на телефон.
-- Строит окна в PlayerGui во время игры; Menus.luau наполняет их данными игры.
--[[ FolkStudUI (ModuleScript): white stud menus for Roblox.
	M.shop, M.quests, M.backpack, M.index, M.settings, M.rebirth and M.hud, each (parent, cfg), build a ScreenGui. Call them from Studio in Edit mode so the GUI is editable in StarterGui,
	or at runtime. Nothing at runtime depends on rebuilding: M.live(gui, handlers) finds everything by attribute.

	M.live(gui, { close = fn, buy = fn(offerId), gift = fn(offerId), rebirth = fn, skip = fn })
	M.hudLive(hud, { FolkShop = shopGui, FolkRebirth = rebirthGui }) makes the left rail open and close those screens
	M.show(gui, on), M.pop(gui), M.setBar(gui, frac, secs)

	Art values are an image id string, or { id = "rbxassetid://...", rot = 40, scale = 1.2 } for art that needs turning, such as long swords. ]]
local M = {}
local TS = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")
local RunService, GuiService = game:GetService("RunService"), game:GetService("GuiService")
local hex, WHITE, BLACK = Color3.fromHex, Color3.new(1, 1, 1), Color3.new(0, 0, 0)

local STUD = "rbxassetid://3014551673"   -- public decal 3014551680, 2 x 2 studs per image
local FONT = Font.new("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.Heavy)
local TEXT_STROKE, TEXT_JOIN = 3.7, Enum.LineJoinMode.Bevel   -- Round closes the holes in letters like O, Miter throws spikes off corners
local ROBUX = utf8.char(0xE002)

-- the shop, rebirth and rays icons are the style's own; the rest are placeholders to replace with the game's art
M.ART = { star = "rbxassetid://140461427372196", gift = "rbxassetid://103475352761553", sword = { id = "rbxassetid://124012017159848" }, arrow = "rbxassetid://133041450497410",
	shop = "rbxassetid://79989192301898", rebirth = "rbxassetid://15254183826", rays = "rbxassetid://101267161684975", quest = "rbxassetid://135835336296696" }
-- burning colours only: never pale, pastel or greyed. Dark shades are for lips and outlines.
M.COLOR = {
	lime = { hex("8CFF00"), hex("12E600"), hex("00A81A") }, purple = { hex("CC00FF"), hex("8A00F0"), hex("5E00B0") }, red = { hex("FF1F2A"), hex("D8000F"), hex("9E0008") },
	blue = { hex("00BFFF"), hex("0062FF"), hex("003BB3") }, crimson = { hex("FF2A1A"), hex("E00012"), hex("8F0010") }, gold = { hex("FFE600"), hex("FF8A00"), hex("B85A00") },
	hudShop = { hex("FFC800"), hex("FF8A00"), hex("A3530C") }, hudPurple = { hex("C830FF"), hex("9312E4"), hex("5E00B0") }, hudBlue = { hex("2FD0FF"), hex("0A9CF0"), hex("0564AF") },
	amber = { hex("FFD500"), hex("FF9A00"), hex("B86A00") }, green = { hex("A8FF00"), hex("2BE000"), hex("129E00") }, pink = { hex("FF2BD6"), hex("A800FF"), hex("6A00B8") }, orange = { hex("FFA200"), hex("D96A00"), hex("8F4600") },
}
M.RARITY = { Rare = hex("0A6CFF"), Epic = hex("CC00FF"), Legendary = hex("FFC400"), Mythic = hex("FF0A3C"), Divine = hex("00F0FF") }
local WARN = hex("FF1F2A")

local function new(c, p, parent)
	local o = Instance.new(c)
	if o:IsA("GuiObject") then o.BorderSizePixel = 0 end
	for k, v in pairs(p) do o[k] = v end
	o.Parent = parent
	return o
end
local function round(o, r) new("UICorner", { CornerRadius = UDim.new(0, r) }, o); return o end
local function ink(o, t, col) return new("UIStroke", { Name = "Outline", Thickness = t or 4, Color = col or BLACK, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }, o) end
local function grad(o, a, b, rot) o.BackgroundColor3 = WHITE; return new("UIGradient", { Rotation = rot or 90, Color = typeof(a) == "ColorSequence" and a or ColorSequence.new(a, b) }, o) end
local function rect(parent, name, x, y, w, h, r, z, col)
	local f = new("Frame", { Name = name, Position = UDim2.fromOffset(x, y), Size = UDim2.fromOffset(w, h), ZIndex = z or 2, BackgroundColor3 = col or WHITE }, parent)
	return r and round(f, r) or f
end
local function studs(parent, tile, tr, r, z)
	local s = new("ImageLabel", { Name = "Studs", BackgroundTransparency = 1, Image = STUD, ScaleType = Enum.ScaleType.Tile, TileSize = UDim2.fromOffset(tile.X, tile.Y),
		ImageTransparency = tr, Size = UDim2.fromScale(1, 1), ZIndex = z or parent.ZIndex }, parent)
	return r and round(s, r) or s
end
-- every text label gets the same UIStroke. Labels hug their text, so they stay centred and easy to select in Studio
local function text(parent, name, str, cx, cy, size, z, col, align, rot)
	local a = align == "left" and 0 or (align == "right" and 1 or 0.5)
	local l = new("TextLabel", { Name = name, BackgroundTransparency = 1, FontFace = FONT, Text = str, TextSize = size, TextColor3 = col or WHITE, ZIndex = z or 5, Rotation = rot or 0,
		AnchorPoint = Vector2.new(a, 0.5), Position = UDim2.fromOffset(cx, cy), Size = UDim2.fromOffset(0, size * 1.3), AutomaticSize = Enum.AutomaticSize.X }, parent)
	new("UIStroke", { Name = "UIStroke", Thickness = TEXT_STROKE, Color = BLACK, LineJoinMode = TEXT_JOIN }, l)
	-- large text gets a hard drop shadow underneath; M.live keeps it in step if the text changes
	if size >= 30 then
		local d = l:Clone(); d.Name = name .. "Drop"; d.Position = UDim2.fromOffset(cx, cy + 4); d.TextColor3 = BLACK; d.Parent = parent
		l.Parent = nil; l.Parent = parent
	end
	return l
end
local function art(parent, name, a, cx, cy, size, z, tr)
	if a == nil then return nil end
	local id, rot, k = a, 0, 1
	if type(a) == "table" then id, rot, k = a.id, a.rot or 0, a.scale or 1 end
	return new("ImageLabel", { Name = name, BackgroundTransparency = 1, Image = id, ScaleType = Enum.ScaleType.Fit, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromOffset(cx, cy),
		Size = UDim2.fromOffset(size * k, size * k), ZIndex = z or 5, ImageTransparency = tr or 0, Rotation = rot }, parent)
end
local function shadow(parent, name, x, y, w, h, r, z)
	local f = rect(parent, name .. "Shadow", x, y + 6, w, h, r, z, BLACK); f.BackgroundTransparency = 0.55
	return f
end
-- art with a black outline and a drop shadow: black copies underneath, in a holder that can float
local function sticker(parent, name, a, cx, cy, size, z, float)
	if a == nil then return nil end
	local h = new("Frame", { Name = name, BackgroundTransparency = 1, Position = UDim2.fromOffset(cx, cy), Size = UDim2.fromOffset(0, 0), ZIndex = z }, parent)
	for _, d in ipairs({ { 0, 7, 0.5 }, { -3, 0 }, { 3, 0 }, { 0, -3 }, { 0, 3 } }) do
		art(h, "Ink", a, d[1], d[2], size, z, d[3]).ImageColor3 = BLACK
	end
	art(h, "Art", a, 0, 0, size, z)
	if float then h:SetAttribute("Float", cy) end
	return h
end
local function rays(parent, cx, cy, size, z, col)
	local r = art(parent, "Rays", M.ART.rays, cx, cy, size, z, 0.1)
	r.ImageColor3 = col or WHITE; r:SetAttribute("Spin", true)
	return r
end
-- centre anchored with its own scale, for the cascade on open and hover; its children's coordinates do not change
local function lift(f)
	f.AnchorPoint = Vector2.new(0.5, 0.5); f.Position = f.Position + UDim2.fromOffset(f.Size.X.Offset / 2, f.Size.Y.Offset / 2)
	new("UIScale", { Name = "Lift" }, f); f:SetAttribute("Reveal", true)
	return f
end
-- pressable: outline, lip, gradient face, studs. Centre anchored, so hover and press scale from its middle. x, y, w, h are the button without its outline
local function button(parent, name, x, y, w, h, r, pal, z, o)
	o = o or {}
	local b = new("TextButton", { Name = name, Text = "", AutoButtonColor = false, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromOffset(x + w / 2, y + h / 2), Size = UDim2.fromOffset(w, h), BackgroundColor3 = pal[3], ZIndex = z or 4 }, parent)
	round(b, r); ink(b, 4)
	local face = new("Frame", { Name = "Face", Size = UDim2.new(1, 0, 1, -(o.lip or 4)), ZIndex = b.ZIndex }, b)
	round(face, r - 1); grad(face, pal[1], pal[2])
	if not o.plain then studs(face, Vector2.new(48, 48), o.studs or 0.55, r - 1) end
	new("UIScale", { Name = "Pop" }, b)
	b:SetAttribute("Pressable", true)
	if o.action then b:SetAttribute("Action", o.action) end
	if o.offer then b:SetAttribute("Offer", o.offer) end
	return b
end
local function price(parent, x, y, w, h, offer, cfg, z)
	local gift = button(parent, "Gift", x, y, h, h, 12, M.COLOR.purple, z, { action = "gift", offer = offer.id })
	art(gift, "Icon", cfg.giftIcon or M.ART.gift, h / 2, (h - 4) / 2, h - 12, gift.ZIndex + 1)
	local bw = w - h - 10
	local b = button(parent, "Buy", x + h + 10, y, bw, h, 12, M.COLOR.lime, z, { action = "buy", offer = offer.id })
	text(b, "Price", ROBUX .. " " .. offer.price, bw / 2, offer.sub and (h / 2 - 8) or (h / 2 - 2), math.floor(h * (offer.sub and 0.42 or 0.52)), b.ZIndex + 1)
	if offer.sub then text(b, "Sub", offer.sub, bw / 2, h - 11, 14, b.ZIndex + 2) end
end
local function closeButton(parent, x, y)
	-- no studs on the X
	local c = button(parent, "Close", x, y, 66, 70, 12, M.COLOR.red, 9, { plain = true, action = "close" })
	text(c, "X", "X", 33, 32, 56, 10)
	return c
end
local function screen(parent, name, w, h, pivot, kind)
	local gui = new("ScreenGui", { Name = name, ResetOnSpawn = false, IgnoreGuiInset = true, DisplayOrder = 40, ZIndexBehavior = Enum.ZIndexBehavior.Sibling }, parent)
	gui:SetAttribute("FolkStud", kind); gui:SetAttribute("NeedW", pivot and 860 or w + 64); gui:SetAttribute("NeedH", h + (pivot and 21 or 90))
	local root = new("Frame", { Name = "Root", BackgroundTransparency = 1, AnchorPoint = pivot or Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(w, h) }, gui)
	new("UIScale", { Name = "Fit" }, root)   -- separate scales: a screen size change during the pop cannot leave a wrong size
	local s = new("Frame", { Name = "Stage", BackgroundTransparency = 1, AnchorPoint = pivot or Vector2.new(0.5, 0.5), Position = UDim2.fromScale(pivot and pivot.X or 0.5, pivot and pivot.Y or 0.5), Size = UDim2.fromScale(1, 1) }, root)
	new("UIScale", { Name = "Pop" }, s)
	return gui, s
end

------------------------------------------------------------------ shop
local W, H, TABW = 880, 620, 164
local function featured(c, y, w, d, cfg)
	local h = 372
	shadow(c, "Featured", 0, y, w, h, 14, 1)
	local b = rect(c, "SecFeatured", 0, y, w, h, 14, 2)
	grad(b, hex("3A0080"), hex("C4006A"))
	local st = ink(b, 4, WHITE)
	new("UIGradient", { Color = ColorSequence.new({ ColorSequenceKeypoint.new(0, hex("FF9F00")), ColorSequenceKeypoint.new(0.5, hex("FF2BD6")), ColorSequenceKeypoint.new(1, hex("00BFFF")) }) }, st):SetAttribute("Turn", true)
	-- a picture background has no studs; the gradient alone does
	if d.background then round(new("ImageLabel", { Name = "Background", BackgroundTransparency = 1, Image = d.background, ScaleType = Enum.ScaleType.Crop, Size = UDim2.fromScale(1, 1), ZIndex = 2 }, b), 14)
	else studs(b, Vector2.new(48, 48), 0.78, 14, 2) end
	if d.tag then text(b, "Tag", d.tag, 62, 40, 25, 5, hex("FFE600"), nil, -10):SetAttribute("Wiggle", -10) end
	local title = text(b, "Title", d.title, w / 2, 38, 44, 5)
	new("UIGradient", { Rotation = 90, Color = ColorSequence.new(hex("FFE600"), hex("FF8A00")) }, title)
	if d.timer then
		local t = rect(b, "Timer", w - 142, 14, 128, 52, 12, 4); grad(t, hex("FF1F2A"), hex("C8000F")); ink(t, 3); studs(t, Vector2.new(48, 48), 0.7, 12, 4)
		text(t, "Line1", d.timer[1], 64, 16, 16, 5); text(t, "Line2", d.timer[2], 64, 36, 18, 5)
		lift(t):SetAttribute("Beat", true)
	end
	rays(b, 103, 167, 230, 3, hex("FFE600"))
	sticker(b, "Hero", d.hero, 103, 167, 160, 4, true)
	for i, o in ipairs(d.odds or {}) do
		local cw, x, col = 118, 200 + (i - 1) * 123, o.color or M.RARITY[o.rarity] or M.RARITY.Rare
		local top = 110 - i * 4
		lift(shadow(b, "Odds" .. i, x, top, cw, 244 - top, 12, 3))
		local card = rect(b, "Odds" .. i, x, top, cw, 244 - top, 12, 3); ink(card, 3)   -- black: a rarity coloured outline vanishes against the face
		grad(card, col:Lerp(BLACK, 0.2), col); studs(card, Vector2.new(48, 48), 0.72, 12, 3); lift(card)
		if i >= #d.odds - 1 then rays(card, cw / 2, 58, 130, 3) end
		sticker(card, "Item", o.art or M.ART.sword, cw / 2, 58, 118 + i * 6, 4)
		text(card, "Rarity", string.upper(o.rarity), cw / 2, 244 - top - 16, #o.rarity > 7 and 15 or 18, 5, col)
		text(card, "Chance", o.chance, cw - 4, 2, 24, 6, WHITE, "right", 8)
	end
	if d.goal then
		local goal = rect(b, "Goal", 16, 254, w - 32, 36, 18, 3, hex("140A24")); ink(goal, 2.5); goal.BackgroundTransparency = 0.2
		text(goal, "Text", d.goal[1], 20, 18, 19, 4, WHITE, "left")
		text(goal, "Count", d.goal[2], w - 54, 18, 19, 4, hex("00E5FF"), "right")
	end
	for i, o in ipairs(d.deals or {}) do
		local x = 16 + (i - 1) * 201
		if o.best then local best = rect(b, "BestValue", x - 6, 298, 198, 66, 14, 3); best.BackgroundTransparency = 1; ink(best, 4, hex("FFE600")); best:SetAttribute("Glint", true) end
		price(b, x, 302, 186, 58, o, cfg, 4)
		if o.off then text(b, "Off" .. i, o.off, x + 170, 299, 15, 7, WARN, nil, 6):SetAttribute("Wiggle", 6) end
	end
	return y + h + 14
end
local function heading(c, name, str, y, w)
	text(c, name, str, w / 2, y + 20, 34, 3)
	rect(c, name .. "Line", 0, y + 44, w, 3, 2, 2, hex("D6D6D6"))
	return y + 60
end
local function crates(c, y, list, cfg)
	local cw, gap, h = 268, 12, 392
	for i, d in ipairs(list) do
		local pal = d.color or M.COLOR.blue
		local x = (i - 1) * (cw + gap)
		lift(shadow(c, "Crate" .. i, x, y, cw, h, 16, 1))
		local f = rect(c, "Crate" .. i, x, y, cw, h, 16, 2, pal[3]); ink(f, 4); lift(f)
		local face = rect(f, "Face", 0, 0, cw, h - 6, 15, 2); grad(face, pal[1], pal[2]); studs(face, Vector2.new(48, 48), 0.72, 15)
		text(f, "Rank", d.rank, cw / 2, 28, 28, 5, pal[1])
		text(f, "Name", d.name, cw / 2, 62, 27, 5)
		rays(f, cw / 2, 150, 250, 3, pal[1]:Lerp(WHITE, 0.4))
		sticker(f, "Item", d.art, cw / 2, 158, 180, 4, true)   -- overlaps the strip below on purpose
		local band = rect(f, "Contents", 0, 238, cw, 72, nil, 3, BLACK); band.BackgroundTransparency = 0.6; band.ClipsDescendants = true
		for k, p in ipairs(d.contents or {}) do
			local px = -16 + (k - 1) * 73
			sticker(band, "Item" .. k, p.art or M.ART.sword, px, 24, 72, 4)
			text(band, "Odds" .. k, p.chance, px, 58, 15, 5)
		end
		price(f, 14, 320, cw - 28, 54, d, cfg, 4)
	end
	return y + h + 14
end
local function bundle(c, y, w, d, cfg)
	local h = 250
	shadow(c, "Bundle", 0, y, w, h, 16, 1)
	local f = rect(c, "Bundle", 0, y, w, h, 16, 2, hex("6A00B8")); ink(f, 4)
	local RAINBOW = ColorSequence.new({ ColorSequenceKeypoint.new(0, hex("7CFF00")), ColorSequenceKeypoint.new(0.3, hex("FF9F00")), ColorSequenceKeypoint.new(0.55, hex("FF0A3C")), ColorSequenceKeypoint.new(0.8, hex("D400FF")), ColorSequenceKeypoint.new(1, hex("2B5CFF")) })
	local face = rect(f, "Face", 0, 0, w, h - 8, 15, 2); grad(face, RAINBOW, nil, 0):SetAttribute("Slide", true); studs(face, Vector2.new(48, 48), 0.78, 15)
	local title = text(f, "Title", d.title, 18, 32, 34, 5, WHITE, "left")
	new("UIGradient", { Color = ColorSequence.new({ ColorSequenceKeypoint.new(0, hex("A8FF00")), ColorSequenceKeypoint.new(0.5, hex("FF2BD6")), ColorSequenceKeypoint.new(1, hex("00A2FF")) }) }, title)
	if d.limited then text(f, "Limited", d.limited, w - 16, 2, 25, 7, hex("FFC800"), "right"):SetAttribute("Wiggle", 0) end
	for i, l in ipairs(d.lines or {}) do text(f, "Line" .. i, l[1], 18, 42 + i * 33, 21, 5, l[2] or WHITE, "left") end
	for i, a in ipairs(d.show or {}) do sticker(f, "Show" .. i, a, 370 + i * 130, 118, 130, 4, true) end
	if d.old then
		text(f, "OldPrice", ROBUX .. " " .. d.old, 120, 176, 20, 7, WARN)
		rect(f, "Strike", 86, 175, 68, 3, 1, 8, WARN)
	end
	price(f, 18, 184, 250, 48, d, cfg, 4)
	return y + h + 14
end
local function passes(c, y, list, cfg)
	local cw, gap, h = 408, 12, 226
	for i, d in ipairs(list) do
		local pal = d.color or M.COLOR.amber
		local x = (i - 1) * (cw + gap)
		lift(shadow(c, "Pass" .. i, x, y, cw, h, 16, 1))
		local f = rect(c, "Pass" .. i, x, y, cw, h, 16, 2, pal[3]); ink(f, 4); lift(f)
		local face = rect(f, "Face", 0, 0, cw, h - 6, 15, 2); grad(face, pal[1], pal[2]); studs(face, Vector2.new(48, 48), 0.72, 15)
		rays(f, 84, 92, 190, 3, pal[1]:Lerp(WHITE, 0.4))
		sticker(f, "Icon", d.art, 84, 92, 140, 4, true)
		text(f, "Title", d.title, 262, 34, 34, 5)
		local desc = text(f, "Desc", d.desc, 262, 92, 21, 5); desc.Size = UDim2.fromOffset(0, 58)
		if d.tag then text(f, "Tag", d.tag, cw - 12, 24, 24, 6, WARN, "right", 6):SetAttribute("Wiggle", 6) end
		price(f, 166, 146, 228, 56, d, cfg, 4)
	end
	return y + h + 10
end

-- the window every scrolling screen shares
local function shell(parent, cfg, defaultName, kind, defaultTitle, defaultIcon)
	local gui, s = screen(parent, cfg.name or defaultName, W + TABW, H, nil, kind)
	shadow(s, "Window", -2, 4, W + 4, H + 4, 16, 1)
	local win = rect(s, "Window", 0, 0, W, H, 14, 1); ink(win, 4)
	studs(win, Vector2.new(50, 46), 0.8, 12, 1)
	sticker(s, "Icon", cfg.icon or defaultIcon, 18, -3, 84, 8)
	text(s, "Title", cfg.title or defaultTitle, 66, -2, 50, 8, WHITE, "left")   -- letters centred on the border line, which is 2 above the frame's top
	closeButton(s, W - 42, -26)
	local scroll = new("ScrollingFrame", { Name = "Scroll", BackgroundTransparency = 1, Position = UDim2.fromOffset(12, 34), Size = UDim2.fromOffset(W - 24, H - 46), ScrollBarThickness = 6, ScrollBarImageColor3 = hex("9A9A9A"),
		BottomImage = "", TopImage = "", ZIndex = 2, ScrollingDirection = Enum.ScrollingDirection.Y, CanvasSize = UDim2.new() }, win)
	local cw = W - 24 - 18
	local c = new("Frame", { Name = "Content", BackgroundTransparency = 1, Position = UDim2.fromOffset(4, 6), Size = UDim2.fromOffset(cw, 10), ZIndex = 2 }, scroll)
	return gui, s, c, cw, scroll
end
local function sideTabs(s, tabs, cfg)
	for i, t in ipairs(tabs) do
		shadow(s, "Tab" .. t[1], W + 16, 40 + (i - 1) * 82, 142, 68, 14, 2)
		local b = button(s, "Tab" .. t[1], W + 16, 40 + (i - 1) * 82, 142, 68, 14, t[4], 3)
		b:SetAttribute("Jump", t[2])
		sticker(b, "Icon", cfg.tabIcons and cfg.tabIcons[t[1]] or t[3], 71, 28, 66, b.ZIndex + 1)
		text(b, "Label", t[1], 71, 32, 24, b.ZIndex + 2)
	end
end

function M.shop(parent, cfg)
	local gui, s, c, cw, scroll = shell(parent, cfg, "FolkShop", "shop", "Shop", M.ART.star)
	local y, tabs = 0, {}
	if cfg.featured then y = featured(c, y, cw, cfg.featured, cfg); table.insert(tabs, { "Featured", "SecFeatured", cfg.featured.hero, M.COLOR.green }) end
	if cfg.crates then y = heading(c, "SecCrates", "CRATES", y, cw); y = crates(c, y, cfg.crates, cfg); table.insert(tabs, { "Crates", "SecCrates", cfg.crates[1] and cfg.crates[1].art, M.COLOR.blue }) end
	if cfg.bundle then y = heading(c, "SecBundles", "BUNDLES", y, cw); y = bundle(c, y, cw, cfg.bundle, cfg); table.insert(tabs, { "Bundles", "SecBundles", cfg.bundle.show and cfg.bundle.show[1], M.COLOR.pink }) end
	if cfg.passes then y = heading(c, "SecPasses", "PASSES", y, cw); y = passes(c, y, cfg.passes, cfg); table.insert(tabs, { "Passes", "SecPasses", cfg.passes[1] and cfg.passes[1].art, M.COLOR.orange }) end
	c.Size = UDim2.fromOffset(cw, y); scroll.CanvasSize = UDim2.fromOffset(0, y + 12)
	sideTabs(s, tabs, cfg)
	return gui
end

------------------------------------------------------------------ quests. Sections scroll like the shop; a row shows Go, Claim or Done from its progress
local function setRow(f, have, need, state, secs)
	state = state or (have >= need and "ready" or "go")
	local frac = math.clamp(have / math.max(need, 1), 0, 1)
	local track = f.Track
	track.Fill.Visible = frac > 0
	local size = UDim2.fromOffset(math.max(28, frac * track.Size.X.Offset), 28)
	if secs then TS:Create(track.Fill, TweenInfo.new(secs, Enum.EasingStyle.Quad), { Size = size }):Play() else track.Fill.Size = size end
	f.Count.Text = have .. "/" .. need
	f.Claim.Visible = state == "ready"; f.Go.Visible = state == "go"; f.Done.Visible = state == "done"
	f.Rays.Visible = state == "ready" or f:GetAttribute("Hero") == true
	f:SetAttribute("Glint", state == "ready")
end
local function questRow(c, y, w, q)
	local h, pal = 118, q.color or M.COLOR.blue
	lift(shadow(c, "Quest" .. q.id, 0, y, w, h, 16, 1))
	local f = rect(c, "Quest" .. q.id, 0, y, w, h, 16, 2, pal[3]); ink(f, 4); lift(f)
	f:SetAttribute("NoHover", true); f:SetAttribute("Hero", q.hero == true)
	local face = rect(f, "Face", 0, 0, w, h - 6, 15, 2); grad(face, pal[1], pal[2]); studs(face, Vector2.new(48, 48), 0.72, 15)
	rays(f, 62, 54, 130, 3)
	sticker(f, "Icon", q.icon or M.ART.star, 62, 54, 88, 4, true)
	text(f, "Title", q.title, 122, 26, 28, 5, WHITE, "left")
	text(f, "Desc", q.desc, 122, 52, 18, 5, WHITE, "left")
	local track = rect(f, "Track", 122, 72, 420, 28, 14, 3, WHITE); ink(track, 3)
	grad(rect(track, "Fill", 0, 0, 28, 28, 14, 3), M.COLOR.lime[1], M.COLOR.lime[2])
	text(f, "Count", "", 332, 86, 18, 5)
	sticker(f, "RewardIcon", q.rewardIcon or M.ART.star, 596, 38, 52, 4)
	text(f, "Reward", q.reward, 596, 82, 22, 5, hex("FFE600"))
	text(button(f, "Claim", 668, 24, 150, 64, 14, M.COLOR.lime, 4, { action = "claim", offer = q.id }), "Label", "CLAIM", 75, 28, 28, 5)
	text(button(f, "Go", 668, 24, 150, 64, 14, M.COLOR.blue, 4, { action = "go", offer = q.id }), "Label", "GO", 75, 28, 28, 5)
	local done = rect(f, "Done", 668, 24, 150, 60, 14, 3); grad(done, M.COLOR.lime[1], M.COLOR.lime[2]); ink(done, 4)
	text(done, "Label", "DONE!", 75, 30, 28, 4)
	setRow(f, q.have or 0, q.need or 1, q.state)
	return y + h + 12
end
function M.quests(parent, cfg)
	local gui, s, c, cw = shell(parent, cfg, "FolkQuests", "quests", "Quests", M.ART.quest)
	local y, tabs = 0, {}
	for _, sec in ipairs(cfg.sections) do
		local id = "Sec" .. sec.name
		local top = y
		y = heading(c, id, string.upper(sec.name), y, cw)
		if sec.timer then
			local t = rect(c, id .. "Timer", cw - 250, top + 2, 214, 36, 12, 4); grad(t, hex("FF1F2A"), hex("C8000F")); ink(t, 3); studs(t, Vector2.new(48, 48), 0.7, 12, 4)
			text(t, "Text", sec.timer, 107, 18, 18, 5)
			lift(t):SetAttribute("Beat", true)
		end
		for _, q in ipairs(sec.quests) do y = questRow(c, y, cw, q) end
		y += 6
		table.insert(tabs, { sec.name, id, sec.icon, sec.color or M.COLOR.green })
	end
	c.Size = UDim2.fromOffset(cw, y); s.Window.Scroll.CanvasSize = UDim2.fromOffset(0, y + 12)
	sideTabs(s, tabs, cfg)
	return gui
end
-- show new progress or a claim. Progress and rewards belong on the server: call this with what it sends back. Leave have and need nil to keep the counts
function M.setQuest(gui, id, have, need, state)
	local f = gui.Root.Stage.Window.Scroll.Content:FindFirstChild("Quest" .. id)
	if not f then return end
	have, need = have or tonumber(f.Count.Text:match("^%d+")), need or tonumber(f.Count.Text:match("%d+$"))
	setRow(f, have, need, state, 0.3)
	if state == "done" then f.Lift.Scale = 1.04; TS:Create(f.Lift, TweenInfo.new(0.4, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play() end
end

------------------------------------------------------------------ item screens: tiles scroll on the left, and the selected item's card stays on the right
local PANELW = 258
local function rarityPal(r)
	local c = M.COLOR
	return ({ Common = c.green, Rare = c.blue, Epic = c.hudPurple, Legendary = c.gold, Mythic = c.crimson, Divine = c.pink })[r] or c.blue
end
-- a locked item is a black silhouette called ???
local function setLocked(b, locked)
	b.Icon.Art.ImageColor3 = locked and BLACK or WHITE
	b.Label.Text = locked and "???" or b:GetAttribute("Title")
	b:SetAttribute("Locked", locked)
end
local function itemTile(c, x, y, size, it, section)
	local pal = rarityPal(it.rarity)
	lift(shadow(c, "Item" .. it.id, x, y, size, size, 14, 1))
	local h = lift(rect(c, "Item" .. it.id, x, y, size, size, 14, 2)); h.BackgroundTransparency = 1; h:SetAttribute("NoHover", true)
	local b = button(h, "Tile", 0, 0, size, size, 14, pal, 3, { action = "pick", offer = it.id, lip = 5, studs = 0.72 })
	sticker(b, "Icon", it.art, size / 2, math.floor(size * 0.45), math.floor(size * 0.69), b.ZIndex + 1)
	text(b, "Rarity", string.upper(it.rarity), 8, 14, size >= 120 and 14 or 12, b.ZIndex + 2, pal[1], "left")
	text(b, "Label", it.name, size / 2, size - 20, size >= 120 and 16 or 13, b.ZIndex + 2)
	local e = rect(b, "Equipped", size - 34, -8, 40, 26, 8, b.ZIndex + 3); grad(e, M.COLOR.lime[1], M.COLOR.lime[2]); ink(e, 3)
	text(e, "Text", "E", 20, 12, 18, b.ZIndex + 4)
	e.Visible = it.equipped == true
	local a = type(it.art) == "table" and it.art or { id = it.art }
	local stats = it.stats or {}
	for k, v in pairs({ ArtId = a.id, ArtRot = a.rot or 0, ArtScale = a.scale or 1, Title = it.name, Rarity = it.rarity, Desc = it.desc or "", Stat1 = stats[1] and stats[1][1] or "", Val1 = stats[1] and stats[1][2] or "",
		Stat2 = stats[2] and stats[2][1] or "", Val2 = stats[2] and stats[2][2] or "", UseLabel = it.use or "EQUIP", Section = section }) do b:SetAttribute(k, v) end
	return b
end
-- the selected item's card. It is read only apart from its button, so it does not grow on hover
local function itemCard(s, rewards)
	local px, py, pw, ph = W - PANELW - 12, 52, PANELW, 556
	shadow(s, "Panel", px, py, pw, ph, 16, 2)
	local f = rect(s, "Panel", px, py, pw, ph, 16, 3); ink(f, 4); lift(f); f:SetAttribute("NoHover", true)
	local face = rect(f, "Face", 0, 0, pw, ph - 6, 15, 3); grad(face, WHITE, WHITE); studs(face, Vector2.new(48, 48), 0.72, 15, 3)
	text(f, "Rarity", "", pw / 2, 28, 20, 5)
	text(f, "ItemName", "", pw / 2, 58, 28, 5)   -- not "Name": f.Name would find the property, not this label
	rays(f, pw / 2, 180, 270, 4)
	sticker(f, "Item", M.ART.star, pw / 2, 180, 170, 4, true)
	local d = text(f, "Desc", "", pw / 2, 312, 18, 5); d.AutomaticSize = Enum.AutomaticSize.None; d.Size = UDim2.fromOffset(pw - 28, 50); d.TextWrapped = true
	for i = 1, 2 do
		text(f, "Stat" .. i, "", 18, 352 + i * 34, 20, 5, WHITE, "left")
		text(f, "Val" .. i, "", pw - 18, 352 + i * 34, 22, 5, hex("FFE600"), "right")
	end
	if rewards then
		local r = rect(f, "Rewards", 14, 446, pw - 28, 88, 12, 4); grad(r, M.COLOR.lime[1], M.COLOR.lime[2]); ink(r, 4)
		text(r, "Title", "REWARD", (pw - 28) / 2, 18, 18, 5)
		sticker(r, "Item", M.ART.star, 66, 54, 52, 5)
		text(r, "Value", "", 150, 54, 26, 5, hex("FFE600"))
	else
		local use = button(f, "Use", 14, 462, pw - 28, 72, 14, M.COLOR.lime, 5, { action = "use" })
		text(use, "Label", "EQUIP", (pw - 28) / 2, 34, 34, 6)
		local done = rect(f, "Done", 14, 462, pw - 28, 68, 14, 4); grad(done, M.COLOR.lime[1], M.COLOR.lime[2]); ink(done, 4)
		text(done, "Label", "EQUIPPED", (pw - 28) / 2, 34, 32, 5)
	end
end
local function setArt(holder, id, rot, k, size)
	for _, o in ipairs(holder:GetChildren()) do
		o.Image = id; o.Rotation = rot; o.Size = UDim2.fromOffset(size * k, size * k)
	end
end
-- show an item in the card. Everything comes from attributes on its tile, so tiles edited in Studio keep working
function M.selectItem(gui, id, quiet)
	local stage = gui.Root.Stage
	local content, f = stage.Window.Scroll.Content, stage.Panel
	for _, h in ipairs(content:GetChildren()) do
		local t = h:FindFirstChild("Tile")
		if t then
			local yes = h.Name == "Item" .. id
			t.Outline.Color = yes and hex("FFE600") or BLACK; t.Outline.Thickness = yes and 6 or 4   -- gold: white would vanish against the sheet
		end
	end
	local holder = content:FindFirstChild("Item" .. id)
	if not holder then return end
	gui:SetAttribute("Selected", id)
	local t = holder.Tile
	local A = function(k) return t:GetAttribute(k) end
	local pal, locked = rarityPal(A("Rarity")), A("Locked") == true
	f.BackgroundColor3 = pal[3]; f.Face.UIGradient.Color = ColorSequence.new(pal[1], pal[2])
	f.Rarity.Text = string.upper(A("Rarity")); f.Rarity.TextColor3 = pal[1]
	f.ItemName.Text = locked and "???" or A("Title"); f.Desc.Text = A("Desc")
	for i = 1, 2 do f["Stat" .. i].Text = A("Stat" .. i); f["Val" .. i].Text = A("Val" .. i) end
	setArt(f.Item, A("ArtId"), A("ArtRot"), A("ArtScale"), 170)
	f.Item.Art.ImageColor3 = locked and BLACK or WHITE
	if f:FindFirstChild("Use") then
		f.Use:SetAttribute("Offer", id)
		f.Use.Label.Text = A("UseLabel"); f.Use.LabelDrop.Text = A("UseLabel")
		local on = t.Equipped.Visible
		f.Use.Visible = not on; f.Done.Visible = on
	end
	if f:FindFirstChild("Rewards") then
		setArt(f.Rewards.Item, A("RewardId") or "", 0, 1, 52)
		f.Rewards.Value.Text = A("RewardText") or ""
	end
	if not quiet then f.Lift.Scale = 1.04; TS:Create(f.Lift, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play() end
end

function M.backpack(parent, cfg)
	local gui, s, c, _, scroll = shell(parent, cfg, "FolkBackpack", "backpack", "Backpack", M.ART.star)
	local listW, gap = 572, 12
	local size = (listW - gap * 3) / 4
	scroll.Size = UDim2.fromOffset(590, H - 46)
	if cfg.slots then
		local p = rect(s, "Slots", 356, -20, 150, 38, 12, 8); grad(p, M.COLOR.blue[1], M.COLOR.blue[2]); ink(p, 3); studs(p, Vector2.new(48, 48), 0.7, 12, 8)
		text(p, "Text", cfg.slots, 75, 18, 20, 9)
	end
	local y, tabs, first = 0, {}, nil
	for _, sec in ipairs(cfg.sections) do
		local id = "Sec" .. sec.name
		y = heading(c, id, string.upper(sec.name), y, listW)
		for i, it in ipairs(sec.items) do
			itemTile(c, ((i - 1) % 4) * (size + gap), y + math.floor((i - 1) / 4) * (size + gap), size, it, sec.name)
			first = first or it.id
		end
		y += math.ceil(#sec.items / 4) * (size + gap) + 6
		table.insert(tabs, { sec.name, id, sec.icon, sec.color or M.COLOR.green })
	end
	c.Size = UDim2.fromOffset(listW, y); scroll.CanvasSize = UDim2.fromOffset(0, y + 12)
	sideTabs(s, tabs, cfg)
	itemCard(s)
	M.selectItem(gui, first, true)
	return gui
end
-- mark an item as the one worn in its section. Only for items whose button says EQUIP. Tell the server first, and call this with its answer
function M.equipItem(gui, id)
	local content = gui.Root.Stage.Window.Scroll.Content
	local holder = content:FindFirstChild("Item" .. id)
	if not holder or holder.Tile:GetAttribute("UseLabel") ~= "EQUIP" then return end
	for _, h in ipairs(content:GetChildren()) do
		local t = h:FindFirstChild("Tile")
		if t and t:GetAttribute("Section") == holder.Tile:GetAttribute("Section") then t.Equipped.Visible = h == holder end
	end
	M.selectItem(gui, id)
end

------------------------------------------------------------------ index. One block per world: a card, its tiles, and a bar to its reward
local function worldBar(content, section)
	local have, need = 0, 0
	for _, h in ipairs(content:GetChildren()) do
		local t = h:FindFirstChild("Tile")
		if t and t:GetAttribute("Section") == section then
			need += 1
			if not t:GetAttribute("Locked") then have += 1 end
		end
	end
	local bar = content["Sec" .. section .. "Bar"]
	bar.Fill.Visible = have > 0
	bar.Fill.Size = UDim2.fromOffset(math.max(36, have / math.max(need, 1) * bar.Size.X.Offset), 36)
	bar.Count.Text = have .. "/" .. need
end
function M.index(parent, cfg)
	local gui, s, c, _, scroll = shell(parent, cfg, "FolkIndex", "index", "Index", M.ART.star)
	local listW, size, gap, cardW = 572, 106, 8, 112
	scroll.Size = UDim2.fromOffset(590, H - 46 - 76)
	local y, tabs, first = 0, {}, nil
	for _, sec in ipairs(cfg.sections) do
		local id, pal = "Sec" .. sec.name, sec.color or M.COLOR.green
		rect(c, id, 0, y, listW, 1, nil, 1).BackgroundTransparency = 1
		local rows = math.ceil(#sec.items / 4)
		local gridH = rows * (size + gap) - gap
		shadow(c, id .. "Card", 0, y, cardW, gridH, 12, 1)
		local card = rect(c, id .. "Card", 0, y, cardW, gridH, 12, 2); ink(card, 4)
		if sec.background then round(new("ImageLabel", { Name = "Background", BackgroundTransparency = 1, Image = sec.background, ScaleType = Enum.ScaleType.Crop, Size = UDim2.fromScale(1, 1), ZIndex = 2 }, card), 12)
		else grad(card, pal[1], pal[2]); studs(card, Vector2.new(48, 48), 0.72, 12, 2); sticker(card, "Icon", sec.icon, cardW / 2, gridH / 2 + 10, 84, 3, true) end
		text(card, "Title", sec.name, cardW / 2, 22, 20, 5)
		for i, it in ipairs(sec.items) do
			local b = itemTile(c, cardW + 12 + ((i - 1) % 4) * (size + gap), y + math.floor((i - 1) / 4) * (size + gap), size, {
				id = it.id, name = it.name, rarity = it.rarity, art = it.art, desc = it.desc or ("Found in " .. sec.name), stats = it.stats }, sec.name)
			b:SetAttribute("RewardId", type(sec.rewardArt) == "table" and sec.rewardArt.id or sec.rewardArt or M.ART.star)
			b:SetAttribute("RewardText", sec.reward or "")
			setLocked(b, not it.found)
			first = first or it.id
		end
		y += gridH + 10
		local bar = rect(c, id .. "Bar", 0, y, listW - 30, 36, 18, 3); ink(bar, 3)
		grad(rect(bar, "Fill", 0, 0, 36, 36, 18, 3), M.COLOR.lime[1], M.COLOR.lime[2])
		text(bar, "Count", "", (listW - 30) / 2, 18, 20, 5)
		sticker(c, id .. "Reward", sec.rewardArt or M.ART.star, listW - 30, y + 14, 64, 4)
		y += 58
	end
	c.Size = UDim2.fromOffset(listW, y); scroll.CanvasSize = UDim2.fromOffset(0, y + 12)
	for _, sec in ipairs(cfg.sections) do
		worldBar(c, sec.name)
		table.insert(tabs, { sec.name, "Sec" .. sec.name, sec.icon, sec.color or M.COLOR.green })
	end
	sideTabs(s, tabs, cfg)
	local claim = button(s, "ClaimAll", 18, H - 72, 574, 58, 14, M.COLOR.lime, 5, { action = "claim" })
	sticker(claim, "Icon", cfg.claimIcon or cfg.icon or M.ART.star, 36, 24, 64, claim.ZIndex + 1)
	text(claim, "Label", cfg.claim or "CLAIM ALL!", 287, 27, 34, claim.ZIndex + 2)
	itemCard(s, true)
	M.selectItem(gui, first, true)
	return gui
end
-- reveal an item, or hide it again. What a player has found belongs in their saved data: call this with it
function M.setFound(gui, id, found)
	local content = gui.Root.Stage.Window.Scroll.Content
	local holder = content:FindFirstChild("Item" .. id)
	if not holder then return end
	setLocked(holder.Tile, not found)
	worldBar(content, holder.Tile:GetAttribute("Section"))
	if gui:GetAttribute("Selected") == id then M.selectItem(gui, id, true) end
end

------------------------------------------------------------------ settings. Rows are a toggle, a slider or a one press button
local function setToggle(f, on)
	f:SetAttribute("On", on == true)
	f.On.Visible = on == true; f.Off.Visible = on ~= true
end
local function setSlider(f, v)
	local mn, mx = f:GetAttribute("Min"), f:GetAttribute("Max")
	v = math.clamp(v, mn, mx)
	f:SetAttribute("Now", v)
	local track, frac = f.Track, (v - mn) / math.max(mx - mn, 1)
	track.Fill.Size = UDim2.fromOffset(math.max(30, frac * track.Size.X.Offset), 30)
	track.Knob.Position = UDim2.fromOffset(frac * track.Size.X.Offset, 15)
	f.Value.Text = tostring(v)
end
local function settingRow(c, y, w, r)
	local h, pal = 92, r.color or M.COLOR.blue
	lift(shadow(c, "Set" .. r.id, 0, y, w, h, 16, 1))
	local f = rect(c, "Set" .. r.id, 0, y, w, h, 16, 2, pal[3]); ink(f, 4); lift(f); f:SetAttribute("NoHover", true)
	local face = rect(f, "Face", 0, 0, w, h - 6, 15, 2); grad(face, pal[1], pal[2]); studs(face, Vector2.new(48, 48), 0.72, 15)
	sticker(f, "Icon", r.icon or M.ART.star, 50, 42, 68, 4)
	text(f, "Title", r.title, 100, 28, 26, 5, WHITE, "left")
	text(f, "Desc", r.desc or "", 100, 58, 18, 5, WHITE, "left")
	if r.kind == "slider" then
		f:SetAttribute("Slider", true); f:SetAttribute("Min", r.min or 0); f:SetAttribute("Max", r.max or 100)
		local track = new("TextButton", { Name = "Track", Text = "", AutoButtonColor = false, Position = UDim2.fromOffset(w - 420, 28), Size = UDim2.fromOffset(300, 30), BackgroundColor3 = WHITE, ZIndex = 4 }, f)
		round(track, 15); ink(track, 3)
		grad(rect(track, "Fill", 0, 0, 30, 30, 15, 4), M.COLOR.lime[1], M.COLOR.lime[2])
		local knob = rect(track, "Knob", 0, 0, 42, 42, 21, 5); knob.AnchorPoint = Vector2.new(0.5, 0.5); grad(knob, M.COLOR.gold[1], M.COLOR.gold[2]); ink(knob, 4)
		text(f, "Value", "", w - 50, 42, 26, 5, hex("FFE600"))
		setSlider(f, r.value or r.max or 100)
	elseif r.kind == "button" then
		text(button(f, "Press", w - 180, 14, 160, 60, 14, r.buttonColor or M.COLOR.purple, 4, { action = "press", offer = r.id }), "Label", r.label or "GO", 80, 28, 26, 5)
	else
		text(button(f, "On", w - 180, 14, 160, 60, 14, M.COLOR.lime, 4, { action = "toggle", offer = r.id }), "Label", "ON", 80, 28, 28, 5)
		text(button(f, "Off", w - 180, 14, 160, 60, 14, M.COLOR.red, 4, { action = "toggle", offer = r.id }), "Label", "OFF", 80, 28, 28, 5)
		setToggle(f, r.value)
	end
	return y + h + 12
end
function M.settings(parent, cfg)
	local gui, s, c, cw = shell(parent, cfg, "FolkSettings", "settings", "Settings", M.ART.star)
	local y, tabs = 0, {}
	for _, sec in ipairs(cfg.sections) do
		local id = "Sec" .. sec.name
		y = heading(c, id, string.upper(sec.name), y, cw)
		for _, r in ipairs(sec.rows) do y = settingRow(c, y, cw, r) end
		y += 6
		table.insert(tabs, { sec.name, id, sec.icon, sec.color or M.COLOR.green })
	end
	c.Size = UDim2.fromOffset(cw, y); s.Window.Scroll.CanvasSize = UDim2.fromOffset(0, y + 12)
	sideTabs(s, tabs, cfg)
	return gui
end
-- load a saved value into a row
function M.setSetting(gui, id, v)
	local f = gui.Root.Stage.Window.Scroll.Content:FindFirstChild("Set" .. id)
	if not f then return end
	if f:GetAttribute("Slider") then setSlider(f, v) else setToggle(f, v) end
end
-- runs the window, and calls on.change(id, value) and on.press(id). Saving the values is up to the game
function M.settingsLive(gui, on)
	on = on or {}
	local UIS = game:GetService("UserInputService")
	local scroll = gui.Root.Stage.Window.Scroll
	local changed = function(id, v) if on.change then on.change(id, v) end end
	M.live(gui, { press = on.press, toggle = function(id)
		local f = scroll.Content["Set" .. id]
		setToggle(f, not f:GetAttribute("On"))
		changed(id, f:GetAttribute("On"))
	end })
	for _, f in ipairs(scroll.Content:GetChildren()) do
		if f:GetAttribute("Slider") then
			local track, dragging = f.Track, false
			local press = function(i) return i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch end
			local function at(x)
				local mn, mx = f:GetAttribute("Min"), f:GetAttribute("Max")
				local v = math.round(mn + math.clamp((x - track.AbsolutePosition.X) / track.AbsoluteSize.X, 0, 1) * (mx - mn))
				if v ~= f:GetAttribute("Now") then setSlider(f, v); changed(f.Name:sub(4), v) end
			end
			track.InputBegan:Connect(function(i)
				if press(i) then dragging = true; scroll.ScrollingEnabled = false; at(i.Position.X) end
			end)
			UIS.InputChanged:Connect(function(i)
				if dragging and (i.UserInputType == Enum.UserInputType.MouseMovement or i.UserInputType == Enum.UserInputType.Touch) then at(i.Position.X) end
			end)
			UIS.InputEnded:Connect(function(i)
				if dragging and press(i) then dragging = false; scroll.ScrollingEnabled = true end
			end)
		end
	end
end

------------------------------------------------------------------ rebirth: coordinates are on a 907 x 619 canvas, and the pivot is the window's centre on it
function M.rebirth(parent, d)
	local P = Vector2.new(412 / 907, 304.5 / 619)
	local gui, s = screen(parent, d.name or "FolkRebirth", 907, 619, P, "rebirth")
	shadow(s, "Window", 18, 42, 788, 537, 16, 1)
	local win = rect(s, "Window", 20, 38, 784, 533, 14, 1); ink(win, 4)
	studs(win, Vector2.new(50, 46), 0.8, 12, 1)
	sticker(s, "Icon", d.icon or M.ART.star, 37, 36, 72, 6)
	text(s, "Title", d.title or "Rebirth", 78, 36, 50, 6, WHITE, "left")
	closeButton(s, 760, 17)
	text(s, "From", d.from, 212, 131, 36); text(s, "To", d.to, 611.5, 131, 36)
	for _, p in ipairs({ { "PlateFrom", 78, d.gainFrom }, { "PlateTo", 477, d.gainTo } }) do
		local f = rect(s, p[1], p[2], 170, 268, 87, 12, 2); ink(f, 5); grad(f, M.COLOR.lime[1], M.COLOR.lime[2]); f.ClipsDescendants = true
		if d.gainIcon then art(f, "Watermark", d.gainIcon, 134, 43, 160, 2, 0.4).ImageColor3 = hex("4FAE3C") end
		text(f, "Value", p[3], 134, 43, 51.5, 3)
	end
	art(s, "Arrow", M.ART.arrow, 412, 214, 88, 3)
	text(s, "Warn", d.warn, 412, 308, 40, 5, WARN)
	local bar = rect(s, "Bar", 100, 355, 625, 63, 8, 2, hex("B5B5B5")); ink(bar, 4)
	bar:SetAttribute("BarWidth", 625)
	local edge = rect(bar, "FillEdge", 0, 0, 9, 63, 5, 2, BLACK)
	local fill = rect(bar, "Fill", 0, 0, 5, 63, 4, 3); grad(fill, hex("00C8FF"), hex("0088FF"))
	text(s, "BarText", d.barText, 412, 386, 41, 5)
	sticker(s, "BarIcon", d.barIcon or M.ART.star, 706, 385, 92, 6)
	local r = button(s, "Rebirth", 177, 449, 238, 81, 16, M.COLOR.lime, 3, { action = "rebirth" })
	text(r, "Label", "Rebirth", 119, 38.5, 53, 5)
	if d.skip then
		local k = button(s, "Skip", 437, 453, 215, 73, 16, M.COLOR.purple, 3, { action = "skip" })
		text(k, "Label", d.skip, 107, 37, 35, 5)
		if d.skipSub then text(k, "Sub", d.skipSub, 107, 71, 23, 6) end
		local g = button(s, "Gift", 674, 453, 71, 73, 16, M.COLOR.purple, 3, { action = "gift" })
		art(g, "Icon", d.giftIcon or M.ART.gift, 35, 34, 62, 5)
	end
	M.setBar(gui, d.barFrac or 0)
	return gui
end

------------------------------------------------------------------ left rail. A square holds its icon, with its word underneath and inside the square
function M.hud(parent, cfg)
	local list, TILE, STEP = cfg.buttons, 112, 124
	local gui = new("ScreenGui", { Name = cfg.name or "FolkHud", ResetOnSpawn = false, DisplayOrder = 10, ZIndexBehavior = Enum.ZIndexBehavior.Sibling }, parent)
	gui:SetAttribute("FolkStud", "hud"); gui:SetAttribute("FitHeight", 1080)
	local root = new("Frame", { Name = "Root", BackgroundTransparency = 1, AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, 22, 0.5, 0), Size = UDim2.fromOffset(TILE, #list * STEP) }, gui)
	new("UIScale", { Name = "Fit" }, root)
	local s = new("Frame", { Name = "Stage", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) }, root)
	new("UIScale", { Name = "Pop" }, s)
	for i, d in ipairs(list) do
		shadow(s, "Tile" .. d.label, 0, (i - 1) * STEP, TILE, 110, 16, 2)
		local b = button(s, "Tile" .. d.label, 0, (i - 1) * STEP, TILE, 110, 16, d.color or M.COLOR.hudBlue, 3, { action = "open", offer = d.opens, lip = 6, studs = 0.72 })
		art(b, "Icon", d.icon, TILE / 2, 40, 86, b.ZIndex + 1)
		text(b, "Label", d.label, TILE / 2, 85, 21, b.ZIndex + 2)   -- one size and height on every square, so the rail reads as a set
		if d.tag then
			local t = rect(b, "Tag", TILE - 46, -12, 58, 26, 8, b.ZIndex + 3, hex("FF1F2A")); ink(t, 3); t:SetAttribute("Wiggle", 0)
			text(t, "Text", d.tag, 29, 12, 15, b.ZIndex + 4)
		end
	end
	return gui
end

function M.setBar(gui, frac, secs)
	local bar = gui.Root.Stage:FindFirstChild("Bar")
	if not bar then return end
	local w = math.max(5, math.floor(math.clamp(frac, 0, 1) * bar:GetAttribute("BarWidth") + 0.5))
	local a, b = UDim2.new(0, w, 1, 0), UDim2.new(0, w + 4, 1, 0)
	if secs then
		TS:Create(bar.Fill, TweenInfo.new(secs, Enum.EasingStyle.Quad), { Size = a }):Play()
		TS:Create(bar.FillEdge, TweenInfo.new(secs, Enum.EasingStyle.Quad), { Size = b }):Play()
	else bar.Fill.Size = a; bar.FillEdge.Size = b end
end

------------------------------------------------------------------ runtime
local BACK = TweenInfo.new(0.2, Enum.EasingStyle.Back, Enum.EasingDirection.Out)
local QUICK = TweenInfo.new(0.07, Enum.EasingStyle.Quad)
function M.pop(gui)
	local p = gui.Root.Stage.Pop
	p.Scale = 0.8
	TS:Create(p, TweenInfo.new(0.32, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	-- the cards then pop in one after another
	local n = 0
	for _, o in ipairs(gui:GetDescendants()) do
		local l = o:GetAttribute("Reveal") and o:FindFirstChild("Lift")
		if l then
			n += 1; l.Scale = 0.6
			TS:Create(l, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out, 0, false, 0.05 + n * 0.012), { Scale = 1 }):Play()
		end
	end
end
local function blurEffect()
	local b = Lighting:FindFirstChild("FolkStudBlur")
	if not b then b = Instance.new("BlurEffect"); b.Name = "FolkStudBlur"; b.Size = 0; b.Parent = Lighting end
	return b
end
function M.show(gui, on)
	local turn = (gui:GetAttribute("ShowTurn") or 0) + 1
	gui:SetAttribute("ShowTurn", turn)
	TS:Create(blurEffect(), TweenInfo.new(0.25), { Size = on and 18 or 0 }):Play()
	if on then
		gui.Enabled = true
		M.pop(gui)
	else
		local tw = TS:Create(gui.Root.Stage.Pop, TweenInfo.new(0.13, Enum.EasingStyle.Back, Enum.EasingDirection.In), { Scale = 0.8 })
		-- reopening during the close wins
		tw.Completed:Once(function() if gui:GetAttribute("ShowTurn") == turn then gui.Enabled = false end end)
		tw:Play()
	end
end
function M.hudLive(hud, screens)
	M.live(hud, { open = function(name)
		local target = screens[name]
		local opening = target and not target.Enabled
		for k, g in pairs(screens) do if k ~= name and g.Enabled then M.show(g, false) end end
		if target then M.show(target, opening) end
	end })
end
function M.live(gui, on)
	on = on or {}
	local root, s = gui.Root, gui.Root.Stage
	local scroll = s:FindFirstChild("Scroll", true)
	local tabs, jumping = {}, false
	local function select(sec)
		for _, t in ipairs(tabs) do
			local o = t:FindFirstChildOfClass("UIStroke"); local yes = t:GetAttribute("Jump") == sec
			o.Color = yes and WHITE or BLACK; o.Thickness = yes and 5 or 4
		end
	end
	for _, b in ipairs(gui:GetDescendants()) do
		if b:IsA("TextButton") and b:GetAttribute("Pressable") then
			local pop = b:FindFirstChild("Pop")
			local function to(v, info) TS:Create(pop, info or BACK, { Scale = v }):Play() end
			local icon = b:FindFirstChild("Icon")
			local base = icon and icon.Rotation or 0
			local function tilt(v) if icon then TS:Create(icon, BACK, { Rotation = base + v }):Play() end end
			b.MouseEnter:Connect(function() to(1.06); tilt(8) end)
			b.MouseLeave:Connect(function() to(1); tilt(0) end)
			b.MouseButton1Down:Connect(function() to(0.94, QUICK) end)
			b.MouseButton1Up:Connect(function() to(1.06) end)
			local action, sec = b:GetAttribute("Action"), b:GetAttribute("Jump")
			if action then
				b.Activated:Connect(function()
					if action == "close" and not on.close then M.show(gui, false)
					elseif on[action] then on[action](b:GetAttribute("Offer")) end
				end)
			elseif sec then
				table.insert(tabs, b)
				b.Activated:Connect(function()
					local k = scroll.AbsoluteSize.Y / math.max(scroll.Size.Y.Offset, 1)
					local goal = scroll.CanvasPosition.Y + (scroll.Content[sec].AbsolutePosition.Y - scroll.AbsolutePosition.Y) / k - 8
					jumping = true; select(sec)
					local tw = TS:Create(scroll, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { CanvasPosition = Vector2.new(0, math.max(goal, 0)) })
					tw.Completed:Once(function() jumping = false end); tw:Play()
				end)
			end
		end
	end
	if scroll and #tabs > 0 then
		table.sort(tabs, function(a, b) return a.AbsolutePosition.Y < b.AbsolutePosition.Y end)
		-- scrolling by hand moves the selected tab: the last heading past the top, or the last tab at the very end, since that heading may never reach the top
		scroll:GetPropertyChangedSignal("CanvasPosition"):Connect(function()
			if jumping then return end
			local best, bestY
			for _, t in ipairs(tabs) do
				local sec = t:GetAttribute("Jump")
				local yy = scroll.Content[sec].AbsolutePosition.Y - scroll.AbsolutePosition.Y
				if yy <= 60 and (not bestY or yy > bestY) then best, bestY = sec, yy end
			end
			if scroll.CanvasPosition.Y >= scroll.AbsoluteCanvasSize.Y - scroll.AbsoluteWindowSize.Y - 4 then best = tabs[#tabs]:GetAttribute("Jump") end
			if best then select(best) end
		end)
		select(tabs[1]:GetAttribute("Jump"))
	end
	-- the camera's size is near zero for a moment at Play start, so this reruns on every change and only ever touches Fit
	local function fit()
		local v = workspace.CurrentCamera.ViewportSize
		local ref = gui:GetAttribute("FitHeight")
		root.Fit.Scale = ref and math.clamp(v.Y / ref, 0.3, 1) or math.min(1, v.Y / gui:GetAttribute("NeedH"), (v.X - 16) / gui:GetAttribute("NeedW"))
	end
	fit()
	workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(fit)
	-- idle life: everything is found by attribute, and it only runs while this screen is open
	local spin, float, wiggle, beat, glint, turn, slide = {}, {}, {}, {}, {}, {}, {}
	for _, o in ipairs(gui:GetDescendants()) do
		if o:GetAttribute("Spin") then table.insert(spin, o) end
		if o:GetAttribute("Float") then table.insert(float, o) end
		if o:GetAttribute("Wiggle") then table.insert(wiggle, o) end
		if o:GetAttribute("Beat") then table.insert(beat, o) end
		if o:GetAttribute("Glint") ~= nil then table.insert(glint, o) end
		if o:GetAttribute("Turn") then table.insert(turn, o) end
		if o:GetAttribute("Slide") then table.insert(slide, o) end
		if o:IsA("TextLabel") and o.Name:sub(-4) == "Drop" then
			local src = o.Parent:FindFirstChild(o.Name:sub(1, -5))
			if src then src:GetPropertyChangedSignal("Text"):Connect(function() o.Text = src.Text end) end
		end
		if o:GetAttribute("Reveal") and o.Name:sub(-6) ~= "Shadow" and not o:GetAttribute("Beat") and not o:GetAttribute("NoHover") then
			local l = o:FindFirstChild("Lift")
			o.MouseEnter:Connect(function() TS:Create(l, BACK, { Scale = 1.03 }):Play() end)
			o.MouseLeave:Connect(function() TS:Create(l, BACK, { Scale = 1 }):Play() end)
		end
	end
	if not GuiService.ReducedMotionEnabled then
		local GOLD = hex("FFE600")
		RunService.RenderStepped:Connect(function()
			if not gui.Enabled then return end
			local t = os.clock()
			for _, o in ipairs(spin) do o.Rotation = (t * 22) % 360 end
			for i, o in ipairs(float) do o.Position = UDim2.fromOffset(o.Position.X.Offset, o:GetAttribute("Float") + math.sin(t * 2 + i) * 4) end
			for i, o in ipairs(wiggle) do o.Rotation = o:GetAttribute("Wiggle") + math.sin(t * 3 + i) * 4 end
			for _, o in ipairs(beat) do o.Lift.Scale = 1 + (math.sin(t * 4) + 1) * 0.02 end
			for _, o in ipairs(glint) do o:FindFirstChildOfClass("UIStroke").Color = o:GetAttribute("Glint") and GOLD:Lerp(WHITE, (math.sin(t * 5) + 1) / 2) or BLACK end
			for _, o in ipairs(turn) do o.Rotation = (t * 60) % 360 end
			for _, o in ipairs(slide) do o.Offset = Vector2.new(math.sin(t * 0.8) * 0.1, 0) end
		end)
	end
	if gui.Enabled and gui:GetAttribute("FolkStud") ~= "hud" then M.show(gui, true) end
end

return M
