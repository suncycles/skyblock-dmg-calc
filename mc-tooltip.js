/* =========================================================
   Shared Minecraft/Skyblock-style tooltip: a §-color-code
   renderer plus a single positioned #mc-tooltip element.
   Used by hex.js (item lore, verbatim from NEU-REPO) and
   enchants.js (enchant name + XP costs).

   Color table is vanilla Minecraft's 16 §-codes. Rarity colors
   are Hypixel Skyblock's, verified against NEU-REPO's own
   constants/misc.json "tier_colors" (the same data source the
   worker already pulls from).
   ========================================================= */

const MC_COLORS = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa',
  4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff',
  c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff'
};

const RARITY_COLORS = {
  common: 'f', uncommon: 'a', rare: '9', epic: '5', legendary: '6',
  mythic: 'd', divine: 'b', supreme: '4', special: 'c', very_special: 'c', admin: '4'
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Parses a single line of real Minecraft §-formatted text (colors 0-9a-f,
// plus l/o/n/m for bold/italic/underline/strikethrough, r to reset) into
// HTML spans. A color code resets active formatting, matching vanilla behavior.
function renderMinecraftText(text) {
  let html = '';
  let color = MC_COLORS[7];
  let bold = false, italic = false, underline = false, strikethrough = false;
  let buffer = '';

  function flush() {
    if (!buffer) return;
    const styles = [`color:${color}`];
    if (bold) styles.push('font-weight:bold');
    if (italic) styles.push('font-style:italic');
    const decorations = [];
    if (underline) decorations.push('underline');
    if (strikethrough) decorations.push('line-through');
    if (decorations.length) styles.push(`text-decoration:${decorations.join(' ')}`);
    html += `<span style="${styles.join(';')}">${escapeHtml(buffer)}</span>`;
    buffer = '';
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '§' && i + 1 < text.length) {
      flush();
      const code = text[i + 1].toLowerCase();
      if (MC_COLORS[code]) {
        color = MC_COLORS[code];
        bold = italic = underline = strikethrough = false;
      } else if (code === 'l') bold = true;
      else if (code === 'o') italic = true;
      else if (code === 'n') underline = true;
      else if (code === 'm') strikethrough = true;
      else if (code === 'r') {
        color = MC_COLORS[7];
        bold = italic = underline = strikethrough = false;
      }
      i++;
      continue;
    }
    buffer += ch;
  }
  flush();
  return html || '&nbsp;';
}

function renderLoreHTML(lines) {
  return (lines || []).map((line) => `<div>${renderMinecraftText(line)}</div>`).join('');
}

function rarityHex(tier) {
  const key = (tier || 'common').toLowerCase();
  return MC_COLORS[RARITY_COLORS[key] || 'f'];
}

let tooltipEl = null;

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'mc-tooltip';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showTooltipHTML(html, anchorEl) {
  const el = ensureTooltipEl();
  el.innerHTML = html;
  el.classList.add('visible');

  const rect = anchorEl.getBoundingClientRect();
  const tooltipRect = el.getBoundingClientRect();
  let left = rect.right + 8;
  if (left + tooltipRect.width > window.innerWidth) {
    left = rect.left - tooltipRect.width - 8;
  }
  let top = rect.top;
  if (top + tooltipRect.height > window.innerHeight) {
    top = window.innerHeight - tooltipRect.height - 4;
  }
  el.style.left = `${Math.max(4, left)}px`;
  el.style.top = `${Math.max(4, top)}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove('visible');
}
