export function cohortName(division: string) {
  return division.replace(/\s+20\d{2}\s*$/, "").trim() || division;
}
