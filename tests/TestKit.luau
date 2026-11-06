--!strict
-- Маленький набор проверок для тестов. Работает и в Node (tools/luau-test), и в Studio.

export type Result = { name: string, ok: boolean, err: string? }

export type T = {
	test: (name: string, fn: () -> ()) -> (),
	eq: (actual: any, expected: any, msg: string?) -> (),
	near: (a: number, b: number, eps: number?) -> (),
	truthy: (v: any, msg: string?) -> (),
	throws: (fn: () -> (), pattern: string?) -> (),
	summary: () -> (number, number, { string }),
	results: () -> { Result },
}

local TestKit = {}

local function show(v: any, depth: number?): string
	local d = depth or 0
	if type(v) == "string" then
		return string.format("%q", v)
	elseif type(v) ~= "table" then
		return tostring(v)
	elseif d > 3 then
		return "{...}"
	end
	local keys = {}
	for k in v do
		table.insert(keys, k)
	end
	table.sort(keys, function(a, b)
		return tostring(a) < tostring(b)
	end)
	local parts = {}
	for _, k in keys do
		table.insert(parts, "[" .. show(k, d + 1) .. "] = " .. show(v[k], d + 1))
	end
	return "{" .. table.concat(parts, ", ") .. "}"
end

local function deepEqual(a: any, b: any): boolean
	if a == b then
		return true
	end
	if type(a) ~= "table" or type(b) ~= "table" then
		return false
	end
	for k, v in a do
		if not deepEqual(v, b[k]) then
			return false
		end
	end
	for k in b do
		if a[k] == nil then
			return false
		end
	end
	return true
end

local function fail(msg: string?, detail: string)
	error((if msg then msg .. ": " else "") .. detail, 3)
end

function TestKit.new(): T
	local results: { Result } = {}
	local t = {} :: T

	t.test = function(name: string, fn: () -> ())
		local ok, err = pcall(fn)
		table.insert(results, { name = name, ok = ok, err = if ok then nil else tostring(err) })
	end

	t.eq = function(actual: any, expected: any, msg: string?)
		if not deepEqual(actual, expected) then
			fail(msg, "expected " .. show(expected) .. ", got " .. show(actual))
		end
	end

	t.near = function(a: number, b: number, eps: number?)
		local e = eps or 1e-6
		if math.abs(a - b) > e then
			fail(nil, string.format("expected %s ≈ %s (±%s)", tostring(a), tostring(b), tostring(e)))
		end
	end

	t.truthy = function(v: any, msg: string?)
		if not v then
			fail(msg, "expected a truthy value, got " .. show(v))
		end
	end

	t.throws = function(fn: () -> (), pattern: string?)
		local ok, err = pcall(fn)
		if ok then
			fail(nil, "expected an error, but the function returned normally")
		elseif pattern and not string.find(tostring(err), pattern) then
			fail(nil, "error " .. show(tostring(err)) .. " does not match " .. show(pattern))
		end
	end

	t.summary = function(): (number, number, { string })
		local passed, failed, errors = 0, 0, {}
		for _, r in results do
			if r.ok then
				passed += 1
			else
				failed += 1
				table.insert(errors, r.name .. ": " .. (r.err or "?"))
			end
		end
		return passed, failed, errors
	end

	t.results = function(): { Result }
		return results
	end

	return t
end

return TestKit
