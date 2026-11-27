export const DEMO_DATE = "2026-10-31";
export const DEMO_NOW = Date.parse(DEMO_DATE + "T18:00:00+08:00");

let demoClockEnabled = false;

export function configureDemoClock() {
  demoClockEnabled = true;
}

export function isDemoClockEnabled() {
  return demoClockEnabled;
}

export function operationsNow() {
  return demoClockEnabled ? DEMO_NOW : Date.now();
}
