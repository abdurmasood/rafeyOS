// The phone on the desk shows the visitor's real time, two lines like the render's "23 / 33"
const pad = (value) => String(value).padStart(2, '0')

export const formatClock = (date) => ({ hours: pad(date.getHours()), minutes: pad(date.getMinutes()) })

export const msUntilNextMinute = (date) => 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds())
