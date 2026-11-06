--!strict
-- Очередь настроек: ползунок шлёт значение на каждом шаге, а на сервер уходит только последнее.
-- push возвращает true, когда для ключа нужно запланировать отправку; take забирает последнее значение.

local SettingsQueue = {}

export type Queue = {
	push: (id: string, value: any) -> boolean,
	take: (id: string) -> any,
}

function SettingsQueue.new(): Queue
	local pending: { [string]: { value: any } } = {}
	local self = {}
	function self.push(id: string, value: any): boolean
		local first = pending[id] == nil
		pending[id] = { value = value }
		return first
	end
	function self.take(id: string): any
		local p = pending[id]
		pending[id] = nil
		return p and p.value
	end
	return self :: Queue
end

return SettingsQueue
