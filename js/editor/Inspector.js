/**
 * Inspector.js
 * ---------------------------------------------------------------------------
 * Sağ panel: seçili nesnenin tüm düzenlenebilir özellikleri.
 *
 *  - Kimlik      : ad, etiket (tag), tür, id
 *  - Dönüşüm     : konum / rotasyon (derece) / ölçek — X,Y,Z sayı alanları
 *  - Görünüm     : renk, görünürlük, kilit, gölük
 *  - Özel alanlar: asset kataloğundaki propsSchema'ya göre dinamik üretilir
 *  - Bilgi       : dünya konumu, mesh sayısı, oyun rolü
 *
 * Sayı alanlarının etiketleri SÜRÜKLENEBİLİR (scrub): imleci tutup sağa/sola
 * çekerek değeri hızlıca değiştirir. Çoklu seçimde konum alanları FARK
 * (delta), açı/ölçek alanları ise MUTLAK değer uygular.
 */
import { el, qs, ICONS, svg } from '../utils/dom.js';
import { EVENT } from '../core/Store.js';
import {
  getAsset, getAssetIcon, getAssetName, getSchemaLabel, getOptionLabel, getCategoryLabel,
} from '../assets/catalog.js';
import { clamp, clean, fmt, nearly } from '../utils/math.js';
import { i18n, I18N_EVENT } from '../core/I18nManager.js';

/**
 * Dış kitaplık modelleri (`imp:…`) statik katalogda bulunmaz. Inspector
 * alanları için bu PAYLAŞILAN şema kullanılır (bkz. catalog.js → importedLib).
 */
const IMPORTED_LIB_ASSET = 'importedLib';

const AXES = ['x', 'y', 'z'];
const AXIS_CLASS = ['ax-x', 'ax-y', 'ax-z'];

/** Etiket sütunu. */
const COLORS = {
  position: '#7ee787',
  rotation: '#ffb648',
  scale: '#79c0ff',
};

export class Inspector {
  /**
   * @param {import('../core/Store.js').Store} store
   * @param {import('./History.js').History} history
   * @param {Object} handlers
   */
  constructor(store, history, handlers = {}) {
    this.store = store;
    this.history = history;
    this.handlers = handlers;
    this.root = qs('#inspector');
    this.selChip = qs('#selCountChip');

    /** @type {Object[]} canlı alan referansları */
    this._fields = [];
    this._builtFor = null;

    this._bindStore();
    // Dil değişince alanlar yeniden kurulur. `_builtFor` sıfırlanmalı: aksi
    // halde `render()` "aynı seçim, sadece değerleri tazele" kısayoluna düşer
    // ve etiketler eski dilde kalır.
    i18n.register('inspector', () => { this._builtFor = null; this.render(); });
    this.render();
  }

  _bindStore() {
    this.store.on(EVENT.SELECTION_CHANGE, () => this.render());
    this.store.on(EVENT.OBJECTS_REPLACE, () => this.render());
    this.store.on(EVENT.OBJECT_ADD, () => this.render());
    this.store.on(EVENT.OBJECT_REMOVE, () => this.render());
    this.store.on(EVENT.OBJECT_UPDATE, ({ record }) => {
      this._syncValues();
      if (this._builtFor === record.id) this._syncInfo(record);
    });
  }

  /* =======================================================================
     Yardımcılar
     ======================================================================= */
  get records() {
    return this.store.getSelectedRecords();
  }

  get _single() {
    const list = this.records;
    return list.length === 1 ? list[0] : null;
  }

  /** Odaklanmış (kullanıcı tarafından düzenlenen) alan var mı? */
  _isEditing() {
    const active = document.activeElement;
    return !!active && this.root.contains(active);
  }

