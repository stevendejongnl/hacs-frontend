/* Simple Changedetection List Card
	- Reads states('input_text.changedetection_all') (expects JSON array)
	- Renders a list of cards (title, url link, recent prices) inside the card
	- No external deps, small and self-contained
	- Put this file in /config/www/custom_cards/changedetection-list-card.js
	- Add resource: /local/custom_cards/changedetection-list-card.js type=module
	- Then use the card as type: 'custom:changedetection-list-card'
*/

class ChangedetectionListCard extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._updateInterval = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config) throw new Error('You must provide a configuration');
    this._config = Object.assign(
      {
        entity: 'input_text.changedetection_all',
        max_prices_per_product: 10,
        show_latest_only: false,
        title: 'Changedetection items',
      },
      config
    );
    this._render();
  }

  connectedCallback() {
    // poll occasionally to update view for changes (also updates via hass setter)
    if (!this._updateInterval) {
      this._updateInterval = setInterval(() => this._render(), 5000);
    }
  }

  disconnectedCallback() {
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
      this._updateInterval = null;
    }
  }

  _safeParse(json) {
    if (!json || typeof json !== 'string') return null;
    try {
      const trimmed = json.trim();
      if (!trimmed) return null;
      return JSON.parse(trimmed);
    } catch (e) {
      console.warn('ChangedetectionListCard: JSON parse error', e);
      return null;
    }
  }

  _normalizePriceStr(s) {
    if (!s) return s;
    // simple cleanup: collapse whitespace
    return s.replace(/\s+/g, ' ').trim();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const entityId = this._config.entity;
    const state =
      this._hass.states && this._hass.states[entityId]
        ? this._hass.states[entityId].state
        : null;
    const data = this._safeParse(state) || [];
    // container styles
    const style = `
		:host { display:block; font-family: var(--ha-card-font-family, "Roboto", sans-serif); }
		.card { background: var(--ha-card-background, white); color: var(--primary-text-color); border-radius: 6px; padding: 12px; box-shadow: var(--ha-card-box-shadow); }
		.header { font-weight: 600; font-size: 1.05em; margin-bottom: 8px; }
		.product { border-top: 1px solid rgba(0,0,0,0.06); padding-top: 10px; margin-top: 10px; }
		.product:first-of-type { border-top: none; padding-top:0; margin-top:0; }
		.title { font-weight: 500; font-size: 1em; margin-bottom: 4px; }
		.url { font-size: 0.90em; color: var(--primary-color); text-decoration: none; }
		.prices { margin-top: 8px; font-size: 0.90em; }
		.price-item { margin-bottom: 4px; }
		.ts { color: rgba(0,0,0,0.55); margin-right: 8px; }
		.empty { color: rgba(0,0,0,0.4); font-style: italic; }
		`;
    // build inner HTML
    let html = `<div class="card">`;
    html += `<div class="header">${this._escapeHtml(
      this._config.title || 'Changedetection items'
    )}</div>`;

    if (!Array.isArray(data) || data.length === 0) {
      html += `<div class="empty">No items stored in ${this._escapeHtml(
        entityId
      )}.</div>`;
      html += `</div>`;
      this._shadow.innerHTML = `<style>${style}</style>` + html;
      return;
    }

    // iterate items
    data.forEach((item) => {
      const url = item.url || '';
      const title = item.title || '';
      const prices = Array.isArray(item.prices) ? item.prices : [];
      html += `<div class="product">`;
      if (title) {
        html += `<div class="title">${this._escapeHtml(title)}</div>`;
      }
      if (url) {
        // clickable link; open in new tab
        html += `<div><a class="url" href="${this._escapeAttr(
          url
        )}" target="_blank" rel="noopener">${this._escapeHtml(url)}</a></div>`;
      }
      if (prices.length === 0) {
        html += `<div class="prices"><div class="empty">No prices stored yet.</div></div>`;
      } else {
        html += `<div class="prices">`;
        const max = this._config.max_prices_per_product;
        const list = this._config.show_latest_only
          ? [prices[prices.length - 1]]
          : prices.slice(-max);
        // if not show_latest_only, show the last N (in chronological order)
        list.forEach((p) => {
          const ts = p.timestamp || p.ts || '';
          const pr = p.price || p.raw || '';
          html += `<div class="price-item"><span class="ts">${this._escapeHtml(
            ts
          )}</span><span class="p">${this._escapeHtml(
            this._normalizePriceStr(pr)
          )}</span></div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
    });

    html += `</div>`;
    this._shadow.innerHTML = `<style>${style}</style>` + html;
  }

  getCardSize() {
    // approximate: 1 + number of items
    if (!this._hass || !this._config) return 3;
    const state =
      this._hass.states && this._hass.states[this._config.entity]
        ? this._hass.states[this._config.entity].state
        : null;
    const data = this._safeParse(state) || [];
    return Math.min(10, 1 + data.length);
  }

  _escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[m];
    });
  }

  _escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

customElements.define('changedetection-list-card', ChangedetectionListCard);
