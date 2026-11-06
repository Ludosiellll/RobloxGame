--!strict
-- Блокировка сессии: два сервера не должны одновременно писать одни и те же данные.

local Shared = game:GetService("ReplicatedStorage").Shared
local SessionLock = require(Shared.SessionLock) :: any

return function(t: any)
	t.test("lock: none → take", function()
		t.eq(SessionLock.decide(nil, "job-A", 1000), "take")
	end)

	t.test("lock: mine → take", function()
		t.eq(SessionLock.decide({ jobId = "job-A", time = 990 }, "job-A", 1000), "take")
	end)

	t.test("lock: fresh foreign → wait", function()
		t.eq(SessionLock.decide({ jobId = "job-B", time = 990 }, "job-A", 1000), "wait")
	end)

	t.test("lock: stale foreign → steal", function()
		t.eq(SessionLock.decide({ jobId = "job-B", time = 699 }, "job-A", 1000), "steal")
	end)

	t.test("lock: broken value → take", function()
		t.eq(SessionLock.decide({ jobId = 5, time = "x" } :: any, "job-A", 1000), "take")
	end)
end