  /* =======================================================================
     Çizim
     ======================================================================= */
  render() {
    if (!this.root) return;
    const list = this.records;
    const record = this._single;
    const first = list[0] || null;

    // Seçim değiştiyse alanları yeniden kur; aynı seçimde sadece değerleri tazele
    const key = list.map((r) => r.id).join('|');
    if (key === this._builtFor && this.root.childElementCount) {
      this._syncValues();
      return;
    }
    this._builtFor = key;
    this._fields = [];
    this.root.innerHTML = '';

    if (!list.length) {
      this.selChip.textContent = i18n.t('inspector.chip.none');
      this.selChip.classList.remove('hot');
      this.root.append(el('div.insp-empty', {}, [
        svg(ICONS.cursor(34)),
        el('b', { i18n: 'inspector.empty.title' }),
        el('p', { i18n: 'inspector.empty.body' }),
      ]));
      return;
    }

    this.selChip.textContent = i18n.t('inspector.chip.count', { count: list.length });
    this.selChip.classList.add('hot');

    this.root.append(this._buildHeader(first, list.length));
    this.root.append(this._buildTransform(list, first));
    this.root.append(this._buildAppearance(list, first));
    this.root.append(this._buildProps(list, first));
    this.root.append(this._buildActions(list));
    this.root.append(this._buildInfo(first));
  }

  /* -------------------- Başlık -------------------- */
  _buildHeader(record, count) {
    // Dış kitaplık modeli (`imp:…`) katalogda yok → paylaşılan şema/meta kullanılır
    const gercek = getAsset(record.assetId);
    const meta = gercek || getAsset(IMPORTED_LIB_ASSET);
    const tip = count === 1
      ? (gercek
        ? getAssetName(record.assetId)
        : i18n.t('inspector.type.external', {
          kategori: record.props?.kitapKategori || i18n.t('inspector.type.category'),
        }))
      : i18n.t('inspector.type.multi');
    return el('div', {}, [
      el('div.insp-header', {}, [
        el('div.insp-thumb', { html: getAssetIcon(gercek ? record.assetId : IMPORTED_LIB_ASSET) }),
        el('div.insp-head-meta', {}, [
          el('span.nm', { text: count === 1 ? (gercek ? getAssetName(record.assetId) : record.name) : i18n.t('inspector.type.multi') }),
          el('span.ty', {
            text: count === 1
              ? `${tip} · ${i18n.t(`role.${meta?.role || 'prop'}`)}`
              : i18n.t('inspector.sub.count', { count }),
          }),
        ]),
      ]),
      this._textField('name', i18n.t('inspector.field.name'), record.name, count !== 1),
    ]);
  }

