class TemperatureComparisonCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entities || config.entities.length < 4) {
      throw new Error(
        'Provide entities: [inside_now, inside_last_year, outside_now, outside_last_year]'
      );
    }
    this.config = Object.assign(
      {
        title: 'Temperature Comparison (7 days)',
        refresh_interval: 60 * 60 * 1000,
        weight_outdoor_correction: 1.0,
        fallback_to_live: true,
      },
      config
    );

    this.attachShadow({ mode: 'open' });
    this._renderSkeleton();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateData();
  }

  getCardSize() {
    return 3;
  }

  _renderSkeleton() {
    this.shadowRoot.innerHTML = `
        <style>
        :host { font-family: var(--ha-card-font-family, Arial, Helvetica, sans-serif); display:block; }
        ha-card { padding: 16px; box-sizing: border-box; }
        .title { font-weight: 600; margin-bottom: 8px; }
        .row { display:flex; justify-content:space-between; margin:6px 0; align-items: center; }
        .label { color: var(--secondary-text-color); }
        .value { font-weight:600; }
        .big { font-size:1.2em; }
        .error { color: var(--error-color); font-weight:600; }
        hr { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 8px 0; }
        .muted { color: var(--secondary-text-color); font-size: 0.9em; }
        </style>
        <ha-card>
        <div class="title" id="card-title"></div>
        <div id="content">
            <div class="row"><div class="label">Inside (7-day avg)</div><div class="value" id="inside_now">…</div></div>
            <div class="row"><div class="label">Inside last year (7-day avg)</div><div class="value" id="inside_last">…</div></div>
            <hr/>
            <div class="row"><div class="label">Outside now</div><div class="value" id="outside_now">…</div></div>
            <div class="row"><div class="label">Outside last year</div><div class="value" id="outside_last">…</div></div>
            <hr/>
            <div class="row big"><div class="label">Corrected difference</div><div class="value big" id="difference">…</div></div>
            <div class="row muted"><div class="label">Note</div><div class="value muted" id="note"></div></div>
            <div class="row"><div id="error" class="error"></div></div>
        </div>
        </ha-card>
    `;
  }

  async _updateData() {
    const errEl = this.shadowRoot.getElementById('error');
    errEl.textContent = '';

    if (!this._hass || !this.config) return;
    const [
      insideNowEntity,
      insideLastYearEntity,
      outsideNowEntity,
      outsideLastYearEntity,
    ] = this.config.entities;
    this.shadowRoot.getElementById('card-title').textContent =
      this.config.title;
    this.shadowRoot.getElementById('note').textContent =
      'Calculated as (inside_last_year_avg - inside_now_avg) + (outside_now - outside_last_year)';

    const now = new Date();
    const startNow = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const startLastYear = new Date(startNow.getTime() - 365 * 24 * 3600 * 1000);
    const endLastYear = new Date(now.getTime() - 365 * 24 * 3600 * 1000);

    try {
      // Use hass.callApi so Home Assistant includes authentication
      const insideNowHist = await this._safeCallHistory(
        startNow,
        now,
        insideNowEntity
      );
      const insideLastHist = await this._safeCallHistory(
        startLastYear,
        endLastYear,
        insideLastYearEntity
      );

      const computeAvg = (values) => {
        const nums = values
          .map(String)
          .map((v) => parseFloat(v))
          .filter((n) => !isNaN(n));
        if (!nums.length) return null;
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      };

      let insideNowAvg = computeAvg(insideNowHist);
      let insideLastAvg = computeAvg(insideLastHist);

      // fallback to live states if history empty and fallback enabled
      if (this.config.fallback_to_live) {
        if (insideNowAvg === null) {
          const s = this._hass.states[insideNowEntity];
          if (s && !isNaN(parseFloat(s.state)))
            insideNowAvg = parseFloat(s.state);
        }
        if (insideLastAvg === null) {
          const s2 = this._hass.states[insideLastYearEntity];
          if (s2 && !isNaN(parseFloat(s2.state)))
            insideLastAvg = parseFloat(s2.state);
        }
      }

      const outsideNowState = this._hass.states[outsideNowEntity];
      const outsideLastState = this._hass.states[outsideLastYearEntity];
      const outsideNowVal = outsideNowState
        ? parseFloat(outsideNowState.state)
        : NaN;
      const outsideLastVal = outsideLastState
        ? parseFloat(outsideLastState.state)
        : NaN;

      this._setText(
        'inside_now',
        insideNowAvg !== null ? insideNowAvg.toFixed(2) + '°C' : 'n/a'
      );
      this._setText(
        'inside_last',
        insideLastAvg !== null ? insideLastAvg.toFixed(2) + '°C' : 'n/a'
      );
      this._setText(
        'outside_now',
        !isNaN(outsideNowVal) ? outsideNowVal.toFixed(2) + '°C' : 'n/a'
      );
      this._setText(
        'outside_last',
        !isNaN(outsideLastVal) ? outsideLastVal.toFixed(2) + '°C' : 'n/a'
      );

      if (
        insideNowAvg !== null &&
        insideLastAvg !== null &&
        !isNaN(outsideNowVal) &&
        !isNaN(outsideLastVal)
      ) {
        const insideDiff = insideLastAvg - insideNowAvg;
        const outsideCorrection =
          (outsideNowVal - outsideLastVal) *
          this.config.weight_outdoor_correction;
        const corrected = insideDiff + outsideCorrection;
        this._setText('difference', corrected.toFixed(2) + '°C');
      } else {
        this._setText('difference', 'insufficient data');
      }
    } catch (e) {
      console.error('TemperatureComparisonCard error', e);
      errEl.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
      this._setText('inside_now', 'error');
      this._setText('inside_last', 'error');
      this._setText('outside_now', 'error');
      this._setText('outside_last', 'error');
      this._setText('difference', 'error');
    }

    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(
      () => this._updateData(),
      this.config.refresh_interval
    );
  }

  _setText(id, text) {
    const el = this.shadowRoot.getElementById(id);
    if (el) el.textContent = text;
  }

  async _safeCallHistory(startDate, endDate, entity_id) {
    try {
      return await this._callHistory(startDate, endDate, entity_id);
    } catch (err) {
      console.warn('History call failed for', entity_id, err);
      return [];
    }
  }

  // Use Home Assistant's callApi to avoid 401 issues
  async _callHistory(startDate, endDate, entity_id) {
    if (!this._hass || !this._hass.callApi) {
      // fallback to fetch if callApi not available (shouldn't happen in modern HA)
      return await this._fetchHistory(startDate, endDate, entity_id);
    }
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    const path = `history/period/${encodeURIComponent(
      startISO
    )}?filter_entity_id=${encodeURIComponent(
      entity_id
    )}&end_time=${encodeURIComponent(endISO)}`;

    // Home Assistant callApi will include auth/session
    const json = await this._hass.callApi('GET', path);
    if (!Array.isArray(json) || json.length === 0) return [];
    const entityHistory = json[0];
    const states = [];
    for (const item of entityHistory) {
      if (item && item.state !== undefined) states.push(item.state);
    }
    return states;
  }

  // fallback fetch (kept for older HA where callApi may not exist)
  async _fetchHistory(startDate, endDate, entity_id) {
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    const url = `/api/history/period/${encodeURIComponent(
      startISO
    )}?filter_entity_id=${encodeURIComponent(
      entity_id
    )}&end_time=${encodeURIComponent(endISO)}`;
    const resp = await fetch(url, { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`History fetch failed: ${resp.status}`);
    const json = await resp.json();
    if (!Array.isArray(json) || json.length === 0) return [];
    const entityHistory = json[0];
    const states = [];
    for (const item of entityHistory) {
      if (item && item.state !== undefined) states.push(item.state);
    }
    return states;
  }
}

customElements.define('temperature-comparison-card', TemperatureComparisonCard);
