/**
 * The CPUs a company runner gives its job (#2774).
 *
 * The jail sets `VIBEWARS_RUNNER_CPUS` from the same value as its CPU quota
 * (`runner-jail.mjs`). Vitest counts the host's CPUs, far more than the
 * quota, and its workers starved each other. Hosted runners and dev machines
 * have no such variable: `undefined` leaves the tool's own default alone.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {number | undefined} a positive integer, else undefined
 */
export function jobCpus(env) {
  const raw = env.VIBEWARS_RUNNER_CPUS;
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) return undefined;
  return Number(raw);
}
