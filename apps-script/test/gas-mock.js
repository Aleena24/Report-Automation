// Minimal in-memory mocks of the Google Apps Script services used by src/Code.gs.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function pad(arr, n) { const a = arr.slice(); while (a.length < n) a.push(''); return a; }

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.values[this.r - 1 + i] || [];
      out.push(pad(row, this.c - 1 + this.nc).slice(this.c - 1, this.c - 1 + this.nc));
    }
    return out;
  }
  setValues(v) {
    for (let i = 0; i < v.length; i++) {
      const ri = this.r - 1 + i;
      while (this.sheet.values.length <= ri) this.sheet.values.push([]);
      const row = pad(this.sheet.values[ri], this.c - 1 + v[i].length);
      for (let j = 0; j < v[i].length; j++) row[this.c - 1 + j] = v[i][j];
      this.sheet.values[ri] = row;
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setNumberFormat() { return this; } setNote(n) { this.sheet.notes[this.r + ',' + this.c] = n; return this; } setWrap() { return this; }
}

class Sheet {
  constructor(ss, name, values) { this.ss = ss; this.name = name; this.values = (values || []).map(r => r.slice()); this.notes = {}; this.id = Math.floor(Math.random() * 1e9); this.frozen = 0; }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() { let n = this.values.length; while (n > 0 && this.values[n - 1].every(v => v === '' || v === null || v === undefined)) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.values.map(r => r.length)); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
  appendRow(arr) { this.values.push(arr.slice()); return this; }
  setFrozenRows(n) { this.frozen = n; } autoResizeColumns() {} setColumnWidth() {}
}

class Spreadsheet {
  constructor(tabs) { this.sheets = []; Object.keys(tabs || {}).forEach(n => this.sheets.push(new Sheet(this, n, tabs[n]))); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(name, index) { const s = new Sheet(this, name, []); if (index === undefined) this.sheets.push(s); else this.sheets.splice(index, 0, s); return s; }
  getSheets() { return this.sheets.slice(); }
  getName() { return 'Sahrdaya Daily Action Points Tracker'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/TESTSHEET/edit'; }
  getId() { return 'TESTSHEET'; }
}

// Utilities.formatDate for the patterns used in Code.gs
function formatDate(d, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long' })
    .formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const map = {
    'yyyy': parts.year, 'MM': parts.month, 'dd': parts.day, 'MMM': months[+parts.month - 1],
    'EEEE': parts.weekday, 'EEE': parts.weekday.slice(0, 3), 'HH': parts.hour === '24' ? '00' : parts.hour, 'mm': parts.minute,
  };
  return pattern.replace(/yyyy|MMM|MM|dd|EEEE|EEE|HH|mm/g, t => map[t]);
}

function createEnv(tabs, nowIso) {
  const ss = new Spreadsheet(tabs);
  const sent = [];
  const triggers = [];
  const logs = [];
  const ui = { alerts: [], menus: [] };
  const ctx = {
    console,
    __TEST_NOW__: nowIso || null,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getUi: () => ({
        alert: (a, b) => { ui.alerts.push(b === undefined ? a : b); },
        ButtonSet: { OK: 'OK' },
        createMenu: (name) => { const m = { name, items: [], addItem(l, f) { this.items.push([l, f]); return this; }, addSeparator() { return this; }, addToUi() { ui.menus.push(m); } }; return m; },
      }),
    },
    MailApp: { sendEmail: (o) => { sent.push(o); }, getRemainingDailyQuota: () => 100 },
    Utilities: { formatDate },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => {
        const t = { fn, getHandlerFunction: () => fn };
        const b = { timeBased: () => b, everyDays: () => b, atHour: (h) => { t.hour = h; return b; }, nearMinute: (m) => { t.minute = m; return b; }, inTimezone: (z) => { t.tz = z; return b; }, create: () => { triggers.push(t); return t; } };
        return b;
      },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'tester@sahrdaya.ac.in' }), getScriptTimeZone: () => 'Asia/Kolkata' },
    Logger: { log: (m) => logs.push(String(m)) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  return { ctx, ss, sent, triggers, logs, ui, setNow: (iso) => { ctx.__TEST_NOW__ = iso; } };
}

module.exports = { createEnv, Spreadsheet, Sheet };
