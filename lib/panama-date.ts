// El taller opera en Panamá (UTC-5). La fecha del día se deriva siempre de esa
// zona: usar UTC adelantaría el día a partir de las 19:00 hora local y grabaría
// ingresos y salidas con la fecha del día siguiente.
const panamaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Panama",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInPanama(now: Date = new Date()) {
  let year = "";
  let month = "";
  let day = "";

  for (const part of panamaDateFormatter.formatToParts(now)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }

  return `${year}-${month}-${day}`;
}
