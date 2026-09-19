/** Parse an ISO calendar date as local time, rejecting impossible dates. */
export function parseLocalIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // Date normalises 31 February to March instead of rejecting it. Compare every
  // part so storage and imports never accept a day that does not exist.
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;

  return date;
}

export function isValidIsoDate(value: string): boolean {
  return parseLocalIsoDate(value) !== null;
}