  _textField(key, label, value, disabled) {
    const input = el('input.input', { type: 'text', value, disabled, spellcheck: 'false' });
    input.classList.remove('has-icon');
    input.style.paddingLeft = '9px';
    input.addEventListener('focus', () => this.history.begin(label));
    input.addEventListener('input', () => {
      const list = this.records;
      if (!list.length) return;
      if (key === 'tag') {
        for (const r of list) this.store.patchRecord(r.id, { tag: input.value });
      } else {
        for (const r of list) this.store.patchRecord(r.id, { name: input.value || r.name });
      }
    });
    input.addEventListener('change', () => this.history.commit());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
    });
    this._fields.push({ key, kind: 'text', input, records: () => this.records });
    return el('label.row', {}, [el('span', { text: label }), input]);
  }

  /* -------------------- Dönüşüm -------------------- */
  _buildTransform(list, first) {
    const isMulti = list.length > 1;
    const body = el('div.fs-body');

    body.append(
      this._vec3Field('position', i18n.t('inspector.field.position'), list.map((r) => r.position), isMulti, { step: 0.5, min: -1e6, max: 1e6 }),
      this._vec3Field('rotation', i18n.t('inspector.field.rotation'), list.map((r) => r.rotation), false, { step: 5, min: -1e6, max: 1e6, wrap: true }),
      this._vec3Field('scale', i18n.t('inspector.field.scale'), list.map((r) => r.scale), false, { step: 0.05, min: 0.001, max: 1e4 })
    );

    body.append(el('div.btn-row', {}, [
      this._actionButton(i18n.t('inspector.btn.reset'), ICONS.reset(13), () => this.handlers.onResetTransform?.()),
      this._actionButton(i18n.t('inspector.btn.snapGround'), ICONS.down(13), () => this.handlers.onSnapToGround?.()),
      this._actionButton(i18n.t('inspector.btn.focus'), ICONS.focus(13), () => this.handlers.onFocus?.()),
    ]));

    return el('fieldset.fieldset', {}, [el('legend', { i18n: 'inspector.group.transform' }), body]);
  }

  /**
   * 3 eksenli sayı grubu.
   * @param {'position'|'rotation'|'scale'} key
   */
  _vec3Field(key, label, initialValues, relative, opts = {}) {
    const grid = el('div.vec3');
    const inputs = [];

    for (let i = 0; i < 3; i++) {
      const axis = AXES[i];
      const tag = el('span.tag', {
        text: axis.toUpperCase(),
        i18nAttr: { title: 'inspector.axis.title' },
      });
      tag.title = i18n.t('inspector.axis.title', { axis: axis.toUpperCase() });

      const input = el('input', {
        type: 'text',
        inputmode: 'decimal',
        value: formatValue(initialValues[0]?.[i]),
        spellcheck: 'false',
      });

      const wrap = el('div.num-field', { class: AXIS_CLASS[i] }, [tag, input]);
      grid.append(wrap);
      inputs.push(input);

      // ---- yazma (input) ----
      const commit = (raw, isFinal) => {
        const value = parseFloat(String(raw).replace(',', '.'));
        if (!Number.isFinite(value)) {
          this._syncValues();
          return;
        }
        this._applyVector(key, i, clamp(value, opts.min ?? -1e9, opts.max ?? 1e9), relative, isFinal);
      };

      input.addEventListener('focus', () => this.history.begin(label));
      input.addEventListener('blur', () => {
        commit(input.value, true);
        this.history.commit();
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); return; }
        if (e.key === 'Escape') { this._syncValues(); input.blur(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const dir = e.key === 'ArrowUp' ? 1 : -1;
          const step = (opts.step || 1) * (e.shiftKey ? 10 : 1) * dir;
          input.value = String(clean(parseFloat(String(input.value).replace(',', '.')) + step));
          commit(input.value, false);
        }
      });
      input.addEventListener('change', () => { commit(input.value, true); this.history.commit(); });

      // ---- sürükle-ayar (scrub) ----
      tag.addEventListener('pointerdown', (e) => this._startScrub(e, {
        key, axisIndex: i, relative, opts, input, history: this.history,
      }));
    }

    this._fields.push({
      key, kind: 'vec3', inputs, label,
      records: () => this.records,
    });
    return el('div', { style: { marginBottom: '9px' } }, [
      el('div', {
        text: label,
        style: {
          fontSize: '10px', letterSpacing: '.6px', textTransform: 'uppercase',
          color: COLORS[key], fontWeight: '700', marginBottom: '4px',
        },
      }),
      grid,
    ]);
  }

  /** Etiket üzerinde sürükleme ile değer değiştirme. */
  _startScrub(event, { key, axisIndex, relative, opts, input, history }) {
    event.preventDefault();
    const tag = event.currentTarget;
    const startX = event.clientX;
    const startRaw = parseFloat(String(input.value).replace(',', '.')) || 0;
    const step = opts.step || 1;
    tag.setPointerCapture?.(event.pointerId);
    tag.classList.add('is-active');

    history.begin('dönüşüm');

    const onMove = (e) => {
      const dx = e.clientX - startX;
      const mult = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 0.1 : 1;
      const value = startRaw + dx * step * mult;
      input.value = String(clean(clamp(value, opts.min ?? -1e9, opts.max ?? 1e9), 4));
      this._applyVector(key, axisIndex, clean(clamp(value, opts.min ?? -1e9, opts.max ?? 1e9), 4), relative, false);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      tag.classList.remove('is-active');
      history.commit();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Bir eksen değerini kayıtlara uygular.
   *  - Konum ve çoklu seçim: FARK uygular (delta), böylece grup birlikte taşınır.
   *  - Diğer durumlar: MUTLAK değer uygular.
   */
  _applyVector(key, axis, value, relative, isFinal) {
    const list = this.records;
    if (!list.length) return;

    if (key === 'position' && relative) {
      const base = list[0].position[axis];
      const delta = value - base;
      for (const record of list) {
        const next = [...record.position];
        next[axis] = clean(next[axis] + delta, 4);
        this.store.patchRecord(record.id, { position: next });
      }
      return;
    }

    for (const record of list) {
      const current = [...record[key]];
      current[axis] = key === 'rotation' ? wrapAngle(value) : value;
      this.store.patchRecord(record.id, { [key]: current });
    }
    if (isFinal && key !== 'position') this._syncValues();
  }

  /* -------------------- Görünüm -------------------- */
  _buildAppearance(list, first) {
    const body = el('div.fs-body');
    const isMulti = list.length > 1;

    // Renk
    const colorInput = el('input.color', { type: 'color', value: first.color || '#9aa8bd' });
    colorInput.addEventListener('input', () => {
      if (!this.history.isApplying) this.history.begin('renk');
      for (const record of this.records) this.store.patchRecord(record.id, { color: colorInput.value });
    });
    colorInput.addEventListener('change', () => this.history.commit());
    this._fields.push({ key: 'color', kind: 'color', input: colorInput, records: () => this.records });

    body.append(el('label.row', {}, [el('span', { i18n: 'inspector.field.color' }), colorInput]));

    // Etiket (tag) — oyun motorunda gruplama için
    body.append(this._textField('tag', i18n.t('inspector.field.tag'), first.tag || '', isMulti));

    // Görünürlük / kilit
    const visBtn = el('button.btn', { type: 'button' }, [svg(ICONS.eye(13)), el('span', { i18n: 'inspector.btn.hide' })]);
    const lockBtn = el('button.btn', { type: 'button' }, [svg(ICONS.unlock(13)), el('span', { i18n: 'inspector.btn.lock' })]);
    visBtn.addEventListener('click', () => this.handlers.onToggleVisible?.());
    lockBtn.addEventListener('click', () => this.handlers.onToggleLock?.());
    this._visibilityBtn = visBtn;
    this._lockBtn = lockBtn;

    body.append(el('div.btn-row', {}, [visBtn, lockBtn]));

    // Gölük
    body.append(
      this._toggleField('castShadow', i18n.t('inspector.field.castShadow'), first.castShadow !== false),
      this._toggleField('receiveShadow', i18n.t('inspector.field.receiveShadow'), first.receiveShadow !== false)
    );

    return el('fieldset.fieldset', {}, [el('legend', { i18n: 'inspector.group.appearance' }), body]);
  }

  _toggleField(key, label, checked) {
    const input = el('input', { type: 'checkbox' });
    input.checked = checked;
    input.addEventListener('change', () => {
      this.history.begin(label);
      for (const record of this.records) this.store.patchRecord(record.id, { [key]: input.checked });
      this.history.commit();
    });
    this._fields.push({
      key, kind: 'checkbox', input,
      records: () => this.records,
    });
    // NOT: dış kapsayıcı <div> olmalı; <label> içinde <label> geçersiz HTML'dir.
    return el('div.row', {}, [
      el('span', { text: label }),
      el('label.switch', {}, [input, el('span')]),
    ]);
  }

  /* -------------------- Özel alanlar -------------------- */
  _buildProps(list, first) {
    // Dış kitaplık modelleri (`imp:…`) statik katalogda YOKTUR; onlar için
    // paylaşılan `importedLib` şeması kullanılır.
    const meta = getAsset(first.assetId) || getAsset(IMPORTED_LIB_ASSET);
    if (!meta?.propsSchema?.length) return null;

    const body = el('div.fs-body');
    const isMulti = list.length > 1;

    for (const schema of meta.propsSchema) {
      // DİKKAT: `schema.key` alan ADIDIR, `schema.def` ise varsayılan DEĞERDİR
      // (ör. num('terrainSize', …, 2048) → key:'terrainSize', def:2048).
      // `props[schema.def]` yazmak `props[2048]` arar ve her alanı boş gösterir.
      const value = first.props?.[schema.key];
      // Etiket sözlükten çözülür (bkz. catalog.js → i18n normalizasyonu);
      // `label` yalnızca anahtar yoksa (yeni alan) yedektir.
      const schemaLabel = getSchemaLabel(schema);
      let control;
      // `stateEl` = değer taşıyan GERÇEK form öğesi. Görsel düzen için
      // sarmalayıcı kullanılan alanlarda (checkbox) control !== stateEl.
      let stateEl = null;

      switch (schema.type) {
        case 'number': {
          control = el('input.input', {
            type: 'text', inputmode: 'decimal',
            value: formatValue(value, schema.nullable),
          });
          if (schema.nullable) control.placeholder = i18n.t('inspector.placeholder.auto');
          control.addEventListener('focus', () => this.history.begin(schemaLabel));
          control.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') control.blur();
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const d = (e.key === 'ArrowUp' ? 1 : -1) * (schema.step || 1) * (e.shiftKey ? 10 : 1);
              // Boş alanda ok tuşu → 0'dan başla, yoksa mevcut değerden devam et
              const cur = parseFloat(String(control.value).replace(',', '.')) || 0;
              this._setProp(schema, clamp(cur + d, schema.min ?? -1e9, schema.max ?? 1e9));
              control.value = String(clean(cur + d));
            }
          });
          control.addEventListener('change', () => {
            const raw = String(control.value).trim();
            // Boş bırakıldı: nullable alanlarda null (otomatik), diğerlerinde değişiklik yok
            if (raw === '' || raw === '-') {
              if (schema.nullable) this._setProp(schema, null);
              else this._syncValues();
              this.history.commit();
              return;
            }
            const v = parseFloat(raw.replace(',', '.'));
            if (Number.isFinite(v)) this._setProp(schema, clamp(v, schema.min ?? -1e9, schema.max ?? 1e9));
            this.history.commit();
            this._syncValues();
          });
          break;
        }
        case 'checkbox': {
          // Görsel düzen için <label class="switch"> sarmalayıcısı kullanılır,
          // ama DEĞER taşıyan öğe ham <input> olmalıdır. Sarmalayıcıyı
          // `_fields`'e koymak, `_syncValues`'in `.checked` ayarlamasını bir
          // <label> üzerinde yapmasına ve alanın canlı güncellemeyi sessizce
          // kaybetmesine yol açar.
          const box = el('input', { type: 'checkbox' });
          box.checked = value === true;
          box.addEventListener('change', () => {
            this.history.begin(schemaLabel);
            this._setProp(schema, box.checked);
            this.history.commit();
          });
          control = el('label.switch', {}, [box, el('span')]);
          stateEl = box;
          break;
        }
        case 'select': {
          control = el('select.select', { style: { width: '116px', height: '27px' } });
          for (const opt of schema.options) {
            // `value` değişmez (JSON'a yazılan ham değer), yalnızca METIN çevrilir.
            control.append(el('option', { value: opt.value, text: getOptionLabel(opt), selected: opt.value === value }));
          }
          control.addEventListener('change', () => {
            this.history.begin(schemaLabel);
            this._setProp(schema, control.value);
            this.history.commit();
          });
          break;
        }
        case 'color': {
          control = el('input.color', { type: 'color', value: value || '#ffffff' });
          control.addEventListener('input', () => {
            if (!this.history.isApplying) this.history.begin(schemaLabel);
            this._setProp(schema, control.value);
          });
          control.addEventListener('change', () => this.history.commit());
          break;
        }
        default: {
          control = el('input.input', { type: 'text', value: value ?? '', spellcheck: 'false' });
          control.classList.remove('has-icon');
          control.style.paddingLeft = '9px';
          control.addEventListener('focus', () => this.history.begin(schemaLabel));
          control.addEventListener('change', () => {
            this._setProp(schema, control.value);
            this.history.commit();
          });
          control.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') control.blur();
          });
        }
      }

      this._fields.push({
        key: `prop:${schema.key}`,
        kind: schema.type,
        input: control,                 // DOM'a eklenen düzen öğesi
        stateEl: stateEl || control,    // _syncValues'ın yazacağı gerçek öğe
        schema,
        records: () => this.records,
      });

      body.append(el('label.row', {}, [el('span', { text: schemaLabel }), control]));
    }

    // NPC'ye özel kısayol
    if (first.assetId === 'npc') {
      const jump = el('button.btn', { type: 'button' }, [
        svg(ICONS.focus(13)), el('span', { i18n: 'inspector.btn.npcJump' }),
      ]);
      jump.addEventListener('click', () => this.handlers.onNpcJump?.());
      body.append(el('div.btn-row', {}, [jump]));
    }

    return el('fieldset.fieldset', {}, [el('legend', { i18n: 'inspector.group.props' }), body]);
  }

  _setProp(schema, value) {
    for (const record of this.records) {
      const props = { ...(record.props || {}), [schema.key]: value };
      this.store.patchRecord(record.id, { props });
    }
  }

  /* -------------------- Eylemler -------------------- */
  _buildActions(list) {
    const dup = this._actionButton(i18n.t('inspector.btn.duplicate'), ICONS.copy(13), () => this.handlers.onDuplicate?.(), 'primary');
    const del = this._actionButton(i18n.t('inspector.btn.delete'), ICONS.trash(13), () => this.handlers.onDelete?.(), 'danger');
    del.style.flex = '0 0 auto';
    void list;
    return el('div.btn-row', { style: { marginTop: '2px' } }, [dup, del]);
  }

  _actionButton(label, iconHtml, onClick, variant = '') {
    const btn = el(`button.btn${variant ? '.' + variant : ''}`, { type: 'button', title: label }, [
      svg(iconHtml), el('span', { text: label }),
    ]);
    btn.addEventListener('click', (e) => onClick?.(e));
    return btn;
  }

  /* -------------------- Bilgi -------------------- */
  _buildInfo(record) {
    const box = el('div.fs-body');
    this._infoBox = box;
    this._infoRecord = record;
    this._syncInfo(record);
    return el('fieldset.fieldset', {}, [el('legend', { i18n: 'inspector.group.info' }), box]);
  }

  _syncInfo(record = this._infoRecord) {
    if (!this._infoBox || !record) return;
    const gercek = getAsset(record.assetId);
    const meta = gercek || getAsset(IMPORTED_LIB_ASSET);
    const footprint = meta?.footprint ?? [0, 0, 0];
    const disModel = !gercek;
    this._infoBox.innerHTML = '';
    // Etiketler sözlük anahtarı, değerler hesaplanmış metin.
    const rows = [
      ['inspector.info.type', gercek
        ? getAssetName(record.assetId)
        : i18n.t('inspector.info.external', { bicim: record.props?.bicim || 'glb' })],
      ['inspector.info.category', meta?.category ? getCategoryLabel(meta.category) : '—'],
      ['inspector.info.role', i18n.t(`role.${meta?.role || 'prop'}`)],
      ['inspector.info.worldPos', `${fmt(record.position[0], 2)}, ${fmt(record.position[1], 2)}, ${fmt(record.position[2], 2)}`],
      // Kitaplık modellerinin ölçüsü dosyadan, YÜKLEME SONRASI öğrenilir
      ['inspector.info.footprint', disModel
        ? (Number.isFinite(record.props?.yukseklik) && record.props.yukseklik > 0
          ? i18n.t('inspector.info.heightOnly', { yukseklik: fmt(record.props.yukseklik, 2) })
          : i18n.t('inspector.info.measuring'))
        : `${footprint.map((n) => fmt(n, 1)).join(' × ')}`],
      ['inspector.info.id', record.id],
    ];
    for (const [anahtar, deger] of rows) {
      this._infoBox.append(el('div.kv', {}, [
        el('span', { i18n: anahtar }),
        el('b', { text: String(deger), title: String(deger) }),
      ]));
    }
  }

  /* =======================================================================
     Değer senkronizasyonu (yeniden çizmeden)
     ======================================================================= */
  _syncValues() {
    if (this._isEditing()) return;    // kullanıcı yazıyor -> dokunma
    const list = this.records;
    if (!list.length) return;

    for (const field of this._fields) {
      if (typeof field.records !== 'function') continue;   // savunmacı: geçersiz alan
      const records = field.records();
      if (!records.length) continue;
      const first = records[0];

      if (field.kind === 'vec3') {
        const values = records.map((r) => r[field.key]);
        for (let i = 0; i < 3; i++) {
          const input = field.inputs[i];
          if (document.activeElement === input) continue;
          const same = values.every((v) => nearly(v[i], values[0][i], 1e-3));
          input.value = same ? formatValue(values[0][i]) : '—';
          input.classList.toggle('mixed', !same);
        }
        continue;
      }

      const input = field.input;
      const stateEl = field.stateEl || input;
      if (!input || document.activeElement === stateEl) continue;

      if (field.key.startsWith('prop:')) {
        const v = first.props?.[field.schema.key];
        if (field.kind === 'checkbox') stateEl.checked = v === true;
        else if (field.kind === 'select') stateEl.value = v ?? field.schema.def;
        else if (field.kind === 'color') stateEl.value = v || '#ffffff';
        // DİKKAT: yalnızca SAYI alanları formatValue'dan geçer. Metin alanları
        // ("source", "modelName" vb.) ham yazılmalıdır; sayıya çevirmek
        // "Moradon.npy" değerini NaN → "0" yapıyordu.
        else if (field.kind === 'number') stateEl.value = formatValue(v, field.schema.nullable);
        else stateEl.value = v ?? '';
        continue;
      }

      const values = records.map((r) => r[field.key]);
      const same = values.every((v) => v === values[0]);

      if (field.kind === 'checkbox') {
        stateEl.checked = first[field.key] !== false;
      } else if (field.kind === 'color') {
        stateEl.value = values[0] || '#9aa8bd';
      } else {
        stateEl.value = same ? (values[0] ?? '') : i18n.t('inspector.mixed', { count: records.length });
        stateEl.classList.toggle('mixed', !same);
      }
    }

    // Görünürlük / kilit düğmeleri
    if (this._visibilityBtn) {
      const visible = list.every((r) => r.visible);
      this._visibilityBtn.innerHTML = '';
      this._visibilityBtn.append(
        svg(visible ? ICONS.eye(13) : ICONS.eyeOff(13)),
        el('span', { i18n: visible ? 'inspector.btn.hide' : 'inspector.btn.show' }),
      );
    }
    if (this._lockBtn) {
      const locked = list.every((r) => r.locked);
      this._lockBtn.innerHTML = '';
      this._lockBtn.append(
        svg(locked ? ICONS.lock(13) : ICONS.unlock(13)),
        el('span', { i18n: locked ? 'inspector.btn.unlock' : 'inspector.btn.lock' }),
      );
    }
  }
}

/* -------------------------------------------------------------------------
   Yardımcılar
   ------------------------------------------------------------------------- */
/**
 * Sayı alanının görünen metnini üretir.
 *
 * `nullable` alanlarda null DEĞER DEĞİLDİR: boş kutuyu "otomatik" anlamına
 * gelir. Bu yüzden null için '0' yazmak yanlış olurdu — kullanıcı 0 yazmış gibi
 * görünür ve otomatik davranışı sessizce kapatmış olurdu.
 */
function formatValue(v, nullable = false) {
  if (v == null) return nullable ? '' : '0';
  const n = clean(Number(v), 4);
  return String(n);
}

function wrapAngle(deg) {
  return ((deg % 360) + 360) % 360;
}
