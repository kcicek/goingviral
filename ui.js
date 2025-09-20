// ui.js — Rendering helpers

// Simple helpers
export const $ = (sel, root = document) => root.querySelector(sel);
export const h = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) el.setAttribute(k, v);
  });
  children.flat().forEach(child => {
    if (child === null || child === undefined) return;
    if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  });
  return el;
};

export function renderApp(container, vnode) {
  container.innerHTML = '';
  container.appendChild(vnode);
}

// Components
export function Header() {
  return h('div', { class: 'header' },
    h('div', { class: 'badge' }, h('span', { class: 'dot' }), 'Going Viral')
  );
}

export function Container(...children) {
  return h('div', { class: 'container' }, ...children);
}

export function PlayerGrid(players, opts = {}) {
  const { onTileClick, revealMap, votesMap, enableClicks = true, disabledIndices = [], currentIndex = null, hiddenIndices = [] } = opts;
  const disabledSet = new Set(disabledIndices || []);
  const hiddenSet = new Set(hiddenIndices || []);
  const total = players.length || 1;
  return h('div', { class: 'grid players' },
    players.map((p, i) => {
      const color = playerTint(i, total);
      const el = PlayerTile({
        index: i,
        player: p,
        revealed: revealMap?.[i],
        votes: votesMap?.[i],
        onClick: (enableClicks && !disabledSet.has(i)) ? () => onTileClick?.(i) : null,
        color,
        hideIcon: currentIndex === i
      });
      if (currentIndex === i) el.classList.add('current');
      if (disabledSet.has(i)) el.classList.add('disabled');
      if (hiddenSet.has(i)) el.style.display = 'none';
      return el;
    })
  );
}

// Deterministic vibrant tint per player index
export function playerTint(index, total) {
  const hue = Math.round((index * 137.508) % 360); // golden angle spacing
  const s = 80; // saturation
  const l = 55; // lightness
  const tint = `hsla(${hue}, ${s}%, ${l}%, 1)`;
  const border = `hsla(${hue}, ${s}%, ${l}%, 0.35)`;
  const bg = `hsla(${hue}, ${s}%, ${Math.max(20, l - 10)}%, 0.18)`;
  return { hue, s, l, tint, border, bg };
}

function PlayerTile({ index, player, revealed, votes, onClick, color, hideIcon }) {
  // Only animate flip for reveal phase and current reveal
  const isFlipping = revealed && revealed._flip;
  // Get name from players array if present
  const name = player && player.name ? player.name : undefined;
  const displayName = name || `Player #${index + 1}`;
  const style = color ? `background: linear-gradient(180deg, ${color.bg}, var(--tile)); border-color: ${color.border}; box-shadow: var(--shadow), 0 0 0 1px ${color.border};` : undefined;
  return h('button', { class: `tile${revealed ? ' revealed' : ''}${isFlipping ? ' flipping' : ''}`, onClick, style },
    h('div', { class: 'tile-inner' },
      h('div', { class: 'tile-front' },
        (!hideIcon && color) ? h('span', { class: 'picon', style: `background:${color.tint}; box-shadow: 0 0 8px ${color.tint};` }) : null,
        h('div', { class: 'label' }, ''),
        h('div', { class: 'name', style: `font-size:15px;word-break:break-word;white-space:normal;line-height:1.1;max-width:100%;overflow-wrap:break-word;padding:2px 0;${color ? `color:${color.tint};font-weight:800;` : ''}` }, displayName)
      ),
      h('div', { class: 'tile-back' },
        revealed?.emoji ? h('div', { class: 'role' }, `${revealed.emoji} ${revealed.name}`) : null,
        revealed?.hint ? h('div', { class: 'hint' }, revealed.hint) : null,
        typeof votes === 'number' ? h('div', { class: 'hint' }, `Votes: ${votes}`) : null,
      )
    )
  );
}

export function Controls(...buttons) {
  return h('div', { class: 'controls' }, ...buttons);
}

export function Button(label, { kind = 'accent', onClick } = {}) {
  return h('button', { class: `btn ${kind}`, onClick }, label);
}

export function Footer(text = 'Pass-and-play social deduction • Built with Vanilla JS') {
  return h('div', { class: 'footer' }, text);
}

// Admin panel for development diagnostics
export function AdminBox({ round, phase, players, virusIdx, infected, votes }) {
  const rows = players.map((p, i) => h('div', { class: 'admin-row' },
    h('div', { class: 'admin-cell name' }, p.name || `Player #${i + 1}`),
    h('div', { class: 'admin-cell role' }, `${p.role.emoji} ${p.role.name}${i === virusIdx ? ' (Virus)' : ''}`),
    h('div', { class: 'admin-cell status' }, infected[i] ? 'infected' : 'healthy'),
    h('div', { class: 'admin-cell vote' }, votes[i] != null ? `→ ${players[votes[i]]?.name || `#${(votes[i] ?? 0) + 1}`}` : '')
  ));
  return h('div', { class: 'admin-box' },
    h('div', { class: 'admin-head' },
      h('div', {}, `Round ${round}`),
      h('div', {}, `Phase: ${phase}`)
    ),
    h('div', { class: 'admin-grid' }, ...rows)
  );
}
