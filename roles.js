// roles.js — Role definitions and assignment

/**
 * Role model
 * id: string key
 * name: display name
 * emoji: visual icon
 * hint: short, private hint shown on reveal
 * team: 'virus' | 'host' | 'immune'
 */
export const ROLES = {
  virus: { id: 'virus', name: 'Virus', emoji: '🦠', hint: 'Avoid detection and survive the vote.', team: 'virus' },
  // Immune role is temporarily disabled (kept here for future use)
  immune: { id: 'immune', name: 'Immune', emoji: '💉', hint: 'You are resistant. Try to help Hosts find the Virus.', team: 'immune' },
  host: { id: 'host', name: 'Host', emoji: '🧍', hint: 'You are a normal Host. Find and vote out the Virus.', team: 'host' },
};

/**
 * Build roles array for given player count.
 * Rules:
 * - Always 1 Virus
 * - No Immune (temporarily disabled)
 * - Rest Hosts
 */
export function assignRoles(playerCount) {
  const roles = [];
  roles.push(ROLES.virus);
  // Immune disabled for now: do not add immune
  while (roles.length < playerCount) roles.push(ROLES.host);

  // Shuffle using Fisher-Yates
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}
