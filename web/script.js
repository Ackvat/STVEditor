/* =========================================
   Sihirizasyon: Toplantı Var — Card Generator
   ========================================= */

const App = {
  cards: [],
  currentIndex: 0,
  defaultCardCSS: '',
  levelColors: { 1: '#909090', 2: '#2ecc71', 3: '#3498db', 4: '#9b59b6', 5: '#e67e22', 6: '#2c003c' },
  maxLevel: 6,
  printSettings: {
    cols: 3, rows: 3,
    mx: 75, my: 60, gx: 75, gy: 75,
    backFlipH: false, backFlipV: false,
    previewSide: 'front'
  },
  printPreviewDirty: true,
  assetExts: ['png', 'jpg', 'webp'],
  /* In-memory asset store: key = 'pictures/foo.png', value = dataURL */
  assets: {},

  /* ---- Init ---- */
  init() {
    this.cache = new Map();
    this._inlineIconCache = {};
    this.bindEvents();
    this.buildLevelUI();
    this.buildEditorControls();
    this.buildPrintControls();
    this.buildSectionEditor();
    this.updateUI();
    this.scaleCardPreview();
    this.initEmptyProject();
    window.addEventListener('resize', () => { this.scaleCardPreview(); this.scalePrintPreview(); });
    if (location.protocol === 'file:')
      this.setStatus('⚠ Serve via HTTP: `python3 -m http.server 8080` then http://localhost:8080/web/');
    fetch('card.css').then(r => r.text()).then(css => {
      this.defaultCardCSS = css;
      document.getElementById('css-editor').value = css;
      this.syncSlidersFromCSS();
      this.updateTopBarBg();
      this.updateTypeBarBg();
    }).catch(() => {});
  },

  /* ---- Events ---- */
  bindEvents() {
    document.getElementById('upload-btn').onclick = () => document.getElementById('project-input').click();
    document.getElementById('project-input').onchange = e => { if (e.target.files[0]) this.uploadProject(e.target.files[0]); };
    document.getElementById('save-btn').onclick = () => this.saveProject();
    document.getElementById('prev-btn').onclick = () => { if (this.currentIndex > 0) this.showCard(--this.currentIndex); };
    document.getElementById('next-btn').onclick = () => { if (this.currentIndex < this.cards.length - 1) this.showCard(++this.currentIndex); };
    document.getElementById('card-select').onchange = e => this.showCard(parseInt(e.target.value, 10));
    document.getElementById('refresh-assets-btn').onclick = () => { this.cache.clear(); if (this.cards.length) this.showCard(this.currentIndex); else document.getElementById('card').style.backgroundImage = ''; this.refreshAllAssetGrids(); this.setStatus('Assets refreshed'); };
    document.getElementById('add-card-btn').onclick = () => this.addCard();
    document.getElementById('remove-card-btn').onclick = () => this.removeCard();
    document.getElementById('duplicate-card-btn').onclick = () => this.duplicateCard();
    document.getElementById('ce-apply-btn').onclick = () => this.applyEditorToCard();
    document.getElementById('ce-add-section').onclick = () => this.addEditorSection();
    /* Dice checkbox toggles */
    document.querySelectorAll('.ce-dice-cb').forEach(cb => {
      cb.onchange = () => this.toggleDiceField(cb);
    });
    document.getElementById('ce-show-level').onchange = () => this.toggleLevelField();
    document.getElementById('gen-all-btn').onclick = () => this.generateAll();
    document.getElementById('gen-fronts-pdf-btn').onclick = () => this.generatePDF('fronts');
    document.getElementById('gen-backs-pdf-btn').onclick = () => this.generatePDF('backs');
    document.querySelectorAll('#editor-tabs .tab-btn').forEach(b => b.onclick = () => this.switchTab(b.dataset.tab));
    document.getElementById('css-apply-btn').onclick = () => this.applyCustomCSS();
    document.getElementById('css-save-btn').onclick = () => this.downloadBlob(new Blob([document.getElementById('css-editor').value], { type: 'text/css' }), 'card.css');
    document.getElementById('css-load-btn').onclick = () => document.getElementById('css-file-input').click();
    document.getElementById('css-file-input').onchange = e => { if (e.target.files[0]) { const r = new FileReader(); r.onload = ev => { document.getElementById('css-editor').value = ev.target.result; this.applyCustomCSS(); this.syncSlidersFromCSS(); }; r.readAsText(e.target.files[0]); } };
    document.getElementById('css-reset-btn').onclick = () => this.resetCSS();
    document.getElementById('print-save-btn').onclick = () => this.savePrintSettings();
    document.getElementById('print-load-btn').onclick = () => document.getElementById('print-file-input').click();
    document.getElementById('print-file-input').onchange = e => { if (e.target.files[0]) this.loadPrintSettings(e.target.files[0]); };
    document.getElementById('print-reset-btn').onclick = () => this.resetPrintSettings();
    /* Asset upload buttons */
    document.querySelectorAll('.ce-upload-btn').forEach(b => {
      b.onclick = () => document.getElementById(b.dataset.target).click();
    });
    document.getElementById('ce-picture-input').onchange = e => this.handleAssetUpload('pictures', e);
    /* Clear asset buttons */
    document.querySelectorAll('.ce-clear-btn').forEach(b => {
      b.onclick = () => this.clearAssetField(b.dataset.field);
    });
    /* Editor field change -> auto update preview */
    document.querySelectorAll('.ce-field').forEach(el => {
      el.onchange = () => this.applyEditorToCard();
      if (el.id === 'ce-resources') {
        el.oninput = null;
        el.onkeydown = e => { if (e.key === 'Enter') { this.validateResources(); this.applyEditorToCard(); } };
        el.onblur = () => { this.validateResources(); this.applyEditorToCard(); };
      } else {
        el.oninput = () => { if (el.id !== 'ce-name') this.applyEditorToCard(); };
      }
    });
    /* Sub-tab switching */
    document.querySelectorAll('.sub-tab-btn').forEach(b => {
      b.onclick = () => {
        this.switchSubTab('assets', b.dataset.subtab);
        if (b.dataset.subtab === 'icons') {
          /* Activate first sub2 tab (Resource) */
          this.switchSub2Tab('assets', 'icons', 'resource');
        }
        this.refreshAllAssetGrids();
      };
    });
    /* Secondary sub-tab switching (Icons > Resource/Type) */
    document.querySelectorAll('.sub2-tab-btn').forEach(b => {
      b.onclick = () => this.switchSub2Tab('assets', 'icons', b.dataset.sub2tab);
    });
    /* Asset icon uploads */
    document.getElementById('type-icon-asset-upload-btn').onclick = () => document.getElementById('type-icon-asset-input').click();
    document.getElementById('type-icon-asset-input').onchange = e => this.handleAssetUpload('icons/types', e);
    document.getElementById('resource-icon-asset-upload-btn').onclick = () => document.getElementById('resource-icon-asset-input').click();
    document.getElementById('resource-icon-asset-input').onchange = e => this.handleAssetUpload('icons/resources', e);
    /* Action icon uploads */
    document.getElementById('action-icon-asset-upload-btn').onclick = () => document.getElementById('action-icon-asset-input').click();
    document.getElementById('action-icon-asset-input').onchange = e => this.handleAssetUpload('icons/actions', e);
    /* Backgrounds upload */
    document.getElementById('backgrounds-asset-upload-btn').onclick = () => document.getElementById('backgrounds-asset-input').click();
    document.getElementById('backgrounds-asset-input').onchange = e => this.handleAssetUpload('backgrounds', e);
    /* Card backs upload */
    document.getElementById('backs-asset-upload-btn').onclick = () => document.getElementById('backs-asset-input').click();
    document.getElementById('backs-asset-input').onchange = e => this.handleAssetUpload('backs', e);
    document.getElementById('backs-global-clear-btn').onclick = () => this.clearGlobalBack();
    /* Main tab switching */
    document.querySelectorAll('.main-tab-btn').forEach(b => b.onclick = () => this.switchMainTab(b.dataset.maintab));
    document.getElementById('stats-refresh-btn').onclick = () => this.renderStats();
  },

  /* ---- Tab Switching ---- */
  switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    const isPrint = tab === 'print';
    document.getElementById('card').style.display = isPrint ? 'none' : '';
    document.getElementById('print-preview-wrap').style.display = isPrint ? 'flex' : 'none';
    if (isPrint && this.cards.length) this.renderPrintPreview();
    if (tab === 'assets') this.refreshAllAssetGrids();
    if (tab === 'card' && this.cards.length) this.applyEditorToCard();
  },

  switchSubTab(parentTab, subTab) {
    const pane = document.getElementById('tab-' + parentTab);
    pane.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === subTab));
    pane.querySelectorAll('.sub-tab-pane').forEach(p => p.classList.toggle('active', p.id === 'subtab-' + subTab));
  },

  switchSub2Tab(parentTab, subTab, sub2Tab) {
    const pane = document.getElementById('tab-' + parentTab);
    const inner = pane.querySelector('#subtab-' + subTab);
    if (!inner) return;
    inner.querySelectorAll('.sub2-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub2tab === sub2Tab));
    inner.querySelectorAll('.sub2-tab-pane').forEach(p => p.classList.toggle('active', p.id === 'sub2tab-' + sub2Tab));
  },

  /* ---- Main Tab Switching ---- */
  switchMainTab(tab) {
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.maintab === tab));
    document.querySelectorAll('.main-view').forEach(v => v.classList.toggle('active', v.id === 'main-' + tab));
    if (tab === 'statistics') this.renderStats();
  },

  /* ================================================================
     STATISTICS
     ================================================================ */

  computeStats() {
    const s = {
      total: this.cards.length, printed: 0, unprinted: 0,
      levelDist: {}, levelTotal: 0,
      atkNums: [], atkDice: {}, defNums: [], defDice: {}, manaNums: [], manaDice: {},
      resources: {}, typeDist: {}, formDist: {}, noType: 0, noForm: 0
    };
    for (const c of this.cards) {
      if (c.printed === 'yes') s.printed++; else s.unprinted++;
      if (c.showLevel && c.level) { s.levelDist[c.level] = (s.levelDist[c.level] || 0) + 1; s.levelTotal++; }
      const proc = (v, nums, dice) => {
        if (typeof v === 'string' && /^d\d+$/.test(v)) dice[v] = (dice[v] || 0) + 1;
        else if (typeof v === 'number' && v !== 0) nums.push(v);
      };
      proc(c.attack, s.atkNums, s.atkDice);
      proc(c.defence, s.defNums, s.defDice);
      proc(c.mana, s.manaNums, s.manaDice);
      for (const [n, cnt] of Object.entries(c.resources)) {
        if (!s.resources[n]) s.resources[n] = { total: 0, count: 0 };
        s.resources[n].total += cnt; s.resources[n].count++;
      }
      const t = c.card_type || ''; if (t) s.typeDist[t] = (s.typeDist[t] || 0) + 1; else s.noType++;
      const f = c.card_form || ''; if (f) s.formDist[f] = (s.formDist[f] || 0) + 1; else s.noForm++;
    }
    return s;
  },

  renderStats() {
    const el = document.getElementById('stats-content');
    if (!this.cards.length) {
      el.querySelectorAll('.stats-section').forEach(x => x.style.display = 'none');
      document.getElementById('stats-no-data').style.display = '';
      return;
    }
    document.getElementById('stats-no-data').style.display = 'none';
    el.querySelectorAll('.stats-section').forEach(x => x.style.display = '');

    const filters = this.getStatFilters();
    /* Apply printed filter */
    let cards = this.cards;
    if (filters.printed === 'printed') cards = cards.filter(c => c.printed === 'yes');
    else if (filters.printed === 'unprinted') cards = cards.filter(c => c.printed !== 'yes');

    /* Apply level filter */
    if (!filters.allChecked && filters.levels.length) {
      cards = cards.filter(c => !c.showLevel || !c.level || filters.levels.includes(String(c.level)));
    }

    /* Recompute stats on filtered set */
    const stats = this.computeStatsFor(cards);

    /* Show/hide sections */
    document.getElementById('stats-overview').style.display = filters.display.overview ? '' : 'none';
    document.getElementById('stats-level-dist').style.display = filters.display['level-dist'] ? '' : 'none';
    document.getElementById('stats-stats').style.display = filters.display.stats ? '' : 'none';
    document.getElementById('stats-resources').style.display = filters.display.resources ? '' : 'none';
    document.getElementById('stats-type-dist').style.display = filters.display['type-dist'] ? '' : 'none';

    /* Overview */
    const avg = (nums) => nums.length ? (nums.reduce((a,b)=>a+b,0) / nums.length).toFixed(1) : '—';
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-printed').textContent = stats.printed;
    document.getElementById('stat-avg-atk').textContent = avg(stats.atkNums);
    document.getElementById('stat-avg-def').textContent = avg(stats.defNums);
    document.getElementById('stat-avg-mana').textContent = avg(stats.manaNums);

    /* Level Distribution */
    const lc = document.getElementById('stats-level-chart');
    const levelKeys = Object.keys(stats.levelDist).sort((a,b)=>parseInt(a)-parseInt(b));
    const maxLevelCount = Math.max(1, ...levelKeys.map(k=>stats.levelDist[k]));
    if (levelKeys.length) {
      lc.innerHTML = levelKeys.map(k =>
        `<div class="stats-bar-row"><span class="stats-bar-label">Level ${k}</span><div class="stats-bar-track"><div class="stats-bar-fill level-fill" style="width:${(stats.levelDist[k]/maxLevelCount*100).toFixed(0)}%"></div></div><span class="stats-bar-count">${stats.levelDist[k]}</span></div>`
      ).join('');
    } else {
      lc.innerHTML = '<p class="stats-bar-empty">No cards with level display enabled.</p>';
    }

    /* Attack / Defence / Mana */
    const st = document.getElementById('stats-stats-table');
    const statRows = (label, nums, dice) => {
      const total = nums.reduce((a,b)=>a+b,0);
      const avgV = nums.length ? (total / nums.length).toFixed(1) : '—';
      const minV = nums.length ? Math.min(...nums) : '—';
      const maxV = nums.length ? Math.max(...nums) : '—';
      const diceStr = Object.keys(dice).length ? Object.entries(dice).map(([k,v])=>`${k}×${v}`).join(', ') : '—';
      return `<tr><td>${label}</td><td>${nums.length}</td><td>${total}</td><td>${avgV}</td><td>${minV}</td><td>${maxV}</td><td>${diceStr}</td></tr>`;
    };
    st.innerHTML = `<table class="stats-table"><thead><tr><th>Stat</th><th>Count</th><th>Total</th><th>Avg</th><th>Min</th><th>Max</th><th>Dice</th></tr></thead><tbody>
      ${statRows('Attack', stats.atkNums, stats.atkDice)}
      ${statRows('Defence', stats.defNums, stats.defDice)}
      ${statRows('Mana', stats.manaNums, stats.manaDice)}
    </tbody></table><p class="stats-table-note">Dice values are listed separately; numeric stats exclude dice cards.</p>`;

    /* Resources */
    const rt = document.getElementById('stats-resources-table');
    const rKeys = Object.keys(stats.resources).sort();
    if (rKeys.length) {
      rt.innerHTML = `<table class="stats-table"><thead><tr><th>Resource</th><th>Cards Using</th><th>Total Count</th><th>Avg per Card</th></tr></thead><tbody>
        ${rKeys.map(k => {
          const r = stats.resources[k];
          const avgR = (r.total / r.count).toFixed(1);
          return `<tr><td>${k}</td><td>${r.count}</td><td>${r.total}</td><td>${avgR}</td></tr>`;
        }).join('')}
      </tbody></table>`;
    } else {
      rt.innerHTML = '<p class="stats-bar-empty">No resource requirements in any card.</p>';
    }

    /* Type / Form Distribution */
    const tc = document.getElementById('stats-type-chart');
    const typeKeys = Object.keys(stats.typeDist).sort();
    const formKeys = Object.keys(stats.formDist).sort();
    const maxType = Math.max(1, ...typeKeys.map(k=>stats.typeDist[k]));
    const maxForm = Math.max(1, ...formKeys.map(k=>stats.formDist[k]));
    let typeHtml = '';
    if (typeKeys.length) {
      typeHtml += '<h4 style="color:#8899bb;font-size:13px;margin:6px 0 4px">Types</h4>';
      typeHtml += typeKeys.map(k =>
        `<div class="stats-bar-row"><span class="stats-bar-label">${k}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(stats.typeDist[k]/maxType*100).toFixed(0)}%"></div></div><span class="stats-bar-count">${stats.typeDist[k]}</span></div>`
      ).join('');
    }
    if (stats.noType) typeHtml += `<div style="font-size:11px;color:#667;margin-top:2px">${stats.noType} card(s) without type</div>`;
    if (formKeys.length) {
      typeHtml += '<h4 style="color:#8899bb;font-size:13px;margin:10px 0 4px">Forms</h4>';
      typeHtml += formKeys.map(k =>
        `<div class="stats-bar-row"><span class="stats-bar-label">${k}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(stats.formDist[k]/maxForm*100).toFixed(0)}%"></div></div><span class="stats-bar-count">${stats.formDist[k]}</span></div>`
      ).join('');
    }
    if (stats.noForm) typeHtml += `<div style="font-size:11px;color:#667;margin-top:2px">${stats.noForm} card(s) without form</div>`;
    tc.innerHTML = typeHtml || '<p class="stats-bar-empty">No type/form data.</p>';
  },

  getStatFilters() {
    const allChecked = document.querySelector('.stats-filter-level[value="all"]')?.checked;
    let levels = [];
    if (!allChecked) {
      document.querySelectorAll('.stats-filter-level:checked').forEach(cb => {
        if (cb.value !== 'all') levels.push(cb.value);
      });
    }
    const printed = document.querySelector('input[name="stats-printed"]:checked')?.value || 'all';
    const display = {};
    document.querySelectorAll('.stats-display').forEach(cb => { display[cb.value] = cb.checked; });
    return { levels, allChecked, printed, display };
  },

  buildStatsLevelList() {
    const list = document.getElementById('stats-level-list');
    if (!list) return;
    /* Remove existing level-only checkboxes (keep the "All" one) */
    list.querySelectorAll('.stats-filter-level[value]:not([value="all"])').forEach(el => el.parentElement.remove());
    for (let i = 1; i <= this.maxLevel; i++) {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" class="stats-filter-level" value="${i}" checked> Level ${i}`;
      list.appendChild(label);
    }
    /* Wire "All" checkbox to toggle all others */
    const allCb = list.querySelector('.stats-filter-level[value="all"]');
    if (allCb) {
      allCb.onchange = () => {
        const checked = allCb.checked;
        list.querySelectorAll('.stats-filter-level[value]:not([value="all"])').forEach(cb => cb.checked = checked);
      };
    }
  },

  computeStatsFor(cards) {
    const s = {
      total: cards.length, printed: 0, unprinted: 0,
      levelDist: {}, levelTotal: 0,
      atkNums: [], atkDice: {}, defNums: [], defDice: {}, manaNums: [], manaDice: {},
      resources: {}, typeDist: {}, formDist: {}, noType: 0, noForm: 0
    };
    for (const c of cards) {
      if (c.printed === 'yes') s.printed++; else s.unprinted++;
      if (c.showLevel && c.level) { s.levelDist[c.level] = (s.levelDist[c.level] || 0) + 1; s.levelTotal++; }
      const proc = (v, nums, dice) => {
        if (typeof v === 'string' && /^d\d+$/.test(v)) dice[v] = (dice[v] || 0) + 1;
        else if (typeof v === 'number' && v !== 0) nums.push(v);
      };
      proc(c.attack, s.atkNums, s.atkDice);
      proc(c.defence, s.defNums, s.defDice);
      proc(c.mana, s.manaNums, s.manaDice);
      for (const [n, cnt] of Object.entries(c.resources)) {
        if (!s.resources[n]) s.resources[n] = { total: 0, count: 0 };
        s.resources[n].total += cnt; s.resources[n].count++;
      }
      const t = c.card_type || ''; if (t) s.typeDist[t] = (s.typeDist[t] || 0) + 1; else s.noType++;
      const f = c.card_form || ''; if (f) s.formDist[f] = (s.formDist[f] || 0) + 1; else s.noForm++;
    }
    return s;
  },

   /* ================================================================
      PROJECT IMPORT / EXPORT (ZIP)
      ================================================================ */

   handleAssetUpload(category, e) {
     const files = e.target.files;
     if (!files || !files.length) return;
     for (const f of files) {
       const reader = new FileReader();
       reader.onload = ev => {
         const key = `${category}/${f.name}`;
         this.assets[key] = ev.target.result;
         if (category === 'pictures') {
           const card = this.cards[this.currentIndex];
           if (card) { card.card_picture = f.name.replace(/\.[^.]+$/, ''); this.showCard(this.currentIndex); }
         }
         this.refreshAllAssetGrids();
       };
       reader.readAsDataURL(f);
     }
     e.target.value = '';
   },

   clearAssetField(field) {
     const card = this.cards[this.currentIndex];
     if (!card) return;
     if (field === 'ce-picture') { card.card_picture = ''; this.showCard(this.currentIndex); }
     else if (field === 'ce-background') { card.background = ''; document.getElementById('ce-background').value = ''; this.applyEditorToCard(); }
     else if (field === 'ce-type-icon') { card.type_icon = ''; document.getElementById('ce-type-icon').value = ''; this.applyEditorToCard(); }
     else if (field === 'ce-card-back') { card.card_back = ''; document.getElementById('ce-card-back').value = ''; this.applyEditorToCard(); }
   },

   clearGlobalBack() {
     Object.keys(this.assets).filter(k => k.startsWith('backs/')).forEach(k => delete this.assets[k]);
     this.refreshAllAssetGrids();
     this.setStatus('Global card backs cleared');
   },

   refreshAssetGrid(category, gridId) {
     const grid = document.getElementById(gridId);
     if (!grid) return;
     grid.innerHTML = '';
     const keys = Object.keys(this.assets).filter(k => k.startsWith(category + '/')).sort();
     if (!keys.length) { grid.innerHTML = '<div class="asset-grid-empty">No assets uploaded</div>'; return; }
     for (const key of keys) {
       const name = key.slice(category.length + 1);
       const div = document.createElement('div');
       div.className = 'asset-grid-item';
       div.innerHTML = `<img src="${this.assets[key]}" alt="${name}"><span class="asset-name">${name}</span><button class="asset-remove" data-key="${key}">✕</button>`;
       const rm = div.querySelector('.asset-remove');
       rm.onclick = () => { delete this.assets[key]; this.refreshAllAssetGrids(); if (this.cards.length) this.showCard(this.currentIndex); };
       grid.appendChild(div);
     }
   },

   refreshAllAssetDropdowns() {
     const populate = (selId, prefix) => {
       const sel = document.getElementById(selId);
       if (!sel) return;
       const current = sel.value;
       sel.innerHTML = '<option value="">(none)</option>';
       const keys = Object.keys(this.assets).filter(k => k.startsWith(prefix)).sort();
       for (const key of keys) {
         const full = key.slice(prefix.length);
         const name = full.replace(/\.[^.]+$/, '');
         const o = document.createElement('option');
         o.value = name; o.textContent = full;
         sel.appendChild(o);
       }
       if (current) sel.value = current;
     };
     populate('ce-type-icon', 'icons/types/');
     populate('ce-background', 'backgrounds/');
     populate('ce-card-back', 'backs/');
   },

   buildSectionEditor() {
    /* No static setup needed; sections are built dynamically */
  },

  syncEditorToCard(index) {
    const card = this.cards[index];
    if (!card) {
      document.getElementById('ce-name').value = '';
      this.syncDiceField('ce-mana', 0);
      this.syncDiceField('ce-attack', 0);
      this.syncDiceField('ce-defence', 0);
      document.getElementById('ce-resources').value = '';
      document.getElementById('ce-show-level').checked = true;
      document.getElementById('ce-level').value = 1;
      document.getElementById('ce-level').hidden = false;
      document.getElementById('ce-printed').value = 'yes';
      document.getElementById('ce-amount').value = 1;
      document.getElementById('ce-type').value = '';
      document.getElementById('ce-form').value = '';
      document.getElementById('ce-picture-name').textContent = '(none)';
      this.renderEditorSections(this.defaultSections());
      return;
    }
    document.getElementById('ce-name').value = card.card_name || '';
    this.syncDiceField('ce-mana', card.mana);
    this.syncDiceField('ce-attack', card.attack);
    this.syncDiceField('ce-defence', card.defence);
    /* Resources */
    const resParts = [];
    for (const [name, count] of Object.entries(card.resources || {})) {
      if (count > 0) resParts.push(`${name}:${count}`);
    }
    document.getElementById('ce-resources').value = resParts.join(', ');
    const showLevel = card.showLevel !== false;
    document.getElementById('ce-show-level').checked = showLevel;
    document.getElementById('ce-level').value = card.level || 1;
    document.getElementById('ce-level').hidden = !showLevel;
    document.getElementById('ce-printed').value = card.printed || 'yes';
    document.getElementById('ce-amount').value = card.amount || 1;
    document.getElementById('ce-type').value = card.card_type || '';
    document.getElementById('ce-form').value = card.card_form || '';
    /* Dropdowns */
    this.refreshAllAssetDropdowns();
    const setDropdown = (id, val) => { const s = document.getElementById(id); if (s) s.value = val || ''; };
    setDropdown('ce-type-icon', card.type_icon);
    setDropdown('ce-background', card.background);
    setDropdown('ce-card-back', card.card_back);
    /* Picture name */
    document.getElementById('ce-picture-name').textContent = card.card_picture || '(none)';
    /* Sections */
    this.renderEditorSections(card.sections || this.defaultSections());
  },

  renderEditorSections(sections) {
    const list = document.getElementById('ce-sections-list');
    list.innerHTML = '';
    for (let i = 0; i < sections.length; i++) {
      this.appendSectionEditor(list, sections[i], i);
    }
  },

  appendSectionEditor(list, sec, index) {
    const div = document.createElement('div');
    div.className = 'ce-section';
    div.dataset.index = index;
    const hasHeader = sec && sec.header && sec.header.text;
    div.innerHTML = `
      <div class="ce-section-header-row">
        <label><input type="checkbox" class="ce-section-has-header" ${hasHeader ? 'checked' : ''}> Header</label>
        <button class="ce-section-remove" title="Remove section">✕</button>
      </div>
      <input type="text" class="ce-section-header-text" placeholder="Header text" value="${this.escHtml(hasHeader ? sec.header.text : '')}" style="${hasHeader ? '' : 'display:none'}">
      <textarea class="ce-section-body-text" placeholder="Body text" rows="2">${this.escHtml(sec ? sec.body.text : '')}</textarea>
      <button class="ce-section-style-toggle">Style ⚙</button>
      <div class="ce-section-style-panel">
        <div class="ce-section-style-group">
          <strong>Section BG</strong>
          <label>Background Color <input type="color" class="ce-bg-color" value="${sec && sec.bg_color ? sec.bg_color : '#fffff0'}"></label>
          <label>Opacity <span class="ce-bg-opacity-val">${sec && sec.bg_opacity != null ? sec.bg_opacity : 70}</span>%
            <input type="range" class="ce-bg-opacity" min="0" max="100" value="${sec && sec.bg_opacity != null ? sec.bg_opacity : 70}"></label>
        </div>
        <div class="ce-section-style-group">
          <label><input type="checkbox" class="ce-override-styles" ${sec && sec.override ? 'checked' : ''}> Override defaults</label>
        </div>
        <div class="ce-section-style-group">
          <strong>Header Style</strong>
          <label>Font <select class="ce-sh-font">
            <option value="">Default</option>
            <option value="'Cinzel', serif">Cinzel</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Open Sans', sans-serif">Open Sans</option>
          </select></label>
          <label>Size <input type="number" class="ce-sh-size" min="0" max="80" placeholder="auto"></label>
          <label>Color <input type="color" class="ce-sh-color" value="${sec && sec.header && sec.header.color ? sec.header.color : '#ffffff'}"></label>
          <label>Weight <select class="ce-sh-weight">
            <option value="">Default</option>
            <option value="400">Normal</option>
            <option value="600">Semi Bold</option>
            <option value="700">Bold</option>
          </select></label>
        </div>
        <div class="ce-section-style-group" style="margin-top:4px">
          <strong>Body Style</strong>
          <label>Font <select class="ce-sb-font">
            <option value="">Default</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Cinzel', serif">Cinzel</option>
            <option value="'Open Sans', sans-serif">Open Sans</option>
          </select></label>
          <label>Size <input type="number" class="ce-sb-size" min="0" max="80" placeholder="auto"></label>
          <label>Color <input type="color" class="ce-sb-color" value="${sec && sec.body.color ? sec.body.color : '#ffffff'}"></label>
          <label>Weight <select class="ce-sb-weight">
            <option value="">Default</option>
            <option value="400">Normal</option>
            <option value="600">Semi Bold</option>
            <option value="700">Bold</option>
          </select></label>
        </div>
      </div>`;
    /* Set existing values */
    if (sec) {
      if (sec.header) {
        const hf = div.querySelector('.ce-sh-font');
        if (sec.header.font) hf.value = sec.header.font;
        const hs = div.querySelector('.ce-sh-size');
        if (sec.header.size) hs.value = sec.header.size;
        const hw = div.querySelector('.ce-sh-weight');
        if (sec.header.weight) hw.value = sec.header.weight;
      }
      const bf = div.querySelector('.ce-sb-font');
      if (sec.body.font) bf.value = sec.body.font;
      const bs = div.querySelector('.ce-sb-size');
      if (sec.body.size) bs.value = sec.body.size;
      const bw = div.querySelector('.ce-sb-weight');
      if (sec.body.weight) bw.value = sec.body.weight;
    }
    /* Events */
    div.querySelector('.ce-section-remove').onclick = () => {
      div.remove();
      this.applyEditorToCard();
    };
    div.querySelector('.ce-section-has-header').onchange = function() {
      const ht = div.querySelector('.ce-section-header-text');
      ht.style.display = this.checked ? '' : 'none';
      if (!this.checked) ht.value = '';
    };
    div.querySelector('.ce-section-style-toggle').onclick = function() {
      const panel = div.querySelector('.ce-section-style-panel');
      panel.classList.toggle('open');
    };
    /* Auto-apply on text change — update card data + preview only, skip editor rebuild */
    div.querySelector('.ce-section-header-text').oninput = () => {
      const card = this.cards[this.currentIndex];
      if (card) { card.sections = this.readEditorSections(); this.refreshPreview(this.currentIndex); }
    };
    div.querySelector('.ce-section-body-text').oninput = () => {
      const card = this.cards[this.currentIndex];
      if (card) { card.sections = this.readEditorSections(); this.refreshPreview(this.currentIndex); }
    };
    div.querySelectorAll('select, input[type="number"], input[type="color"]').forEach(el => {
      el.onchange = () => this.applyEditorToCard();
    });
    div.querySelector('.ce-override-styles').onchange = () => this.applyEditorToCard();
    const opacitySlider = div.querySelector('.ce-bg-opacity');
    const opacityVal = div.querySelector('.ce-bg-opacity-val');
    opacitySlider.oninput = () => { opacityVal.textContent = opacitySlider.value; };
    opacitySlider.onchange = () => { opacityVal.textContent = opacitySlider.value; this.applyEditorToCard(); };
    list.appendChild(div);
  },

  addEditorSection() {
    const list = document.getElementById('ce-sections-list');
    this.appendSectionEditor(list, { override: false, bg_color: '', bg_opacity: 70, header: null, body: { text: '', font: '', size: 0, color: '', weight: '' } }, list.children.length);
    this.applyEditorToCard();
  },

  readEditorSections() {
    const sections = [];
    document.querySelectorAll('#ce-sections-list .ce-section').forEach(div => {
      const hasHeader = div.querySelector('.ce-section-has-header').checked;
      const hText = hasHeader ? div.querySelector('.ce-section-header-text').value : '';
      const bText = div.querySelector('.ce-section-body-text').value;
      const bgColor = div.querySelector('.ce-bg-color').value;
      const bgOpacity = parseInt(div.querySelector('.ce-bg-opacity').value, 10);
      const override = div.querySelector('.ce-override-styles').checked;
      const sec = { override, bg_color: bgColor, bg_opacity: bgOpacity, header: null, body: { text: bText, font: '', size: 0, color: '', weight: '' } };
      if (hasHeader && hText.trim()) {
        sec.header = {
          text: hText,
          font: div.querySelector('.ce-sh-font').value || '',
          size: parseInt(div.querySelector('.ce-sh-size').value, 10) || 0,
          color: div.querySelector('.ce-sh-color').value || '',
          weight: div.querySelector('.ce-sh-weight').value || ''
        };
      }
      const bf = div.querySelector('.ce-sb-font').value;
      if (bf) sec.body.font = bf;
      const bs = parseInt(div.querySelector('.ce-sb-size').value, 10);
      if (bs) sec.body.size = bs;
      const bc = div.querySelector('.ce-sb-color').value;
      if (bc) sec.body.color = bc;
      const bw = div.querySelector('.ce-sb-weight').value;
      if (bw) sec.body.weight = bw;
      sections.push(sec);
    });
    return sections;
  },

  diceFontScale() { return parseFloat(this.cssVar('--dice-font-scale')) || 0.75; },

  isDiceValue(val) { return typeof val === 'string' && /^d\d+$/.test(val); },

  readDiceField(id) {
    const cb = document.querySelector(`.ce-dice-cb[data-target="${id}"]`);
    if (cb && cb.checked) {
      const diceEl = document.getElementById(id + '-dice');
      return diceEl ? diceEl.value : 0;
    }
    return parseInt(document.getElementById(id).value, 10) || 0;
  },

  syncDiceField(id, val) {
    const numEl = document.getElementById(id);
    const diceEl = document.getElementById(id + '-dice');
    const cb = document.querySelector(`.ce-dice-cb[data-target="${id}"]`);
    if (!numEl || !diceEl || !cb) return;
    if (this.isDiceValue(val)) {
      cb.checked = true;
      numEl.hidden = true;
      diceEl.hidden = false;
      diceEl.value = val;
      numEl.value = 0;
    } else {
      cb.checked = false;
      diceEl.hidden = true;
      numEl.hidden = false;
      numEl.value = val || 0;
    }
  },

  toggleDiceField(cb) {
    const target = cb.dataset.target;
    const numEl = document.getElementById(target);
    const diceEl = document.getElementById(target + '-dice');
    if (!numEl || !diceEl) return;
    if (cb.checked) {
      numEl.hidden = true;
      diceEl.hidden = false;
      if (!diceEl.value) diceEl.value = 'd6';
    } else {
      diceEl.hidden = true;
      numEl.hidden = false;
    }
    this.applyEditorToCard();
  },

  toggleLevelField() {
    const cb = document.getElementById('ce-show-level');
    const numEl = document.getElementById('ce-level');
    if (!cb || !numEl) return;
    if (cb.checked) {
      numEl.hidden = false;
      if (numEl.value === '0') numEl.value = '1';
    } else {
      numEl.hidden = true;
    }
    this.applyEditorToCard();
  },

  applyEditorToCard() {
    if (!this.cards.length) return;
    if (this.currentIndex >= this.cards.length) this.currentIndex = this.cards.length - 1;
    const card = this.cards[this.currentIndex];
    if (!card) return;
    card.card_name = document.getElementById('ce-name').value;
    card.mana = this.readDiceField('ce-mana');
    card.attack = this.readDiceField('ce-attack');
    card.defence = this.readDiceField('ce-defence');
    /* Resources */
    const resStr = document.getElementById('ce-resources').value;
    const resources = {};
    resStr.split(',').forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;
      const [name, countStr] = trimmed.split(':');
      const count = parseInt(countStr, 10);
      if (name.trim() && count > 0) resources[name.trim()] = count;
    });
    card.resources = resources;
    card.level = parseInt(document.getElementById('ce-level').value, 10) || 1;
    card.showLevel = document.getElementById('ce-show-level').checked;
    card.printed = document.getElementById('ce-printed').value;
    card.amount = parseInt(document.getElementById('ce-amount').value, 10) || 1;
    card.card_type = document.getElementById('ce-type').value;
    card.card_form = document.getElementById('ce-form').value;
    card.type_icon = document.getElementById('ce-type-icon').value;
    card.background = document.getElementById('ce-background').value;
    card.card_back = document.getElementById('ce-card-back').value;
    card.sections = this.readEditorSections();
    this.refreshCardSelect();
    this.refreshPreview(this.currentIndex);
  },

  refreshCardSelect() {
    const sel = document.getElementById('card-select');
    const idx = sel.selectedIndex;
    sel.options[sel.selectedIndex].textContent = this.cards[this.currentIndex].card_name || `Card ${this.currentIndex+1}`;
  },

  escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  },

  /* ================================================================
     LEVEL UI
     ================================================================ */

  buildLevelUI() {
    const grid = document.getElementById('level-grid');
    grid.innerHTML = '';
    for (let i = 1; i <= this.maxLevel; i++) {
      const clr = this.levelColors[i] || '#909090';
      const d = document.createElement('div');
      d.className = 'level-item';
      d.innerHTML = `<label>Level ${i}</label><input type="color" value="${clr}" data-level="${i}"><span class="color-hex">${clr}</span>`;
      const inp = d.querySelector('input'), hex = d.querySelector('.color-hex');
      inp.oninput = () => { this.levelColors[i] = inp.value; hex.textContent = inp.value; this.applyLevel(); };
      grid.appendChild(d);
    }
    const btnDiv = document.createElement('div');
    btnDiv.className = 'btn-row';
    btnDiv.innerHTML = '<button id="add-level-btn">+ Add Level</button><button id="remove-level-btn">− Remove Last</button>';
    grid.appendChild(btnDiv);
    document.getElementById('add-level-btn').onclick = () => {
      this.maxLevel++;
      if (!this.levelColors[this.maxLevel]) {
        const defaults = ['#909090','#2ecc71','#3498db','#9b59b6','#e67e22','#2c003c','#e74c3c','#1abc9c','#f39c12','#27ae60','#2980b9','#8e44ad','#d35400','#c0392b','#16a085','#2c3e50','#7f8c8d','#f1c40f','#e91e63','#00bcd4'];
        this.levelColors[this.maxLevel] = defaults[(this.maxLevel - 1) % defaults.length];
      }
      this.buildLevelUI();
      this.applyLevel();
    };
    document.getElementById('remove-level-btn').onclick = () => {
      if (this.maxLevel <= 1) return;
      delete this.levelColors[this.maxLevel];
      this.maxLevel--;
      this.buildLevelUI();
      this.applyLevel();
    };
    this.buildStatsLevelList();
  },

  /* ================================================================
     EDITOR CONTROLS (Layout, Style, CSS sliders)
     ================================================================ */

  buildEditorControls() {
    document.querySelectorAll('#tab-layout input[type="range"], #tab-style input[type="range"]').forEach(i => { i.oninput = () => this.updateCSSVar(i); });
    document.querySelectorAll('#tab-style input[type="color"]').forEach(i => { i.oninput = () => this.updateCSSVar(i); });
    document.querySelectorAll('#tab-style select').forEach(s => { s.onchange = () => this.updateCSSVar(s); });
  },

  updateCSSVar(el) {
    let val = el.value;
    if (el.dataset.suffix) val += el.dataset.suffix;
    document.documentElement.style.setProperty(el.dataset.var, val);
    const d = el.parentElement.querySelector('.val');
    if (d && el.type === 'range') d.textContent = el.value;
    this.syncVarToEditor(el.dataset.var, val);
    if (el.dataset.var === '--top-bar-bg-color' || el.dataset.var === '--top-bar-opacity') this.updateTopBarBg();
    if (el.dataset.var === '--type-bar-bg-color' || el.dataset.var === '--type-bar-opacity') this.updateTypeBarBg();
    if (el.dataset.var === '--text-icon-scale') this.refreshPreview(this.currentIndex);
  },

  updateTopBarBg() {
    const hex = this.cssVar('--top-bar-bg-color') || '#000000';
    const opacity = parseFloat(this.cssVar('--top-bar-opacity')) / 100 || 0.3;
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const rgba = `rgba(${r},${g},${b},${opacity})`;
    document.documentElement.style.setProperty('--top-bar-bg', rgba);
    this.syncVarToEditor('--top-bar-bg', rgba);
  },

  updateTypeBarBg() {
    const hex = this.cssVar('--type-bar-bg-color') || '#000000';
    const opacity = parseFloat(this.cssVar('--type-bar-opacity')) / 100 || 0.4;
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const rgba = `rgba(${r},${g},${b},${opacity})`;
    document.documentElement.style.setProperty('--type-bar-bg', rgba);
    this.syncVarToEditor('--type-bar-bg', rgba);
  },

  syncVarToEditor(varName, val) {
    const editor = document.getElementById('css-editor');
    if (!editor || !editor.value) return;
    const regex = new RegExp(`(${this.escapeRegex(varName)}:\\s*)[^;]+;`);
    editor.value = editor.value.replace(regex, `$1${val};`);
  },

  escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },

  applyCustomCSS() { document.getElementById('custom-css-block').textContent = document.getElementById('css-editor').value; this.setStatus('Custom CSS applied'); },

  syncSlidersFromCSS() {
    const css = document.getElementById('css-editor').value;
    if (!css) return;
    document.querySelectorAll('input[data-var], select[data-var]').forEach(el => {
      const varName = el.dataset.var;
      const regex = new RegExp(`${this.escapeRegex(varName)}\\s*:\\s*([^;]+);`);
      const match = css.match(regex);
      if (match) {
        let val = match[1].trim();
        if (el.dataset.suffix) val = val.replace(el.dataset.suffix, '');
        el.value = val;
        const d = el.parentElement.querySelector('.val');
        if (d && el.type === 'range') d.textContent = val;
      }
      this.updateCSSVar(el);
    });
  },

  resetCSS() {
    document.getElementById('css-editor').value = this.defaultCardCSS;
    document.getElementById('custom-css-block').textContent = '';
    const root = document.documentElement;
    ['--card-radius','--section-pad','--top-bar-h','--picture-h','--type-bar-h','--text-bottom',
      '--name-family','--name-size','--name-color','--top-bar-bg','--top-bar-bg-color','--top-bar-opacity','--type-bar-bg','--type-bar-bg-color','--type-bar-opacity','--type-family','--type-size','--type-color',
      '--section-header-family','--section-header-size','--section-header-color','--section-header-weight',
      '--section-body-family','--section-body-size','--section-body-color','--section-body-weight',
      '--mana-size','--mana-circle-size','--mana-bg-top','--mana-bg-bottom',
      '--resource-icon-size','--type-icon-size','--text-icon-scale',
      '--atkdef-size','--atkdef-circle-size','--atkdef-bg-top','--atkdef-bg-bottom'].forEach(v => root.style.removeProperty(v));
    const defs = {'--card-radius':'12','--section-pad':'10','--top-bar-h':'46','--picture-h':'400','--type-bar-h':'36','--text-bottom':'56','--name-size':'22','--name-color':'#ffffff','--top-bar-bg':'rgba(0,0,0,0.3)','--top-bar-bg-color':'#000000','--top-bar-opacity':'30','--type-bar-bg':'rgba(0,0,0,0.4)','--type-bar-bg-color':'#000000','--type-bar-opacity':'40','--type-size':'16','--type-color':'#ffffff','--section-header-size':'15','--section-header-color':'#ffffff','--section-header-weight':'700','--section-body-size':'13','--section-body-color':'#ffffff','--section-body-weight':'400','--mana-size':'18','--mana-circle-size':'34','--mana-bg-top':'#6ab0f7','--mana-bg-bottom':'#1a4a8a','--resource-icon-size':'28','--type-icon-size':'26','--text-icon-scale':'1','--atkdef-size':'26','--atkdef-circle-size':'44','--atkdef-bg-top':'#e8c878','--atkdef-bg-bottom':'#8a6a2a'};
    document.querySelectorAll('input[data-var]').forEach(el => {
      if (defs[el.dataset.var] !== undefined) { if (el.type === 'range' || el.type === 'color') el.value = defs[el.dataset.var]; const d = el.parentElement.querySelector('.val'); if (d && el.type === 'range') d.textContent = el.value; }
    });
    document.querySelectorAll('select[data-var]').forEach(s => {
      if (s.dataset.var === '--name-family') s.value = "'Cinzel', serif";
      if (s.dataset.var === '--type-family') s.value = "'Cinzel', serif";
      if (s.dataset.var === '--section-header-family') s.value = "'Cinzel', serif";
      if (s.dataset.var === '--section-body-family') s.value = "Georgia, serif";
    });
    this.syncSlidersFromCSS();
    this.setStatus('CSS reset to default');
  },

  validateResources() {
    const el = document.getElementById('ce-resources');
    const val = el.value.trim();
    if (!val) { el.classList.remove('ce-invalid'); return; }
    const parts = val.split(',').map(s => s.trim()).filter(Boolean);
    let valid = true;
    for (const p of parts) {
      if (!/^[a-zA-Z0-9_]+:\d+$/.test(p)) { valid = false; break; }
    }
    el.classList.toggle('ce-invalid', !valid);
  },

  /* ================================================================
     INLINE ICONS
     ================================================================ */

  resolveInlineIconUrl(name) {
    for (const cat of ['icons/actions', 'icons/resources', 'icons/types']) {
      for (const ext of this.assetExts) {
        const key = `${cat}/${name}.${ext}`;
        if (this.assets[key]) return this.assets[key];
      }
      const direct = `${cat}/${name}`;
      if (this.assets[direct]) return this.assets[direct];
    }
    return null;
  },

  inlineIconsHtml(text, fontSize) {
    if (!text || !text.includes('<')) return this.escHtml(text || '');
    const scale = this.cssPx('--text-icon-scale') || 1;
    const size = (fontSize || 13) * scale;
    let html = this.escHtml(text);
    html = html.replace(/&lt;([^&]+)&gt;/g, (m, name) => {
      const url = this.resolveInlineIconUrl(name.trim());
      return url ? `<img class="card-text-icon" src="${url}" style="height:${size}px;width:${size}px" alt="">` : m;
    });
    return html;
  },

  /** Split text into segments at <name> markers. Returns [{type:'text',text}|{type:'icon',name}] */
  parseInlineSegments(text) {
    if (!text || !text.includes('<')) return [{ type: 'text', text }];
    const segs = [];
    let last = 0;
    const re = /<([^>]+)>/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) segs.push({ type: 'text', text: text.slice(last, m.index) });
      segs.push({ type: 'icon', name: m[1].trim() });
      last = re.lastIndex;
    }
    if (last < text.length) segs.push({ type: 'text', text: text.slice(last) });
    return segs;
  },

  /* ---- Canvas inline icon helpers ---- */
  async _preloadInlineIcons(text) {
    if (!text || !text.includes('<')) return;
    const re = /<([^>]+)>/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim();
      if (this._inlineIconCache[name]) continue;
      let img = await this.preloadAsset('icons/actions', name);
      if (!img) img = await this.preloadAsset('icons/resources', name);
      if (!img) img = await this.preloadAsset('icons/types', name);
      if (img) this._inlineIconCache[name] = img;
    }
  },

  _getInlineIcon(name) {
    return this._inlineIconCache[name] || null;
  },

  _tokenizeWithIcons(text, size) {
    if (!text) return [];
    const scale = this.cssPx('--text-icon-scale') || 1;
    const iconSize = size * scale;
    if (!text.includes('<')) {
      return text.split('\n').map(line => ({ kind: 'text', text: line }));
    }
    const paragraphs = text.split('\n');
    const tokens = [];
    for (let p = 0; p < paragraphs.length; p++) {
      if (p > 0) tokens.push({ kind: 'newline' });
      const segs = this.parseInlineSegments(paragraphs[p]);
      for (const s of segs) {
        if (s.type === 'text') {
          tokens.push({ kind: 'text', text: s.text });
        } else {
          tokens.push({ kind: 'icon', name: s.name, width: iconSize });
        }
      }
    }
    return tokens;
  },

  _wrapTokens(ctx, tokens, maxWidth, font, size, weight) {
    ctx.font = `${weight || 400} ${size}px ${font}`;
    const lines = [];
    let curLine = [], curW = 0;
    const spaceW = ctx.measureText(' ').width;
    for (const t of tokens) {
      if (t.kind === 'newline') {
        if (curLine.length) { lines.push(curLine); curLine = []; curW = 0; }
        continue;
      }
      if (t.kind === 'text') {
        const words = t.text.split(' ');
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          if (i > 0) {
            if (curW + spaceW > maxWidth && curLine.length) {
              lines.push(curLine); curLine = []; curW = 0;
            }
            if (curLine.length) { curLine.push({ kind: 'space' }); curW += spaceW; }
          }
          if (!w) continue;
          const ww = ctx.measureText(w).width;
          if (curW + ww > maxWidth && curLine.length) {
            lines.push(curLine); curLine = []; curW = 0;
          }
          curLine.push({ kind: 'word', text: w, width: ww }); curW += ww;
        }
      } else if (t.kind === 'icon') {
        if (curW + t.width > maxWidth && curLine.length) {
          lines.push(curLine); curLine = []; curW = 0;
        }
        curLine.push({ kind: 'icon', name: t.name, width: t.width }); curW += t.width;
      }
    }
    if (curLine.length) lines.push(curLine);
    return lines;
  },

  _measureTokenLines(lines, size) {
    return lines.length * size * 1.3;
  },

  _drawTokenLines(ctx, lines, x, y, size, color) {
    ctx.fillStyle = color; ctx.textBaseline = 'top';
    const lh = size * 1.3;
    let curY = y;
    for (const line of lines) {
      let curX = x;
      for (const t of line) {
        if (t.kind === 'word') { ctx.fillText(t.text, curX, curY); curX += t.width; }
        else if (t.kind === 'space') { curX += ctx.measureText(' ').width; }
        else if (t.kind === 'icon') {
          const img = this._getInlineIcon(t.name);
          if (img) ctx.drawImage(img, curX, curY, t.width, t.width);
          curX += t.width;
        }
      }
      curY += lh;
    }
  },

  /* ================================================================
     CARD DISPLAY (HTML Preview)
     ================================================================ */

  refreshPreview(dataOrIndex) {
    const el = document.getElementById('card');
    const card = typeof dataOrIndex === 'number' ? this.cards[dataOrIndex] : dataOrIndex;
    if (!card) {
      el.querySelector('.card-name').textContent = 'Card Name';
      el.querySelector('.card-cost').innerHTML = '';
      el.querySelector('.card-picture img').src = '';
      el.querySelector('.card-type-text').textContent = 'Type – Form';
      el.querySelector('.card-type-icon').src = '';
      const ts = el.querySelector('.card-text-section');
      ts.innerHTML = '<div class="card-section-block"><div class="card-section-body">Card preview</div></div>';
      el.style.backgroundImage = ''; el.className = 'card';
      const ad0 = el.querySelector('.card-atk-def'); ad0.innerHTML = '';
      ad0.style.display = ''; const a0 = document.createElement('span'); a0.className = 'atk'; a0.textContent = '0'; ad0.appendChild(a0); const d0 = document.createElement('span'); d0.className = 'def'; d0.textContent = '0'; ad0.appendChild(d0);
      const lv0 = el.querySelector('.card-level'); if (lv0) { lv0.innerHTML = ''; const ls = document.createElement('span'); ls.className = 'level-circle'; ls.textContent = '1'; lv0.appendChild(ls); lv0.style.display = ''; }
      this.updateNav();
      return;
    }
    el.querySelector('.card-name').innerHTML = this.inlineIconsHtml(card.card_name || '');
    const costEl = el.querySelector('.card-cost'); costEl.innerHTML = '';
    if (card.mana) { const m = document.createElement('span'); m.className = this.isDiceValue(card.mana) ? 'mana-square' : 'mana-circle'; m.textContent = card.mana; costEl.appendChild(m); }
    for (const [resName, resCount] of Object.entries(card.resources || {})) {
      for (let i = 0; i < resCount; i++) {
        const img = document.createElement('img'); img.className = 'resource-icon';
        this.setImgAsset(img, 'icons/resources', resName, () => { img.style.display = 'none'; });
        costEl.appendChild(img);
      }
    }
    const pi = el.querySelector('.card-picture img');
    if (card.card_picture) { this.setImgAsset(pi, 'pictures', card.card_picture, () => { pi.src = ''; }); pi.alt = card.card_name || ''; } else { pi.src = ''; }
    const tp = [card.card_type, card.card_form].filter(Boolean);
    el.querySelector('.card-type-text').textContent = tp.join(' – ') || 'Type – Form';
    const ti = el.querySelector('.card-type-icon');
    if (card.type_icon) { this.setImgAsset(ti, 'icons/types', card.type_icon, () => { this.setImgAsset(ti, 'icons/resources', card.type_icon, () => { ti.style.display = 'none'; }); }); ti.style.display = ''; } else { ti.src = ''; ti.style.display = 'none'; }
    const sections = card.sections || this.defaultSections();
    this.renderPreviewSections(el, sections);
    const atkDefEl = el.querySelector('.card-atk-def'); atkDefEl.innerHTML = '';
    if (card.attack || card.defence) {
      atkDefEl.style.display = '';
      const atkEl = document.createElement('span'); atkEl.className = this.isDiceValue(card.attack) ? 'atk atk-square' : 'atk'; atkEl.textContent = card.attack ?? '0'; atkDefEl.appendChild(atkEl);
      const defEl = document.createElement('span'); defEl.className = this.isDiceValue(card.defence) ? 'def def-square' : 'def'; defEl.textContent = card.defence ?? '0'; atkDefEl.appendChild(defEl);
    } else {
      atkDefEl.style.display = 'none';
    }
    const lvlEl = el.querySelector('.card-level');
    if (lvlEl) {
      lvlEl.innerHTML = '';
      if (card.showLevel && card.level) {
        const ls = document.createElement('span'); ls.className = 'level-circle'; ls.textContent = card.level; lvlEl.appendChild(ls);
        lvlEl.style.display = '';
      } else {
        lvlEl.style.display = 'none';
      }
    }
    if (card.background) this.preloadAsset('backgrounds', card.background).then(img => { if (img) el.style.backgroundImage = `url(${img.src})`; }); else el.style.backgroundImage = '';
    this.applyLevel(); this.updateNav(); this.scaleCardPreview();
    this.printPreviewDirty = true;
  },

  showCard(dataOrIndex) {
    const el = document.getElementById('card');
    if (!this.cards.length) {
      el.querySelector('.card-name').textContent = 'Card Name';
      el.querySelector('.card-cost').innerHTML = '';
      el.querySelector('.card-picture img').src = '';
      el.querySelector('.card-type-text').textContent = 'Type – Form';
      el.querySelector('.card-type-icon').src = '';
      const ts = el.querySelector('.card-text-section');
      ts.innerHTML = '<div class="card-section-block"><div class="card-section-body">Add a card to start</div></div>';
      el.style.backgroundImage = ''; el.className = 'card';
      const ad2 = el.querySelector('.card-atk-def'); ad2.innerHTML = '';
      ad2.style.display = ''; const a2 = document.createElement('span'); a2.className = 'atk'; a2.textContent = '0'; ad2.appendChild(a2); const d2 = document.createElement('span'); d2.className = 'def'; d2.textContent = '0'; ad2.appendChild(d2);
      const lv2 = el.querySelector('.card-level'); if (lv2) { lv2.innerHTML = ''; const ls = document.createElement('span'); ls.className = 'level-circle'; ls.textContent = '1'; lv2.appendChild(ls); lv2.style.display = ''; }
      this.updateNav();
      this.syncEditorToCard(-1);
      return;
    }
    const idx = typeof dataOrIndex === 'number' ? dataOrIndex : this.cards.indexOf(dataOrIndex);
    if (idx < 0) { this.refreshPreview(null); return; }
    this.currentIndex = idx;
    this.refreshPreview(idx);
    this.syncEditorToCard(idx);
    if (document.getElementById('tab-print').classList.contains('active')) this.renderPrintPreview();
  },

  renderPreviewSections(el, sections) {
    const container = el.querySelector('.card-text-section');
    container.innerHTML = '';
    for (const sec of sections) {
      if (!sec.body.text && (!sec.header || !sec.header.text)) continue;
      const div = document.createElement('div');
      div.className = 'card-section-block';
      if (sec.override && sec.bg_color) {
        const a = sec.bg_opacity != null ? sec.bg_opacity / 100 : 0.7;
        div.style.backgroundColor = this.hexToRgba(sec.bg_color, a);
      }
      if (sec.header && sec.header.text) {
        const h = document.createElement('div');
        h.className = 'card-section-header';
        const hSize = (sec.override && sec.header.size) || this.cssPx('--section-header-size') || 15;
        h.innerHTML = this.inlineIconsHtml(sec.header.text, hSize);
        if (sec.override) {
          if (sec.header.font) h.style.fontFamily = sec.header.font;
          if (sec.header.size) h.style.fontSize = sec.header.size + 'px';
          if (sec.header.color) h.style.color = sec.header.color;
          if (sec.header.weight) h.style.fontWeight = sec.header.weight;
        }
        div.appendChild(h);
      }
      if (sec.body.text) {
        const b = document.createElement('div');
        b.className = 'card-section-body';
        const bSize = (sec.override && sec.body.size) || this.cssPx('--section-body-size') || 13;
        b.innerHTML = this.inlineIconsHtml(sec.body.text, bSize);
        if (sec.override) {
          if (sec.body.font) b.style.fontFamily = sec.body.font;
          if (sec.body.size) b.style.fontSize = sec.body.size + 'px';
          if (sec.body.color) b.style.color = sec.body.color;
          if (sec.body.weight) b.style.fontWeight = sec.body.weight;
        }
        div.appendChild(b);
      }
      container.appendChild(div);
    }
  },

  applyLevel() {
    const el = document.getElementById('card'), card = this.cards[this.currentIndex];
    if (!card) { el.className = 'card'; return; }
    const lvl = card.level || 1;
    el.className = 'card';
    el.style.boxShadow = `inset 0 0 0 5px ${this.levelColors[lvl] || this.levelColors[1] || '#909090'}`;
  },

  updateUI() {
    const has = this.cards.length > 0;
    document.getElementById('save-btn').disabled = !has;
    document.getElementById('gen-all-btn').disabled = !has;
    document.getElementById('gen-fronts-pdf-btn').disabled = !has;
    document.getElementById('gen-backs-pdf-btn').disabled = !has;
    document.getElementById('data-info').textContent = has ? `${this.cards.length} card(s) loaded` : 'No cards yet — add one below';
    if (has) {
      document.getElementById('remove-card-btn').disabled = this.cards.length <= 1;
    }
    this.updateNav();
  },

  populateCardSelect() {
    const sel = document.getElementById('card-select');
    sel.innerHTML = '';
    this.cards.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = c.card_name || `Card ${i+1}`; sel.appendChild(o); });
  },

  updateNav() {
    const t = this.cards.length, i = this.currentIndex;
    document.getElementById('card-counter').textContent = t > 0 ? `${i+1}/${t}` : '';
    document.getElementById('prev-btn').disabled = i <= 0;
    document.getElementById('next-btn').disabled = i >= t - 1;
    const s = document.getElementById('card-select');
    if (s.options.length > 0) s.value = String(i);
  },

  scaleCardPreview() {
    const p = document.getElementById('preview-panel'), c = document.getElementById('card');
    const s = Math.min((p.clientWidth-40)/600, (p.clientHeight-40)/900, 1.5);
    c.style.transform = `scale(${s})`; c.style.transformOrigin = 'center center';
  },

  /* ================================================================
     ASSET LOADING
     ================================================================ */

  async preloadAsset(cat, name) {
    if (!name) return null;
    const key = `${cat}:${name}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this._tryLoadAsset(cat, name);
    this.cache.set(key, p);
    return p;
  },

  async _tryLoadAsset(cat, name) {
    for (const ext of this.assetExts) {
      const path = `${cat}/${name}.${ext}`;
      if (this.assets[path]) {
        const img = await this._preloadURL(this.assets[path]);
        if (img) return img;
      }
    }
    const direct = `${cat}/${name}`;
    if (this.assets[direct]) {
      const img = await this._preloadURL(this.assets[direct]);
      if (img) return img;
    }
    return null;
  },

  async preloadBack() {
    if (this.cache.has('back')) return this.cache.get('back');
    const p = this._tryLoadBack();
    this.cache.set('back', p);
    return p;
  },

  async _tryLoadBack() {
    for (const ext of this.assetExts) {
      const path = `back.${ext}`;
      if (this.assets[path]) {
        const img = await this._preloadURL(this.assets[path]);
        if (img) return img;
      }
    }
    return null;
  },

  async preloadCardBack(card) {
    if (!card || !card.card_back) return this.preloadBack();
    return this.preloadAsset('backs', card.card_back);
  },

  _preloadURL(src) {
    return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  },

  setImgAsset(img, cat, name, onFail) {
    if (!name) { img.src = ''; return; }
    for (const ext of this.assetExts) {
      const path = `${cat}/${name}.${ext}`;
      if (this.assets[path]) { img.src = this.assets[path]; return; }
    }
    const direct = `${cat}/${name}`;
    if (this.assets[direct]) { img.src = this.assets[direct]; return; }
    if (onFail) onFail();
  },

  preloadCardAssets(card) {
    const p = [];
    if (card.background) p.push(this.preloadAsset('backgrounds', card.background));
    if (card.card_picture) p.push(this.preloadAsset('pictures', card.card_picture));
    if (card.type_icon) { p.push(this.preloadAsset('icons/types', card.type_icon)); p.push(this.preloadAsset('icons/resources', card.type_icon)); }
    if (card.card_back) p.push(this.preloadAsset('backs', card.card_back));
    for (const r of [...new Set(this.getResourceNames(card))]) p.push(this.preloadAsset('icons/resources', r));
    return Promise.all(p);
  },

  getResourceNames(card) {
    return Object.keys(card.resources || {});
  },

  getResourceIcons(card) {
    const icons = [];
    for (const [name, count] of Object.entries(card.resources || {})) {
      for (let i = 0; i < count; i++) icons.push(name);
    }
    return icons;
  },

  /* ================================================================
     PRINT SETTINGS
     ================================================================ */

  getPrintCards() {
    const list = [];
    for (const card of this.cards) {
      if (card.printed === 'no') continue;
      const amount = parseInt(card.amount, 10) || 1;
      for (let i = 0; i < amount; i++) list.push(card);
    }
    return list;
  },

  getPrintStartIndex() {
    const printCards = this.getPrintCards();
    if (!printCards.length) return 0;
    const currentCard = this.cards[this.currentIndex];
    const idx = printCards.indexOf(currentCard);
    return idx >= 0 ? idx : 0;
  },

  setStatus(msg) { document.getElementById('gen-status').textContent = msg; },
  showProgress(pct) { document.getElementById('progress-wrap').hidden = false; document.getElementById('progress-fill').style.width = Math.round(pct)+'%'; },
  hideProgress() { document.getElementById('progress-wrap').hidden = true; },

  buildPrintControls() {
    const ids = ['print-cols','print-rows','print-mx','print-my','print-gx','print-gy'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      el.oninput = () => {
        const valEl = document.getElementById(id+'-val');
        if (valEl) valEl.textContent = el.value;
        this.printSettings[id.replace('print-','')] = parseInt(el.value, 10);
        this.printPreviewDirty = true;
        if (document.getElementById('tab-print').classList.contains('active')) this.renderPrintPreview();
      };
    });
    ['print-back-flip-h','print-back-flip-v'].forEach(id => {
      const el = document.getElementById(id);
      el.onchange = () => {
        this.printSettings[id === 'print-back-flip-h' ? 'backFlipH' : 'backFlipV'] = el.checked;
        this.printPreviewDirty = true;
        if (document.getElementById('tab-print').classList.contains('active')) this.renderPrintPreview();
      };
    });
    const setSide = side => {
      this.printSettings.previewSide = side;
      document.querySelectorAll('.print-side-btn').forEach(b => b.classList.toggle('active', b.id === 'print-side-'+side));
      this.printPreviewDirty = true;
      if (document.getElementById('tab-print').classList.contains('active')) this.renderPrintPreview();
    };
    document.getElementById('print-side-front').onclick = () => setSide('front');
    document.getElementById('print-side-back').onclick = () => setSide('back');
  },

  applyPrintSettings() {
    const s = this.printSettings;
    document.getElementById('print-cols').value = s.cols;
    document.getElementById('print-cols-val').textContent = s.cols;
    document.getElementById('print-rows').value = s.rows;
    document.getElementById('print-rows-val').textContent = s.rows;
    document.getElementById('print-mx').value = s.mx;
    document.getElementById('print-mx-val').textContent = s.mx;
    document.getElementById('print-my').value = s.my;
    document.getElementById('print-my-val').textContent = s.my;
    document.getElementById('print-gx').value = s.gx;
    document.getElementById('print-gx-val').textContent = s.gx;
    document.getElementById('print-gy').value = s.gy;
    document.getElementById('print-gy-val').textContent = s.gy;
    document.getElementById('print-back-flip-h').checked = s.backFlipH;
    document.getElementById('print-back-flip-v').checked = s.backFlipV;
    document.querySelectorAll('.print-side-btn').forEach(b => b.classList.toggle('active', b.id === 'print-side-'+s.previewSide));
    this.printPreviewDirty = true;
  },

  savePrintSettings() {
    const blob = new Blob([JSON.stringify(this.printSettings, null, 2)], {type:'application/json'});
    this.downloadBlob(blob, 'print_settings.json');
  },

  loadPrintSettings(file) {
    const r = new FileReader();
    r.onload = e => {
      try {
        const o = JSON.parse(e.target.result);
        Object.assign(this.printSettings, o);
        this.applyPrintSettings();
        if (document.getElementById('tab-print').classList.contains('active')) this.renderPrintPreview();
        this.setStatus('Print settings loaded');
      } catch(err) { this.setStatus('Error: '+err.message); }
    };
    r.readAsText(file);
  },

  resetPrintSettings() {
    this.printSettings = { cols:3, rows:3, mx:75, my:60, gx:75, gy:75, backFlipH:false, backFlipV:false, previewSide:'front' };
    this.applyPrintSettings();
    if (document.getElementById('tab-print').classList.contains('active')) this.renderPrintPreview();
    this.setStatus('Print settings reset');
  },

  async renderPrintPreview() {
    if (!this.cards.length) return;
    const printCards = this.getPrintCards();
    if (!printCards.length) return;
    const canvas = document.getElementById('print-preview');
    const A4_W = 2100, A4_H = 2970, CARD_W = 600, CARD_H = 900;
    canvas.width = A4_W; canvas.height = A4_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, A4_W, A4_H);
    const { cols, rows, mx, my, gx, gy, previewSide } = this.printSettings;
    const perSheet = cols * rows;
    const start = this.getPrintStartIndex();
    const isBack = previewSide === 'back';
    if (isBack) { ctx.save(); ctx.translate(A4_W, 0); ctx.scale(-1, 1); }
    for (let i = 0; i < perSheet; i++) {
      const ci = start + i;
      const col = i % cols, row = Math.floor(i / cols);
      const cx = mx + col * (CARD_W + gx);
      const cy = my + row * (CARD_H + gy);
      if (isBack) {
        if (ci < printCards.length) {
          const backImg = await this.preloadCardBack(printCards[ci]);
          if (backImg) {
            ctx.save();
            if (this.printSettings.backFlipH || this.printSettings.backFlipV) {
              const cxc = cx + CARD_W/2, cyc = cy + CARD_H/2;
              ctx.translate(cxc, cyc);
              ctx.scale(this.printSettings.backFlipH ? -1 : 1, this.printSettings.backFlipV ? -1 : 1);
              ctx.translate(-cxc, -cyc);
            }
            ctx.drawImage(backImg, cx, cy, CARD_W, CARD_H);
            ctx.restore();
          } else { this.drawCardBack(ctx, cx, cy, CARD_W, CARD_H); }
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.font = '18px sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(printCards[ci].card_name, cx+8, cy+8);
        }
      } else if (ci < printCards.length) {
        await this.drawCardOnCanvas(ctx, printCards[ci], cx, cy, CARD_W, CARD_H);
      } else {
        ctx.fillStyle = '#f5f5f5';
        this.roundRect(ctx, cx, cy, CARD_W, CARD_H, 12); ctx.fill();
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
        this.roundRect(ctx, cx+1, cy+1, CARD_W-2, CARD_H-2, 11); ctx.stroke();
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
        ctx.setLineDash([8,8]);
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+CARD_W,cy+CARD_H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx+CARD_W,cy); ctx.lineTo(cx,cy+CARD_H); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (isBack) ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    const sideLabel = isBack ? 'Back' : 'Front';
    const totalPrint = printCards.length;
    const page = Math.floor(start / perSheet) + 1;
    const totalPages = Math.ceil(totalPrint / perSheet);
    ctx.fillText(`${sideLabel} — ${start+1}–${Math.min(start+perSheet, totalPrint)} / ${totalPrint} — Page ${page} of ${totalPages}`, A4_W/2, A4_H-20);
    this.scalePrintPreview();
    this.printPreviewDirty = false;
  },

  scalePrintPreview() {
    const wrap = document.getElementById('print-preview-wrap');
    const canvas = document.getElementById('print-preview');
    if (!wrap.offsetWidth) return;
    const s = Math.min((wrap.offsetWidth-40)/canvas.width, (wrap.offsetHeight-40)/canvas.height, 0.6);
    canvas.style.width = Math.round(canvas.width * s)+'px';
    canvas.style.height = Math.round(canvas.height * s)+'px';
  },

  /* ================================================================
     CANVAS 2D DRAWING
     ================================================================ */

  cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },
  cssPx(name) { return parseFloat(this.cssVar(name)); },
  cssClr(name) { return this.cssVar(name); },
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r},${g},${b},${alpha})`;
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  },

  wrapText(ctx, text, maxWidth) {
    const lines = [];
    for (const para of text.split('\n')) {
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
        else { line = test; }
      }
      if (line) lines.push(line);
    }
    return lines;
  },

  drawGradientShape(ctx, cx, cy, r, c1, c2, border, isSquare) {
    if (isSquare) {
      this.drawGradientSquare(ctx, cx, cy, r, c1, c2, border);
    } else {
      this.drawGradientCircle(ctx, cx, cy, r, c1, c2, border);
    }
  },

  drawGradientCircle(ctx, cx, cy, r, c1, c2, border) {
    const g = ctx.createRadialGradient(cx-r*0.35, cy-r*0.35, r*0.1, cx, cy, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke(); }
  },

  drawGradientSquare(ctx, cx, cy, half, c1, c2, border) {
    const s = half * 2;
    const x = cx - half, y = cy - half;
    const r = 4;
    const g = ctx.createLinearGradient(x, y, x, y + s);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    this.roundRect(ctx, x, y, s, s, r); ctx.fillStyle = g; ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; this.roundRect(ctx, x, y, s, s, r); ctx.stroke(); }
  },

  async drawCardOnCanvas(ctx, card, x, y, w, h) {
    const pad = this.cssPx('--section-pad');
    const topBarH = this.cssPx('--top-bar-h');
    const pictureH = this.cssPx('--picture-h');
    const typeBarH = this.cssPx('--type-bar-h');
    const textBottom = this.cssPx('--text-bottom');
    const radius = this.cssPx('--card-radius');
    const bw = 5;

    ctx.save(); this.roundRect(ctx, x, y, w, h, radius); ctx.clip();

    /* 1. Background */
    if (card.background) {
      const bg = await this.preloadAsset('backgrounds', card.background);
      if (bg) ctx.drawImage(bg, x, y, w, h);
    }

    /* 2. Level border */
    const lvl = card.level || 1;
    const lvlClr = this.levelColors[lvl] || this.levelColors[1] || '#909090';
    ctx.strokeStyle = lvlClr; ctx.lineWidth = bw;
    this.roundRect(ctx, x+bw/2, y+bw/2, w-bw, h-bw, radius-bw/2); ctx.stroke();

    /* 3. Top Bar */
    const tby = y + this.cssPx('--top-bar-top');
    const tbCenter = tby + topBarH / 2;
    const topBarBg = this.cssVar('--top-bar-bg');
    if (topBarBg) {
      ctx.fillStyle = topBarBg;
      this.roundRect(ctx, x + pad, tby, w - 2*pad, topBarH, 4); ctx.fill();
    }
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${this.cssVar('--name-size')} ${this.cssVar('--name-family')}`;
    ctx.fillStyle = this.cssVar('--name-color');
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2;
    let nameMaxW = w - 2*pad - 120;
    let name = card.card_name || '';
    while (name && ctx.measureText(name).width > nameMaxW) name = name.slice(0, -1);
    if (name !== (card.card_name || '')) name = name.slice(0, -1) + '…';
    ctx.fillText(name, x + pad, tbCenter);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    /* Mana + Resources */
    const resIconSize = this.cssPx('--resource-icon-size');
    const manaCircleSize = this.cssPx('--mana-circle-size');
    let costX = x + w - pad;
    const resIcons = this.getResourceIcons(card);
    for (let ri = resIcons.length-1; ri >= 0; ri--) {
      const img = await this.preloadAsset('icons/resources', resIcons[ri]);
      if (img) { ctx.drawImage(img, costX - resIconSize, tbCenter - resIconSize/2, resIconSize, resIconSize); costX -= (resIconSize + 4); }
    }
    if (card.mana) {
      const cr = manaCircleSize / 2; const cx = costX - cr; const cy = tbCenter;
      this.drawGradientShape(ctx, cx, cy, cr, this.cssVar('--mana-bg-top'), this.cssVar('--mana-bg-bottom'), '#c8a85e', this.isDiceValue(card.mana));
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const manaFs = this.cssPx('--mana-size') * (this.isDiceValue(card.mana) ? this.diceFontScale() : 1);
      ctx.font = `700 ${manaFs}px 'Cinzel', serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
      ctx.fillText(String(card.mana), cx, cy+1);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.textAlign = 'start';
    }

    /* 4. Picture */
    const picY = tby + topBarH + 6;
    if (card.card_picture) {
      const pic = await this.preloadAsset('pictures', card.card_picture);
      if (pic) {
        ctx.save();
        this.roundRect(ctx, x+pad, picY, w-2*pad, pictureH, 6); ctx.clip();
        const imgAspect = pic.width / pic.height;
        const cw = w - 2*pad;
        const drawW = pictureH * imgAspect;
        const drawX = x + pad + (cw - drawW) / 2;
        ctx.drawImage(pic, drawX, picY, drawW, pictureH);
        ctx.restore();
      }
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    /* 5. Type bar */
    const typeY = picY + pictureH + 8;
    const typeBarBg = this.cssVar('--type-bar-bg');
    if (typeBarBg) {
      ctx.fillStyle = typeBarBg;
      this.roundRect(ctx, x+pad, typeY, w-2*pad, typeBarH, 4); ctx.fill();
    }
    const typeTxt = [card.card_type, card.card_form].filter(Boolean).join(' – ') || '';
    ctx.textBaseline = 'middle';
    ctx.font = `${this.cssVar('--type-weight')||'400'} ${this.cssVar('--type-size')} ${this.cssVar('--type-family')}`;
    ctx.fillStyle = this.cssVar('--type-color');
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    let typeMaxW = w - 2*pad - 36;
    let tText = typeTxt; while (tText && ctx.measureText(tText).width > typeMaxW) tText = tText.slice(0, -1);
    if (tText !== typeTxt) tText = tText.slice(0, -1) + '…';
    ctx.fillText(tText, x + pad + 10, typeY + typeBarH/2);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    if (card.type_icon) {
      const typeIconSize = this.cssPx('--type-icon-size');
      let ti = await this.preloadAsset('icons/types', card.type_icon);
      if (!ti) ti = await this.preloadAsset('icons/resources', card.type_icon);
      if (ti) ctx.drawImage(ti, x + w - pad - 10 - typeIconSize, typeY + (typeBarH - typeIconSize)/2, typeIconSize, typeIconSize);
    }

    /* 6. Description Section — dynamic subsections */
    const sections = card.sections || this.defaultSections();
    const textY = typeY + typeBarH + 8;
    const textH = h - textBottom - (textY - y);

    /* Default styles from CSS variables */
    const defHeaderFont = this.cssVar('--section-header-family') || "'Cinzel', serif";
    const defHeaderSize = this.cssPx('--section-header-size') || 15;
    const defHeaderColor = this.cssVar('--section-header-color') || '#ffffff';
    const defHeaderWeight = this.cssVar('--section-header-weight') || '700';
    const defBodyFont = this.cssVar('--section-body-family') || "Georgia, serif";
    const defBodySize = this.cssPx('--section-body-size') || 13;
    const defBodyColor = this.cssVar('--section-body-color') || '#ffffff';
    const defBodyWeight = this.cssVar('--section-body-weight') || '400';

    const visibleSections = sections.filter(s => s.body.text || (s.header && s.header.text));
    if (visibleSections.length > 0) {
      const gap = 4, maxTextW = w - 2*pad - 12;
      /* Clip sections to their available area (matching HTML overflow:hidden) */
      ctx.save();
      this.roundRect(ctx, x + pad, textY, w - 2 * pad, textH, 3); ctx.clip();

      /* Preload inline icons for all section texts */
      this._inlineIconCache = {};
      const preloadPromises = [];
      for (const sec of visibleSections) {
        if (sec.header && sec.header.text) preloadPromises.push(this._preloadInlineIcons(sec.header.text));
        if (sec.body && sec.body.text) preloadPromises.push(this._preloadInlineIcons(sec.body.text));
      }
      await Promise.all(preloadPromises);

      /* Compute natural heights using token-aware wrapping */
      const blocks = visibleSections.map(sec => {
        const hFont = (sec.override && sec.header && sec.header.font) || defHeaderFont;
        const hSize = (sec.override && sec.header && sec.header.size) || defHeaderSize;
        const hColor = (sec.override && sec.header && sec.header.color) || defHeaderColor;
        const hWeight = (sec.override && sec.header && sec.header.weight) || defHeaderWeight;
        const bFont = (sec.override && sec.body.font) || defBodyFont;
        const bSize = (sec.override && sec.body.size) || defBodySize;
        const bColor = (sec.override && sec.body.color) || defBodyColor;
        const bWeight = (sec.override && sec.body.weight) || defBodyWeight;

        let totalH = 0;
        let hLines = null, bLines = null;
        if (sec.header && sec.header.text) {
          const hTokens = this._tokenizeWithIcons(sec.header.text, hSize);
          hLines = this._wrapTokens(ctx, hTokens, maxTextW, hFont, hSize, hWeight);
          totalH += this._measureTokenLines(hLines, hSize) + 4;
        }
        if (sec.body && sec.body.text) {
          const bTokens = this._tokenizeWithIcons(sec.body.text, bSize);
          bLines = this._wrapTokens(ctx, bTokens, maxTextW, bFont, bSize, bWeight);
          totalH += this._measureTokenLines(bLines, bSize) + 4;
        }
        return { sec, hLines, bLines, hFont, hSize, hColor, hWeight, bFont, bSize, bColor, bWeight, naturalH: Math.max(totalH, 8) + 4 };
      });

      let curY = textY;

      for (const b of blocks) {
        const blockH = Math.max(b.naturalH, 8);
        const bgOpacity = (b.sec.override && b.sec.bg_opacity != null) ? b.sec.bg_opacity / 100 : 0.7;
        ctx.fillStyle = (b.sec.override && b.sec.bg_color) ? this.hexToRgba(b.sec.bg_color, bgOpacity) : 'rgba(255,255,240,0.7)';
        this.roundRect(ctx, x+pad, curY, w-2*pad, blockH, 3); ctx.fill();
        let drawY = curY + 4;
        const bottomY = curY + blockH;

        if (b.hLines && b.hLines.length) {
          ctx.font = `${b.hWeight} ${b.hSize}px ${b.hFont}`;
          const hUsed = this._measureTokenLines(b.hLines, b.hSize);
          if (drawY + hUsed > bottomY) {
            /* clip header to available space */
            const clipped = b.hLines.slice(0, Math.floor((bottomY - drawY) / (b.hSize * 1.3)));
            this._drawTokenLines(ctx, clipped, x+pad+6, drawY, b.hSize, b.hColor);
          } else {
            this._drawTokenLines(ctx, b.hLines, x+pad+6, drawY, b.hSize, b.hColor);
          }
          drawY += hUsed + 4;
        }

        if (b.bLines && b.bLines.length) {
          ctx.font = `${b.bWeight} ${b.bSize}px ${b.bFont}`;
          if (drawY + this._measureTokenLines(b.bLines, b.bSize) > bottomY) {
            const clipped = b.bLines.slice(0, Math.floor((bottomY - drawY) / (b.bSize * 1.3)));
            this._drawTokenLines(ctx, clipped, x+pad+6, drawY, b.bSize, b.bColor);
          } else {
            this._drawTokenLines(ctx, b.bLines, x+pad+6, drawY, b.bSize, b.bColor);
          }
        }
        curY += blockH + gap;
      }
      ctx.restore();
    }

    /* 7. Attack / Defence */
    if (card.attack || card.defence) {
      const atkSize = this.cssPx('--atkdef-size');
      const atkdefCircleSize = this.cssPx('--atkdef-circle-size');
      const atkR = atkdefCircleSize / 2; const atkY = y + h - 10 - atkR;
      const defX = x + w - 14 - atkR;
      const atkX = defX - atkR*2 - 8;
      this.drawGradientShape(ctx, atkX, atkY, atkR, '#e74c3c', '#922b21', '#c8a85e', this.isDiceValue(card.attack));
      this.drawGradientShape(ctx, defX, atkY, atkR, '#3498db', '#1a5276', '#c8a85e', this.isDiceValue(card.defence));
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      const atkFs = atkSize * (this.isDiceValue(card.attack) ? this.diceFontScale() : 1);
      ctx.font = `700 ${atkFs}px 'Cinzel', serif`;
      ctx.fillText(String(card.attack ?? '0'), atkX, atkY+1);
      const defFs = atkSize * (this.isDiceValue(card.defence) ? this.diceFontScale() : 1);
      ctx.font = `700 ${defFs}px 'Cinzel', serif`;
      ctx.fillText(String(card.defence ?? '0'), defX, atkY+1);
      ctx.textAlign = 'start';
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    /* 8. Level */
    if (card.showLevel && card.level) {
      const lvlCircleSize = this.cssPx('--atkdef-circle-size');
      const lvlR = lvlCircleSize / 2;
      const lvlX = x + 14 + lvlR;
      const lvlY = y + h - 10 - lvlR;
      this.drawGradientCircle(ctx, lvlX, lvlY, lvlR, '#9b59b6', '#6c3483', '#a569bd');
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      const lvlFs = this.cssPx('--atkdef-size');
      ctx.font = `700 ${lvlFs}px 'Cinzel', serif`;
      ctx.fillText(String(card.level), lvlX, lvlY+1);
      ctx.textAlign = 'start';
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    ctx.restore();
  },

  getWrappedLines(ctx, text, maxWidth, font, size) {
    ctx.font = `400 ${size}px ${font}`;
    return this.wrapText(ctx, text, maxWidth);
  },

  drawCardBack(ctx, x, y, w, h) {
    ctx.save();
    this.roundRect(ctx, x, y, w, h, 12); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x+w, y+h);
    g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#16213e');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#c8a85e'; ctx.lineWidth = 5;
    this.roundRect(ctx, x+2.5, y+2.5, w-5, h-5, 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,168,94,0.3)'; ctx.lineWidth = 2;
    this.roundRect(ctx, x+15, y+15, w-30, h-30, 8); ctx.stroke();
    const cg = ctx.createRadialGradient(x+w/2, y+h/2, 10, x+w/2, y+h/2, w*0.35);
    cg.addColorStop(0, '#2a2a4e'); cg.addColorStop(1, '#0f0f20');
    ctx.fillStyle = cg;
    this.roundRect(ctx, x+20, y+20, w-40, h-40, 8); ctx.fill();
    ctx.fillStyle = '#c8a85e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 32px \'Cinzel\', serif'; ctx.fillText('Sihirizasyon', x+w/2, y+h/2-20);
    ctx.font = '400 18px \'Cinzel\', serif'; ctx.fillText('Toplantı Var', x+w/2, y+h/2+25);
    ctx.font = '12px serif'; ctx.fillStyle = 'rgba(200,168,94,0.4)'; ctx.fillText('✦', x+w/2, y+h-40);
    ctx.restore();
    ctx.textAlign = 'start';
  },

  /* ================================================================
     GENERATION
     ================================================================ */

  async generateAll() {
    if (!this.cards.length) return;
    try {
      const total = this.cards.length;
      const printCards = this.getPrintCards();
      const printTotal = printCards.length;
      const { cols, rows, mx, my, gx, gy } = this.printSettings;
      const PER_SHEET = cols * rows, sheets = Math.ceil(printTotal / PER_SHEET);
      const A4_W = 2100, A4_H = 2970, CARD_W = 600, CARD_H = 900;
      const pos = i => ({ x: mx+(i%cols)*(CARD_W+gx), y: my+Math.floor(i/cols)*(CARD_H+gy) });
      this.setStatus('Phase 1/2: Rendering individual cards...');
      const blobs = [];
      for (let i = 0; i < total; i++) {
        this.showProgress((i/total)*50);
        this.setStatus(`Rendering ${i+1}/${total}: ${this.cards[i].card_name}`);
        const c = await this.renderCardCanvas(this.cards[i], 2);
        const b = await this.canvasToBlob(c);
        if (!b) throw new Error('Canvas error');
        blobs.push(b);
      }
      this.setStatus('Phase 2/2: Building A4 print sheets...');
      const fronts = [], backSheets = [];
      for (let s = 0; s < sheets; s++) {
        this.showProgress(50+(s/sheets)*30);
        const start = s*PER_SHEET, end = Math.min(start+PER_SHEET, printTotal), n = end-start;
        const slotToCardIdx = [];
        for (let i = start; i < end; i++) {
          const card = printCards[i];
          slotToCardIdx.push(this.cards.indexOf(card));
        }
        const fc = document.createElement('canvas'); fc.width=A4_W; fc.height=A4_H;
        const fcx = fc.getContext('2d');
        for (let i = 0; i < n; i++) {
          const img = await this.blobToImage(blobs[slotToCardIdx[i]]);
          if (img) { const p = pos(i); fcx.drawImage(img, p.x, p.y, CARD_W, CARD_H); }
        }
        fronts.push(fc);
        const bc = document.createElement('canvas'); bc.width=A4_W; bc.height=A4_H;
        const bcx = bc.getContext('2d');
        bcx.save(); bcx.translate(A4_W, 0); bcx.scale(-1, 1);
        for (let i = 0; i < n; i++) {
          const p = pos(i);
          const card = printCards[start + i];
          const backImg = await this.preloadCardBack(card);
          if (backImg) {
            bcx.save();
            if (this.printSettings.backFlipH || this.printSettings.backFlipV) {
              const cx = p.x + CARD_W/2, cy = p.y + CARD_H/2;
              bcx.translate(cx, cy);
              bcx.scale(this.printSettings.backFlipH ? -1 : 1, this.printSettings.backFlipV ? -1 : 1);
              bcx.translate(-cx, -cy);
            }
            bcx.drawImage(backImg, p.x, p.y, CARD_W, CARD_H);
            bcx.restore();
          } else this.drawCardBack(bcx, p.x, p.y, CARD_W, CARD_H);
        }
        bcx.restore();
        backSheets.push(bc);
      }
      this.setStatus('Saving files...');
      let dir = null;
      try { dir = await window.showDirectoryPicker(); } catch (_) {}
      if (!dir) {
        const zip = new JSZip();
        const ind = zip.folder('individual');
        const prn = zip.folder('print');
        for (let i = 0; i < total; i++) ind.file(this.sanitizeName(this.cards[i].card_name)+'.png', blobs[i]);
        for (let s = 0; s < sheets; s++) {
          this.showProgress(80+(s/sheets)*20);
          const fb = await this.canvasToBlob(fronts[s]);
          const bb = await this.canvasToBlob(backSheets[s]);
          if (fb) prn.file(`a4_sheet_${s+1}_front.png`, fb);
          if (bb) prn.file(`a4_sheet_${s+1}_back.png`, bb);
        }
        this.setStatus('Packaging ZIP...');
        await this.downloadBlob(await zip.generateAsync({type:'blob'}), 'cards_full.zip');
      } else {
        const indDir = await dir.getDirectoryHandle('individual', {create:true});
        const prnDir = await dir.getDirectoryHandle('print', {create:true});
        for (let i = 0; i < total; i++) {
          this.showProgress(80+(i/total)*10);
          const fh = await indDir.getFileHandle(this.sanitizeName(this.cards[i].card_name)+'.png', {create:true});
          const w = await fh.createWritable(); await w.write(blobs[i]); await w.close();
        }
        for (let s = 0; s < sheets; s++) {
          this.showProgress(90+(s/sheets)*10);
          const fb = await this.canvasToBlob(fronts[s]);
          const bb = await this.canvasToBlob(backSheets[s]);
          if (fb) { const fh = await prnDir.getFileHandle(`a4_sheet_${s+1}_front.png`, {create:true}); const w = await fh.createWritable(); await w.write(fb); await w.close(); }
          if (bb) { const fh = await prnDir.getFileHandle(`a4_sheet_${s+1}_back.png`, {create:true}); const w = await fh.createWritable(); await w.write(bb); await w.close(); }
        }
      }
      this.setStatus(`Done! ${total} card(s), ${printTotal} print slot(s), ${sheets} A4 sheet(s).`);
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'NotFoundError')
        this.setStatus('Error: ' + err.message);
    }
    this.hideProgress();
  },

  async generatePDF(side) {
    if (!this.cards.length) return;
    const label = side === 'fronts' ? 'Fronts' : 'Backs';
    try {
      this.setStatus(`Generating ${label} PDF...`);
      this.showProgress(0);
      const printCards = this.getPrintCards();
      if (!printCards.length) { this.setStatus('No printable cards'); this.hideProgress(); return; }
      const { cols, rows, mx, my, gx, gy } = this.printSettings;
      const PER_SHEET = cols * rows, sheets = Math.ceil(printCards.length / PER_SHEET);
      const A4_W = 2100, A4_H = 2970, CARD_W = 600, CARD_H = 900;
      const pos = i => ({ x: mx+(i%cols)*(CARD_W+gx), y: my+Math.floor(i/cols)*(CARD_H+gy) });
      const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
      for (let s = 0; s < sheets; s++) {
        this.showProgress((s/sheets)*100);
        this.setStatus(`PDF: sheet ${s+1}/${sheets}`);
        const start = s*PER_SHEET, end = Math.min(start+PER_SHEET, printCards.length), n = end-start;
        const cv = document.createElement('canvas'); cv.width=A4_W; cv.height=A4_H;
        const cctx = cv.getContext('2d');
        cctx.fillStyle = '#ffffff'; cctx.fillRect(0, 0, A4_W, A4_H);
        if (side === 'backs') {
          cctx.save(); cctx.translate(A4_W, 0); cctx.scale(-1, 1);
          for (let i = 0; i < n; i++) {
            const p = pos(i);
            const backImg = await this.preloadCardBack(printCards[start + i]);
            if (backImg) {
              cctx.save();
              if (this.printSettings.backFlipH || this.printSettings.backFlipV) {
                const cx = p.x+CARD_W/2, cy = p.y+CARD_H/2;
                cctx.translate(cx, cy);
                cctx.scale(this.printSettings.backFlipH ? -1 : 1, this.printSettings.backFlipV ? -1 : 1);
                cctx.translate(-cx, -cy);
              }
              cctx.drawImage(backImg, p.x, p.y, CARD_W, CARD_H);
              cctx.restore();
            } else this.drawCardBack(cctx, p.x, p.y, CARD_W, CARD_H);
          }
          cctx.restore();
        } else {
          for (let i = 0; i < n; i++) await this.drawCardOnCanvas(cctx, printCards[start+i], pos(i).x, pos(i).y, CARD_W, CARD_H);
        }
        if (s > 0) pdf.addPage();
        pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      }
      pdf.save(`${side}_print.pdf`);
      this.setStatus(`Done! ${sheets} page(s)`);
    } catch (err) {
      if (err.name !== 'AbortError') this.setStatus('Error: ' + err.message);
    }
    this.hideProgress();
  },

  async renderCardCanvas(card, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = 600 * scale; canvas.height = 900 * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    await this.drawCardOnCanvas(ctx, card, 0, 0, 600, 900);
    return canvas;
  },

  blobToImage(blob) {
    if (!blob) return Promise.resolve(null);
    return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = URL.createObjectURL(blob); });
  },

  sanitizeName(name) { return (name||'card').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); },

  canvasToBlob(canvas) {
    return new Promise(r => { try { canvas.toBlob(b => r(b), 'image/png'); } catch(_) { r(null); } });
  },

  async downloadBlob(blob, filename) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      const w = await handle.createWritable();
      await w.write(blob); await w.close();
    } catch (_) {
      saveAs(blob, filename);
    }
  },

  /* ================================================================
     MISSING FUNCTIONS (restored)
     ================================================================ */

  createEmptyCard() {
    return {
      card_name: '', card_picture: '', background: '', type_icon: '',
      level: 1, showLevel: true, card_type: '', card_form: '',
      attack: 0, defence: 0, mana: 0, resources: {},
      printed: 'yes', amount: 1, card_back: '',
      sections: this.defaultSections()
    };
  },

  initEmptyProject() {
    this.assets = {};
    this.cards = [this.createEmptyCard()];
    this.currentIndex = 0;
    this.populateCardSelect();
    this.showCard(0);
    this.updateUI();
  },

  normalizeCardData(raw) {
    const rarityToLevel = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, shadow: 6 };
    const rawLevel = raw.level !== undefined && raw.level !== '' ? parseInt(raw.level, 10) || 0 : 0;
    const card = {
      card_name: raw.card_name || '',
      card_picture: raw.card_picture || '',
      background: raw.background || '',
      type_icon: raw.type_icon || '',
      level: rawLevel > 0 ? rawLevel : (rarityToLevel[raw.rarity] || 0),
      showLevel: rawLevel > 0 || !!raw.rarity,
      card_type: raw.card_type || '',
      card_form: raw.card_form || '',
      attack: /^d\d+$/.test(raw.attack) ? raw.attack : parseInt(raw.attack, 10) || 0,
      defence: /^d\d+$/.test(raw.defence) ? raw.defence : parseInt(raw.defence, 10) || 0,
      mana: /^d\d+$/.test(raw.mana) ? raw.mana : parseInt(raw.mana, 10) || 0,
      resources: {},
      printed: raw.printed || 'yes',
      amount: parseInt(raw.amount, 10) || 1,
      card_back: raw.card_back || '',
      sections: []
    };
    /* Resource columns: resource_{name} */
    for (const key of Object.keys(raw)) {
      if (key.startsWith('resource_')) {
        const name = key.slice(9);
        const count = parseInt(raw[key], 10);
        if (name && count > 0) card.resources[name] = count;
      }
    }
    /* Description Sections from section_N_* columns */
    const sectionMap = {};
    for (const key of Object.keys(raw)) {
      const m = key.match(/^section_(\d+)_(.+)$/);
      if (!m) continue;
      const idx = parseInt(m[1], 10);
      if (!sectionMap[idx]) {
        sectionMap[idx] = { override: false, bg_color: '', bg_opacity: 70, header: null, body: { text: '', font: '', size: 0, color: '', weight: '' } };
      }
      const field = m[2];
      if (field === 'override') {
        sectionMap[idx].override = raw[key] === 'true' || raw[key] === '1';
      } else if (field === 'bg_color') {
        sectionMap[idx].bg_color = raw[key];
      } else if (field === 'bg_opacity') {
        const v = parseInt(raw[key], 10);
        sectionMap[idx].bg_opacity = isNaN(v) ? 70 : v;
      } else if (field === 'header_text') {
        sectionMap[idx].header = sectionMap[idx].header || {};
        sectionMap[idx].header.text = raw[key];
      } else if (field === 'header_font') {
        sectionMap[idx].header = sectionMap[idx].header || {};
        sectionMap[idx].header.font = raw[key];
      } else if (field === 'header_size') {
        sectionMap[idx].header = sectionMap[idx].header || {};
        sectionMap[idx].header.size = parseInt(raw[key], 10) || 0;
      } else if (field === 'header_color') {
        sectionMap[idx].header = sectionMap[idx].header || {};
        sectionMap[idx].header.color = raw[key];
      } else if (field === 'header_weight') {
        sectionMap[idx].header = sectionMap[idx].header || {};
        sectionMap[idx].header.weight = raw[key];
      } else if (field === 'body_text') {
        sectionMap[idx].body.text = raw[key];
      } else if (field === 'body_font') {
        sectionMap[idx].body.font = raw[key];
      } else if (field === 'body_size') {
        sectionMap[idx].body.size = parseInt(raw[key], 10) || 0;
      } else if (field === 'body_color') {
        sectionMap[idx].body.color = raw[key];
      } else if (field === 'body_weight') {
        sectionMap[idx].body.weight = raw[key];
      }
    }
    /* Legacy columns: status_text, usage_text, description */
    const legacyMappings = [
      { key: 'status_text', sectionIdx: 0 },
      { key: 'usage_text', sectionIdx: 1 },
      { key: 'description', sectionIdx: 2 }
    ];
    for (const lm of legacyMappings) {
      if (raw[lm.key]) {
        if (!sectionMap[lm.sectionIdx]) {
          sectionMap[lm.sectionIdx] = { override: false, bg_color: '', bg_opacity: 70, header: null, body: { text: '', font: '', size: 0, color: '', weight: '' } };
        }
        if (!sectionMap[lm.sectionIdx].body.text) sectionMap[lm.sectionIdx].body.text = raw[lm.key];
      }
    }
    /* Sort sections by index */
    const indices = Object.keys(sectionMap).map(Number).sort((a, b) => a - b);
    for (const i of indices) {
      const sec = sectionMap[i];
      if (!sec.header || !sec.header.text) sec.header = null;
      card.sections.push(sec);
    }
    if (!card.sections.length) card.sections = this.defaultSections();
    return card;
  },

  defaultSections() {
    return [{ override: false, bg_color: '', bg_opacity: 70, header: null, body: { text: '', font: '', size: 0, color: '', weight: '' } }];
  },

  refreshAllAssetGrids() {
    this.refreshAssetGrid('icons/resources', 'resource-icons-grid');
    this.refreshAssetGrid('icons/types', 'type-icons-grid');
    this.refreshAssetGrid('icons/actions', 'action-icons-grid');
    this.refreshAssetGrid('backgrounds', 'backgrounds-grid');
    this.refreshAssetGrid('backs', 'backs-grid');
    this.refreshAllAssetDropdowns();
  },

  addCard() {
    const card = this.createEmptyCard();
    this.cards.push(card);
    this.currentIndex = this.cards.length - 1;
    this.populateCardSelect();
    this.showCard(this.currentIndex);
    this.updateUI();
    document.getElementById('card-select').value = this.currentIndex;
  },

  removeCard() {
    if (this.cards.length <= 1) return;
    this.cards.splice(this.currentIndex, 1);
    if (this.currentIndex >= this.cards.length) this.currentIndex = this.cards.length - 1;
    this.populateCardSelect();
    this.showCard(this.currentIndex);
    this.updateUI();
  },

  duplicateCard() {
    const src = this.cards[this.currentIndex];
    if (!src) return;
    const dup = JSON.parse(JSON.stringify(src));
    dup.card_name = (dup.card_name || 'Card') + '-Duplicated';
    this.cards.splice(this.currentIndex + 1, 0, dup);
    this.currentIndex++;
    this.populateCardSelect();
    this.showCard(this.currentIndex);
    this.updateUI();
    document.getElementById('card-select').value = this.currentIndex;
  },

  async uploadProject(file) {
    try {
      this.setStatus('Reading project...');
      const zip = await JSZip.loadAsync(file);
      /* Load card data */
      const xlsxFile = zip.file('card_data.xlsx');
      if (!xlsxFile) { this.setStatus('Error: No card_data.xlsx in project'); return; }
      const buf = await xlsxFile.async('arraybuffer');
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets['Cards'];
      if (!ws) { this.setStatus('Error: No "Cards" sheet in XLSX'); return; }
      const rows = XLSX.utils.sheet_to_json(ws);
      this.cards = rows.map(r => this.normalizeCardData(r));
      /* Load level colors */
      const lcFile = zip.file('level_colors.json');
      if (lcFile) {
        try { const lc = JSON.parse(await lcFile.async('string')); this.levelColors = lc; this.maxLevel = Math.max(1, ...Object.keys(lc).map(Number)); } catch(_) {}
      } else {
        this.levelColors = { 1: '#909090', 2: '#2ecc71', 3: '#3498db', 4: '#9b59b6', 5: '#e67e22', 6: '#2c003c' };
        this.maxLevel = 6;
      }
      this.buildLevelUI();
      /* Load print settings */
      const psFile = zip.file('print_settings.json');
      if (psFile) {
        try { const ps = JSON.parse(await psFile.async('string')); Object.assign(this.printSettings, ps); this.buildPrintControls(); } catch(_) {}
      }
      /* Load CSS */
      const cssFile = zip.file('card.css');
      if (cssFile) {
        const css = await cssFile.async('string');
        document.getElementById('css-editor').value = css;
        this.applyCustomCSS();
        this.syncSlidersFromCSS();
      }
      /* Load assets */
      this.assets = {};
      const loadAsset = async (path) => {
        const f = zip.file(path);
        if (!f) return;
        const blob = await f.async('blob');
        const dataURL = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        const relPath = path.replace('assets/', '');
        this.assets[relPath] = dataURL;
      };
      const promises = [];
      zip.forEach(relPath => { if (relPath.startsWith('assets/')) promises.push(loadAsset(relPath)); });
      await Promise.all(promises);
      this.currentIndex = 0;
      this.populateCardSelect();
      this.showCard(0);
      this.refreshAllAssetGrids();
      this.updateUI();
      this.buildStatsLevelList();
      if (this.cards.length) this.setStatus(`Loaded ${this.cards.length} card(s) from project`);
      else this.setStatus('Project loaded — 0 cards found');
    } catch (err) {
      this.setStatus('Error loading project: ' + err.message);
    }
  },

  async saveProject() {
    try {
      this.setStatus('Packaging project...');
      const zip = new JSZip();
      /* Write card_data.xlsx */
      const wb = XLSX.utils.book_new();
      const rows = [this.xlsxHeaders()];
      for (const card of this.cards) rows.push(this.flattenCardData(card));
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Cards');
      zip.file('card_data.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
      /* Write assets */
      for (const [path, dataURL] of Object.entries(this.assets)) {
        const b64 = dataURL.split(',')[1];
        if (b64) zip.file('assets/' + path, b64, { base64: true });
      }
      /* Write CSS + print settings + level colors */
      zip.file('card.css', document.getElementById('css-editor').value);
      zip.file('print_settings.json', JSON.stringify(this.printSettings, null, 2));
      zip.file('level_colors.json', JSON.stringify(this.levelColors, null, 2));
      this.setStatus('Downloading project...');
      const blob = await zip.generateAsync({ type: 'blob' });
      await this.downloadBlob(blob, 'project.zip');
      this.setStatus('Project saved');
    } catch (err) {
      this.setStatus('Error saving project: ' + err.message);
    }
  },

  xlsxHeaders() {
    const base = ['card_name','card_picture','background','type_icon','level','card_type','card_form',
      'attack','defence','mana','printed','amount','card_back'];
    const resourceNames = new Set();
    let maxSectionIdx = -1;
    for (const card of this.cards) {
      for (const rn of Object.keys(card.resources || {})) resourceNames.add(rn);
      if (card.sections) {
        for (let i = 0; i < card.sections.length; i++) {
          if (card.sections[i].body.text || (card.sections[i].header && card.sections[i].header.text)) {
            maxSectionIdx = Math.max(maxSectionIdx, i);
          }
        }
      }
    }
    const headers = [...base];
    for (const rn of [...resourceNames].sort()) headers.push('resource_' + rn);
    for (let i = 0; i <= maxSectionIdx; i++) {
      headers.push('section_' + i + '_override',
        'section_' + i + '_bg_color', 'section_' + i + '_bg_opacity',
        'section_' + i + '_header_text', 'section_' + i + '_header_font', 'section_' + i + '_header_size',
        'section_' + i + '_header_color', 'section_' + i + '_header_weight',
        'section_' + i + '_body_text', 'section_' + i + '_body_font', 'section_' + i + '_body_size',
        'section_' + i + '_body_color', 'section_' + i + '_body_weight');
    }
    return headers;
  },

  flattenCardData(card) {
    const row = [
      card.card_name || '', card.card_picture || '', card.background || '', card.type_icon || '',
      card.showLevel !== false ? (card.level || 1) : 0, card.card_type || '', card.card_form || '',
      card.attack || 0, card.defence || 0, card.mana || 0,
      card.printed || 'yes', card.amount || 1, card.card_back || ''
    ];
    const resourceNames = new Set();
    for (const c of this.cards) for (const rn of Object.keys(c.resources || {})) resourceNames.add(rn);
    for (const rn of [...resourceNames].sort()) row.push((card.resources || {})[rn] || 0);
    const sections = card.sections || [];
    let maxSectionIdx = -1;
    for (const c of this.cards) {
      if (c.sections) {
        for (let i = 0; i < c.sections.length; i++) {
          if (c.sections[i].body.text || (c.sections[i].header && c.sections[i].header.text)) {
            maxSectionIdx = Math.max(maxSectionIdx, i);
          }
        }
      }
    }
    for (let i = 0; i <= maxSectionIdx; i++) {
      const sec = sections[i];
      row.push(sec && sec.override ? 'true' : 'false');
      row.push(sec && sec.bg_color ? sec.bg_color : '');
      row.push(sec && sec.bg_opacity != null ? sec.bg_opacity : 70);
      if (sec && sec.header && sec.header.text) {
        row.push(sec.header.text, sec.header.font || '', sec.header.size || 0, sec.header.color || '', sec.header.weight || '');
      } else {
        row.push('', '', 0, '', '');
      }
      if (sec && sec.body.text) {
        row.push(sec.body.text, sec.body.font || '', sec.body.size || 0, sec.body.color || '', sec.body.weight || '');
      } else {
        row.push('', '', 0, '', '');
      }
    }
    return row;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
