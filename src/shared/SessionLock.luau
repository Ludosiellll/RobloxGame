--!strict
-- Решение по блокировке сессии при загрузке данных игрока.
-- take — данные свободны или наши; wait — их держит другой сервер; steal — чужая блокировка устарела.

local Config = require(script.Parent.Config)

local SessionLock = {}

function SessionLock.decide(lock: { jobId: string, time: number }?, myJobId: string, now: number): "take" | "wait" | "steal"
	if type(lock) ~= "table" or type(lock.jobId) ~= "string" or type(lock.time) ~= "number" then
		return "take"
	end
	if lock.jobId == myJobId then
		return "take"
	end
	if now - lock.time > Config.Data.LockStaleSeconds then
		return "steal"
	end
	return "wait"
end

return SessionLock
