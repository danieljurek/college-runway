const now = new Date();
const BASE_DATE = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
const STORAGE_KEY = "college-runway-v1";
const MIN_CHILDREN = 1;
const MAX_CHILDREN = 10;
const MAX_LUMP_SUM = 100000;
const COLORS = ["#76a8e8", "#ffad84", "#e5c45e", "#8fcf9d", "#bb9ee8", "#69bfc2", "#e68aae", "#9caf72", "#dd8f5b", "#7d9fd4"];

const defaultState = {
  lumpSum: 100000,
  costType: "in",
  costs: { in: 32000, out: 55000 },
  inflation: 4.5,
  scenario: "base",
  returns: {
    conservative: { stock: 4.5, bond: 2.5, cash: 1.5 },
    base: { stock: 7.0, bond: 3.5, cash: 2.5 },
    optimistic: { stock: 9.0, bond: 4.75, cash: 3.25 }
  },
  expenseRatio: 0.13,
  showChartLabels: true,
  allocations: [100 / 3, 100 / 3, 100 / 3],
  kids: [
    { name: "Child 1", birthday: "2018-01-01", enrollmentYear: 2036, fundStart: 2036, existing: 0, annualContribution: 0 },
    { name: "Child 2", birthday: "2020-01-01", enrollmentYear: 2039, fundStart: 2038, existing: 0, annualContribution: 0 },
    { name: "Child 3", birthday: "2023-01-01", enrollmentYear: 2042, fundStart: 2040, existing: 0, annualContribution: 0 }
  ]
};

// Vanguard's published asset-class allocations as of July 1, 2026. The x value
// is years until the portfolio band's midpoint. Interpolation approximates the
// quarterly glide-path changes described in the program description.
const glideAnchors = [
  { x: -4, stock: 11.6, bond: 28.4, cash: 60.0 },
  { x: -2, stock: 13.04, bond: 31.93, cash: 55.03 },
  { x: 0, stock: 16.91, bond: 41.43, cash: 41.66 },
  { x: 2, stock: 20.78, bond: 50.83, cash: 28.39 },
  { x: 4, stock: 29.14, bond: 55.83, cash: 15.03 },
  { x: 6, stock: 44.82, bond: 53.5, cash: 1.68 },
  { x: 8, stock: 54.0, bond: 46.0, cash: 0 },
  { x: 10, stock: 63.5, bond: 36.5, cash: 0 },
  { x: 12, stock: 75.5, bond: 24.5, cash: 0 },
  { x: 14, stock: 86.0, bond: 14.0, cash: 0 },
  { x: 16, stock: 94.0, bond: 6.0, cash: 0 },
  { x: 18, stock: 95.0, bond: 5.0, cash: 0 }
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const displayDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function clampAnnualContribution(value) { return Math.max(0, Math.min(25000, Number(value) || 0)); }
function equalAllocations(count) { return Array.from({ length: count }, () => 100 / count); }
function kidColor(index) { return COLORS[index % COLORS.length]; }
function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
function formatLumpSumInput(value) {
  return wholeNumber.format(Math.round(boundedNumber(value, 0, MAX_LUMP_SUM, 0)));
}
function parseLumpSumInput(value) {
  const digits = String(value).replace(/[^\d]/g, "");
  return digits ? boundedNumber(digits, 0, MAX_LUMP_SUM, 0) : 0;
}

function normalizeAllocations(values, count = defaultState.kids.length) {
  if (!Array.isArray(values) || values.length !== count) return equalAllocations(count);
  const cleaned = values.slice(0, count).map(value => Math.max(0, Number(value) || 0));
  const total = cleaned.reduce((sum, value) => sum + value, 0);
  return total > 0 ? cleaned.map(value => value / total * 100) : equalAllocations(count);
}

function childTemplate(index, previousKid) {
  const priorEnrollment = Number(previousKid?.enrollmentYear);
  const enrollmentYear = Math.min(2060, Number.isFinite(priorEnrollment) ? priorEnrollment + 2 : BASE_DATE.getFullYear() + 18);
  return {
    name: `Child ${index + 1}`,
    birthday: "",
    enrollmentYear,
    fundStart: Math.min(2044, enrollmentYear % 2 === 0 ? enrollmentYear : enrollmentYear - 1),
    existing: 0,
    annualContribution: 0
  };
}

function normalizeState(saved) {
  const base = deepClone(defaultState);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return base;
  const normalized = {
    ...base,
    lumpSum: boundedNumber(saved.lumpSum, 0, MAX_LUMP_SUM, base.lumpSum),
    costType: ["in", "out"].includes(saved.costType) ? saved.costType : base.costType,
    costs: {
      in: boundedNumber(saved.costs?.in, 10000, 100000, base.costs.in),
      out: boundedNumber(saved.costs?.out, 10000, 100000, base.costs.out)
    },
    inflation: boundedNumber(saved.inflation, -5, 10, base.inflation),
    scenario: ["conservative", "base", "optimistic"].includes(saved.scenario) ? saved.scenario : base.scenario,
    expenseRatio: boundedNumber(saved.expenseRatio, 0, 2, base.expenseRatio),
    showChartLabels: typeof saved.showChartLabels === "boolean" ? saved.showChartLabels : base.showChartLabels
  };
  const returnBounds = { stock: [-10, 20], bond: [-10, 15], cash: [-5, 10] };
  normalized.returns = Object.fromEntries(Object.keys(base.returns).map(scenario => [
    scenario,
    Object.fromEntries(Object.keys(base.returns[scenario]).map(asset => [
      asset,
      boundedNumber(saved.returns?.[scenario]?.[asset], returnBounds[asset][0], returnBounds[asset][1], base.returns[scenario][asset])
    ]))
  ]));
  const availableFunds = Array.from({ length: 11 }, (_, i) => 2024 + i * 2);
  const incomingKids = Array.isArray(saved.kids) && saved.kids.length >= MIN_CHILDREN
    ? saved.kids.slice(0, MAX_CHILDREN)
    : base.kids;
  const normalizedKids = [];
  incomingKids.forEach((incomingValue, index) => {
    const kid = base.kids[index] || childTemplate(index, normalizedKids[index - 1]);
    const incoming = incomingValue && typeof incomingValue === "object" ? incomingValue : {};
    const fundStart = Number(incoming.fundStart);
    normalizedKids.push({
      name: typeof incoming.name === "string" ? incoming.name.slice(0, 80) : kid.name,
      birthday: incoming.birthday === "" || /^\d{4}-\d{2}-\d{2}$/.test(incoming.birthday || "") ? incoming.birthday : kid.birthday,
      enrollmentYear: Math.round(boundedNumber(incoming.enrollmentYear, 2026, 2060, kid.enrollmentYear)),
      fundStart: availableFunds.includes(fundStart) ? fundStart : kid.fundStart,
      existing: boundedNumber(incoming.existing, 0, 10000000, kid.existing),
      annualContribution: clampAnnualContribution(incoming.annualContribution)
    });
  });
  normalized.kids = normalizedKids;
  normalized.allocations = normalizeAllocations(saved.allocations, normalized.kids.length);
  return normalized;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? normalizeState(saved) : deepClone(defaultState);
  } catch { return deepClone(defaultState); }
}

let state = loadState();
let saveTimer;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const status = document.getElementById("saveStatus");
  status.lastChild.textContent = " Saved in this browser";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { status.lastChild.textContent = " Saved in this browser"; }, 800);
}

function encodeSnapshot() {
  const payload = { app: "college-runway", version: 1, exportedAt: new Date().toISOString(), state };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSnapshot(code) {
  const clean = String(code || "").trim().replace(/\s/g, "");
  if (!clean || clean.length > 50000 || !/^[A-Za-z0-9_-]+$/.test(clean)) throw new Error("That does not look like a valid College Runway code.");
  const standard = clean.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - standard.length % 4) % 4);
  let binary;
  try { binary = atob(padded); } catch { throw new Error("The Base64 code could not be decoded."); }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("The decoded snapshot is not valid JSON."); }
  if (payload?.app !== "college-runway" || payload?.version !== 1 || !payload.state) throw new Error("This snapshot is not a supported College Runway export.");
  return normalizeState(payload.state);
}

function yearFloat(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear() + 1, 0, 1);
  return date.getFullYear() + (date - start) / (end - start);
}

const BASE_YEAR = yearFloat(BASE_DATE);

function mixFor(fundStart, atYear) {
  const yearsToTarget = fundStart + 0.5 - atYear;
  if (yearsToTarget <= glideAnchors[0].x) return { ...glideAnchors[0] };
  if (yearsToTarget >= glideAnchors.at(-1).x) return { ...glideAnchors.at(-1) };
  const upperIndex = glideAnchors.findIndex(anchor => anchor.x >= yearsToTarget);
  const lower = glideAnchors[upperIndex - 1];
  const upper = glideAnchors[upperIndex];
  const t = (yearsToTarget - lower.x) / (upper.x - lower.x);
  return {
    stock: lower.stock + (upper.stock - lower.stock) * t,
    bond: lower.bond + (upper.bond - lower.bond) * t,
    cash: lower.cash + (upper.cash - lower.cash) * t
  };
}

function annualReturn(fundStart, atYear) {
  const mix = mixFor(fundStart, atYear);
  const assumptions = state.returns[state.scenario];
  return (mix.stock * assumptions.stock + mix.bond * assumptions.bond + mix.cash * assumptions.cash) / 10000 - state.expenseRatio / 100;
}

function growthFactor(fundStart, fromYear, toYear) {
  if (toYear <= fromYear) return 1;
  let factor = 1;
  let cursor = fromYear;
  while (cursor < toYear - 0.0001) {
    const step = Math.min(0.25, toYear - cursor);
    factor *= Math.pow(1 + annualReturn(fundStart, cursor + step / 2), step);
    cursor += step;
  }
  return factor;
}

function collegeCostAt(year, type = state.costType) {
  return state.costs[type] * Math.pow(1 + state.inflation / 100, year + 0.67 - BASE_YEAR);
}

function annualContributionDates(kid, throughYear = kid.enrollmentYear + 0.67) {
  const dates = [];
  for (let date = BASE_YEAR + 1; date < kid.enrollmentYear + 0.67 && date <= throughYear; date += 1) {
    dates.push(date);
  }
  return dates;
}

function annualContributionsValue(kid, throughYear) {
  const amount = clampAnnualContribution(kid.annualContribution);
  return annualContributionDates(kid, throughYear)
    .reduce((total, date) => total + amount * growthFactor(kid.fundStart, date, throughYear), 0);
}

function accountValueAt(kid, index, throughYear) {
  const contribution = state.lumpSum * state.allocations[index] / 100;
  const starting = Math.max(0, Number(kid.existing) || 0) + contribution;
  return starting * growthFactor(kid.fundStart, BASE_YEAR, throughYear) + annualContributionsValue(kid, throughYear);
}

function recommendedFund(enrollmentYear) {
  return enrollmentYear % 2 === 0 ? enrollmentYear : enrollmentYear - 1;
}

function inferredEnrollmentYear(birthday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday || "")) return null;
  const [, month, day] = birthday.split("-").map(Number);
  const birthYear = Number(birthday.slice(0, 4));
  const afterSeptFirst = month > 9 || (month === 9 && day > 1);
  return birthYear + 5 + (afterSeptFirst ? 1 : 0) + 13;
}

function projectKid(kid, index) {
  const contribution = state.lumpSum * state.allocations[index] / 100;
  const starting = Math.max(0, Number(kid.existing) || 0) + contribution;
  const enrollmentPoint = kid.enrollmentYear + 0.67;
  const preCollegeFactor = growthFactor(kid.fundStart, BASE_YEAR, enrollmentPoint);
  const annualContribution = clampAnnualContribution(kid.annualContribution);
  const annualDates = annualContributionDates(kid);
  const annualContributionsAtEnrollment = annualContributionsValue(kid, enrollmentPoint);
  const atEnrollment = starting * preCollegeFactor + annualContributionsAtEnrollment;
  const costs = Array.from({ length: 4 }, (_, i) => collegeCostAt(kid.enrollmentYear + i));

  let requiredAtEnrollment = costs[3];
  for (let i = 2; i >= 0; i--) {
    const intervalGrowth = growthFactor(kid.fundStart, kid.enrollmentYear + i + 0.67, kid.enrollmentYear + i + 1 + 0.67);
    requiredAtEnrollment = costs[i] + requiredAtEnrollment / intervalGrowth;
  }

  let balance = atEnrollment;
  let covered = 0;
  costs.forEach((cost, i) => {
    const paid = Math.min(Math.max(balance, 0), cost);
    covered += paid;
    balance -= paid;
    if (i < 3 && balance > 0) {
      balance *= growthFactor(kid.fundStart, kid.enrollmentYear + i + 0.67, kid.enrollmentYear + i + 1 + 0.67);
    }
  });
  const graduationBalance = balance > 0
    ? balance * growthFactor(kid.fundStart, kid.enrollmentYear + 3.67, kid.enrollmentYear + 4.67)
    : 0;

  const requiredToday = requiredAtEnrollment / preCollegeFactor;
  const annualContributionsToday = annualContributionsAtEnrollment / preCollegeFactor;
  const lumpNeededAfterAnnual = Math.max(0, (requiredAtEnrollment - annualContributionsAtEnrollment) / preCollegeFactor);
  const gapToday = Math.max(0, lumpNeededAfterAnnual - starting);
  return {
    contribution, starting, atEnrollment, costs,
    totalCost: costs.reduce((a, b) => a + b, 0),
    requiredAtEnrollment, ending: Math.max(0, graduationBalance),
    covered, coverage: Math.min(1, atEnrollment / requiredAtEnrollment),
    requiredToday, annualContributionsToday, lumpNeededAfterAnnual, gapToday,
    annualContribution, annualContributionCount: annualDates.length,
    annualContributionTotal: annualContribution * annualDates.length,
    annualContributionsAtEnrollment
  };
}

function simulateFamilyPool() {
  const balances = state.kids.map((kid, index) => Math.max(0, Number(kid.existing) || 0) + state.lumpSum * state.allocations[index] / 100);
  const events = [];

  state.kids.forEach((kid, index) => {
    annualContributionDates(kid).forEach(date => {
      events.push({ date, type: "contribution", kidIndex: index, amount: clampAnnualContribution(kid.annualContribution) });
    });
    for (let collegeYear = 0; collegeYear < 4; collegeYear++) {
      events.push({
        date: kid.enrollmentYear + collegeYear + 0.67,
        type: "withdrawal",
        kidIndex: index,
        amount: collegeCostAt(kid.enrollmentYear + collegeYear)
      });
    }
  });

  const eventPriority = { contribution: 0, withdrawal: 1 };
  events.sort((a, b) => a.date - b.date || eventPriority[a.type] - eventPriority[b.type]);
  let cursor = BASE_YEAR;
  let firstShortfall = null;

  events.forEach(event => {
    balances.forEach((balance, index) => {
      balances[index] = balance * growthFactor(state.kids[index].fundStart, cursor, event.date);
    });
    cursor = event.date;

    if (event.type === "contribution") {
      balances[event.kidIndex] += event.amount;
      return;
    }

    let remaining = event.amount;
    const withdrawalOrder = balances
      .map((balance, index) => ({ balance, index, expectedReturn: annualReturn(state.kids[index].fundStart, event.date) }))
      .sort((a, b) => a.expectedReturn - b.expectedReturn);
    withdrawalOrder.forEach(account => {
      if (remaining <= 0) return;
      const paid = Math.min(balances[account.index], remaining);
      balances[account.index] -= paid;
      remaining -= paid;
    });
    if (remaining > 0.01 && !firstShortfall) firstShortfall = { date: event.date, amount: remaining };
  });

  return { firstShortfall, lastBillYear: Math.max(...state.kids.map(kid => Number(kid.enrollmentYear))) + 3 };
}

function fundLabel(start) { return `Target Enrollment ${start}/${start + 1}`; }

function addChild() {
  if (state.kids.length >= MAX_CHILDREN) return false;
  const previousCount = state.kids.length;
  const nextCount = previousCount + 1;
  state.kids.push(childTemplate(previousCount, state.kids.at(-1)));
  state.allocations = [
    ...state.allocations.map(value => value * previousCount / nextCount),
    100 / nextCount
  ];
  return true;
}

function removeChild(index) {
  if (state.kids.length <= MIN_CHILDREN || index < 0 || index >= state.kids.length) return false;
  state.kids.splice(index, 1);
  state.allocations.splice(index, 1);
  state.kids.forEach((kid, kidIndex) => {
    if (/^Child \d+$/.test(kid.name)) kid.name = `Child ${kidIndex + 1}`;
  });
  state.allocations = normalizeAllocations(state.allocations, state.kids.length);
  return true;
}

function renderControls() {
  document.getElementById("lumpSum").value = Math.min(state.lumpSum, MAX_LUMP_SUM);
  document.getElementById("lumpSumNumber").value = formatLumpSumInput(state.lumpSum);
  document.querySelectorAll("[data-cost-type]").forEach(button => button.classList.toggle("active", button.dataset.costType === state.costType));
  document.getElementById("collegeCost").value = state.costs[state.costType];
  document.getElementById("collegeCostOutput").textContent = money.format(state.costs[state.costType]);
  document.getElementById("inflation").value = state.inflation;
  document.getElementById("inflationOutput").textContent = `${state.inflation.toFixed(2).replace(/\.00$/, "")}%`;
  document.querySelectorAll("[data-scenario]").forEach(button => {
    const active = button.dataset.scenario === state.scenario;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active);
  });
  const returns = state.returns[state.scenario];
  document.getElementById("stockReturn").value = returns.stock;
  document.getElementById("bondReturn").value = returns.bond;
  document.getElementById("cashReturn").value = returns.cash;
  document.getElementById("expenseRatio").value = state.expenseRatio;
  const addButton = document.getElementById("addChildButton");
  addButton.disabled = state.kids.length >= MAX_CHILDREN;
  addButton.textContent = state.kids.length >= MAX_CHILDREN ? `Maximum ${MAX_CHILDREN} children` : "+ Add child";
}

function fundOptions(selected) {
  return Array.from({ length: 11 }, (_, i) => 2024 + i * 2)
    .map(start => `<option value="${start}" ${start === selected ? "selected" : ""}>${fundLabel(start)}</option>`).join("");
}

function renderKids(projections) {
  const grid = document.getElementById("childGrid");
  grid.innerHTML = state.kids.map((kid, index) => {
    const p = projections[index];
    const recommended = recommendedFund(Number(kid.enrollmentYear));
    const aligned = Number(kid.fundStart) === recommended;
    const inferred = inferredEnrollmentYear(kid.birthday);
    const enrollmentNote = inferred === null
      ? "Enter a birthday to check the Sept. 1 cutoff"
      : inferred === Number(kid.enrollmentYear)
        ? "Matches birthday + Sept. 1 cutoff"
        : `Birthday suggests ${inferred}; using your ${kid.enrollmentYear} override`;
    const color = kidColor(index);
    return `
      <article class="child-card" style="--kid-color:${color}">
        <div class="child-card-toolbar">
          <span>Account ${index + 1}</span>
          <button class="remove-child-button" data-remove-child="${index}" type="button" ${state.kids.length <= MIN_CHILDREN ? "disabled" : ""} aria-label="Remove ${escapeHtml(kid.name)}">Remove child</button>
        </div>
        <div class="child-card-head">
          <input class="child-name" data-kid="${index}" data-field="name" value="${escapeHtml(kid.name)}" aria-label="Child ${index + 1} name" />
          <div class="allocation-badge"><strong>${money.format(p.contribution)}</strong><span>${state.allocations[index].toFixed(1).replace(".0", "")}% of lump sum</span></div>
        </div>
        <div class="kid-allocation">
          <input class="range" data-allocation="${index}" type="range" min="0" max="100" step="any" value="${state.allocations[index]}" aria-label="${escapeHtml(kid.name)} allocation percentage" />
          <div class="kid-allocation-meta"><span>$0</span><span>Share of today’s contribution</span><span>${money.format(state.lumpSum)}</span></div>
        </div>
        <div class="annual-control">
          <div class="annual-control-heading">
            <div><span>Additional annual contribution</span><small>Once a year until college</small></div>
            <output data-annual-output="${index}">${money.format(p.annualContribution)}<small>/ year</small></output>
          </div>
          <input class="range" data-annual="${index}" type="range" min="0" max="25000" step="100" value="${p.annualContribution}" aria-label="${escapeHtml(kid.name)} additional annual contribution" />
          <div class="kid-allocation-meta"><span>$0</span><span>${p.annualContributionCount} planned contributions · ${money.format(p.annualContributionTotal)} total</span><span>$25k</span></div>
        </div>
        <div class="field-grid">
          <label class="field"><span>Birthday</span><input data-kid="${index}" data-field="birthday" type="date" value="${kid.birthday}" /></label>
          <label class="field"><span>Existing 529 balance</span><div class="money-field">$<input data-kid="${index}" data-field="existing" type="number" min="0" step="100" value="${kid.existing}" /></div></label>
          <label class="field"><span>College starts</span><input data-kid="${index}" data-field="enrollmentYear" type="number" min="2026" max="2060" step="1" value="${kid.enrollmentYear}" title="${enrollmentNote}" /></label>
          <label class="field"><span>Current Vanguard portfolio</span><select data-kid="${index}" data-field="fundStart">${fundOptions(Number(kid.fundStart))}</select></label>
          <div class="fund-check ${aligned ? "" : "warning"}">
            <span aria-hidden="true">${aligned ? "✓" : "!"}</span>
            <span>${aligned ? `<strong>Calendar match.</strong> ${fundLabel(recommended)} includes ${kid.enrollmentYear}.` : `<strong>Review this fund.</strong> A ${kid.enrollmentYear} college start maps to ${fundLabel(recommended)}. The selected fund de-risks about ${Math.abs(recommended - kid.fundStart)} years ${kid.fundStart < recommended ? "earlier" : "later"}.`}</span>
          </div>
        </div>
        <div class="card-outcome">
          <div class="card-metric"><span>At enrollment</span><strong>${compactMoney.format(p.atEnrollment)}</strong></div>
          <div class="card-metric"><span>Needed at enrollment</span><strong>${compactMoney.format(p.requiredAtEnrollment)}</strong></div>
          <div class="card-metric"><span>${p.gapToday > 1 ? "Add today to fund" : "After year four"}</span><strong>${compactMoney.format(p.gapToday > 1 ? p.gapToday : p.ending)}</strong></div>
        </div>
        <div class="coverage"><div class="coverage-fill" style="width:${p.coverage * 100}%"></div></div>
        <div class="coverage-copy"><span>Projected funding</span><strong>${Math.round(p.coverage * 100)}%</strong></div>
      </article>`;
  }).join("");
}

function renderSummary(projections) {
  const totalStarting = projections.reduce((sum, p) => sum + p.starting, 0);
  const totalAnnualContributionsToday = projections.reduce((sum, p) => sum + p.annualContributionsToday, 0);
  const totalResourcesToday = totalStarting + totalAnnualContributionsToday;
  const totalTargetToday = projections.reduce((sum, p) => sum + p.requiredToday, 0);
  const pooledCoverage = totalTargetToday > 0 ? totalResourcesToday / totalTargetToday : 0;
  const netPosition = totalResourcesToday - totalTargetToday;
  const timeline = simulateFamilyPool();
  const scenarioName = state.scenario[0].toUpperCase() + state.scenario.slice(1);
  document.getElementById("resultContext").textContent = `${scenarioName} returns · ${state.costType === "in" ? "Public in-state" : "Public out-of-state"} · ${state.inflation}% college inflation`;
  document.getElementById("summaryGrid").innerHTML = `
    <div class="summary-item"><span>Today-equivalent resources</span><strong>${compactMoney.format(totalResourcesToday)}</strong><em>${compactMoney.format(totalStarting)} now + ${compactMoney.format(totalAnnualContributionsToday)} planned PV</em></div>
    <div class="summary-item"><span>Today-equivalent target</span><strong>${compactMoney.format(totalTargetToday)}</strong><em>All ${state.kids.length} college ${state.kids.length === 1 ? "goal" : "goals"} on one date</em></div>
    <div class="summary-item"><span>Pooled family coverage</span><strong>${Math.round(pooledCoverage * 100)}%</strong><em>Assumes sibling transfers as needed</em></div>
    <div class="summary-item"><span>Net family position</span><strong>${netPosition >= 0 ? "+" : ""}${compactMoney.format(netPosition)}</strong><em class="${netPosition < 0 || timeline.firstShortfall ? "negative" : ""}">${timeline.firstShortfall ? `Pooled cash-flow shortfall begins ${Math.floor(timeline.firstShortfall.date)}` : `Every modeled bill covered through ${timeline.lastBillYear}`}</em></div>`;
}

function chartSeries(kid, index) {
  const p = projectKid(kid, index);
  const enrollment = kid.enrollmentYear + 0.67;
  const accumulation = [{ year: BASE_YEAR, value: p.starting }];
  for (let year = Math.ceil(BASE_YEAR); year <= kid.enrollmentYear; year++) {
    const pointYear = Math.min(year + 0.67, enrollment);
    if (pointYear > accumulation.at(-1).year) accumulation.push({ year: pointYear, value: accountValueAt(kid, index, pointYear) });
  }
  if (accumulation.at(-1).year < enrollment) accumulation.push({ year: enrollment, value: p.atEnrollment });

  return { accumulation, target: p.requiredAtEnrollment, enrollment, atEnrollment: p.atEnrollment };
}

function fourYearCostAtPoint(type, startYear) {
  const annualInflation = 1 + state.inflation / 100;
  let total = 0;
  for (let collegeYear = 0; collegeYear < 4; collegeYear++) {
    total += state.costs[type] * Math.pow(annualInflation, startYear - BASE_YEAR + collegeYear);
  }
  return total;
}

function costChartSeries(type, endYear) {
  const points = [{ year: BASE_YEAR, value: fourYearCostAtPoint(type, BASE_YEAR) }];
  for (let year = Math.ceil(BASE_YEAR); year <= Math.floor(endYear); year++) {
    const pointYear = Math.min(year + 0.67, endYear);
    if (pointYear > points.at(-1).year) {
      points.push({
        year: pointYear,
        value: fourYearCostAtPoint(type, pointYear)
      });
    }
  }
  if (points.at(-1).year < endYear) {
    points.push({
      year: endYear,
      value: fourYearCostAtPoint(type, endYear)
    });
  }
  return points;
}

function chartValueLabel(text, labelX, labelY, color, anchor = "start", textClass = "chart-label") {
  const width = Math.max(50, text.length * 6.4 + 14);
  const height = 20;
  const rectX = anchor === "end" ? labelX - width : labelX;
  const textX = anchor === "end" ? labelX - 7 : labelX + 7;
  return `<g><rect class="chart-value-box" x="${rectX}" y="${labelY - 14}" width="${width}" height="${height}" rx="4" stroke="${color}" stroke-opacity=".22"/><text class="${textClass}" fill="${color}" x="${textX}" y="${labelY}" text-anchor="${anchor}">${text}</text></g>`;
}

function renderChart() {
  const svg = document.getElementById("growthChart");
  const series = state.kids.map(chartSeries);
  const latestEnrollment = Math.max(...state.kids.map(k => Number(k.enrollmentYear)));
  const chartEnd = latestEnrollment + 3.67;
  const costEnd = chartEnd;
  const costSeries = {
    in: costChartSeries("in", costEnd),
    out: costChartSeries("out", costEnd)
  };
  const minX = Math.floor(BASE_YEAR);
  const maxX = Math.ceil(chartEnd);
  const childValues = series.flatMap(item => [...item.accumulation, { value: item.target }]).map(point => point.value);
  const maxYRaw = Math.max(1000, ...childValues, ...costSeries.in.map(p => p.value), ...costSeries.out.map(p => p.value));
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxYRaw)));
  const maxY = Math.ceil(maxYRaw / magnitude * 1.15) * magnitude;
  const plot = { left: 74, right: 930, top: 24, bottom: 322 };
  const x = year => plot.left + (year - minX) / (maxX - minX) * (plot.right - plot.left);
  const y = value => plot.bottom - value / maxY * (plot.bottom - plot.top);
  let markup = "";
  let labelMarkup = "";
  for (let i = 0; i <= 4; i++) {
    const value = maxY * i / 4;
    const yy = y(value);
    markup += `<line class="chart-grid" x1="${plot.left}" y1="${yy}" x2="${plot.right}" y2="${yy}"/><text class="chart-axis" x="${plot.left - 12}" y="${yy + 4}" text-anchor="end">${compactMoney.format(value)}</text>`;
  }
  const yearStep = maxX - minX > 14 ? 4 : 2;
  for (let year = Math.ceil(minX / yearStep) * yearStep; year <= maxX; year += yearStep) {
    markup += `<text class="chart-axis" x="${x(year)}" y="${plot.bottom + 30}" text-anchor="middle">${year}</text>`;
  }
  [{ type: "in", color: "#52786a", label: "In-state" }, { type: "out", color: "#bf5a4a", label: "Out-of-state" }].forEach(item => {
    const points = costSeries[item.type];
    const coords = points.map(point => `${x(point.year).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const last = points.at(-1);
    const label = `${item.label} ${compactMoney.format(last.value)} / 4 yrs`;
    markup += `<polyline class="cost-line" stroke="${item.color}" points="${coords}"/>`;
    labelMarkup += chartValueLabel(label, x(last.year) - 9, y(last.value) - 8, item.color, "end", "cost-label");
  });
  series.forEach((item, index) => {
    const accumulationCoords = item.accumulation.map(point => `${x(point.year).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const enrollmentX = x(item.enrollment);
    const color = kidColor(index);
    markup += `<polyline class="chart-line" stroke="${color}" points="${accumulationCoords}"/><circle class="chart-end" fill="${color}" cx="${enrollmentX}" cy="${y(item.atEnrollment)}" r="6"/><circle class="target-dot" stroke="${color}" cx="${enrollmentX}" cy="${y(item.target)}" r="7"/>`;
    labelMarkup += chartValueLabel(compactMoney.format(item.atEnrollment), enrollmentX + 9, y(item.atEnrollment) + 4, color);
    labelMarkup += chartValueLabel(`${compactMoney.format(item.target)} target`, enrollmentX + 9, y(item.target) - 7, color, "start", "target-label");
  });
  svg.innerHTML = markup + (state.showChartLabels ? labelMarkup : "");
  const labelsToggle = document.getElementById("chartLabelsToggle");
  labelsToggle.setAttribute("aria-pressed", String(state.showChartLabels));
  document.getElementById("chartLabelsState").textContent = state.showChartLabels ? "On" : "Off";
  const kidLegend = state.kids.map((kid, i) => `<span class="legend-item"><i class="legend-dot" style="background:${kidColor(i)}"></i>${escapeHtml(kid.name)}</span>`).join("");
  const targetType = state.costType === "in" ? "In-state" : "Out-of-state";
  const costLegend = `<span class="legend-item" style="color:#52786a"><i class="legend-line"></i>Public in-state · 4 years</span><span class="legend-item" style="color:#bf5a4a"><i class="legend-line"></i>Public out-of-state · 4 years</span><span class="legend-item"><i class="legend-target"></i>${targetType} funded target</span>`;
  document.getElementById("chartLegend").innerHTML = kidLegend + costLegend;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function render() {
  renderControls();
  const projections = state.kids.map(projectKid);
  renderSummary(projections);
  renderKids(projections);
  renderChart();
  bindDynamicEvents();
  document.getElementById("modelDate").textContent = `Model date · ${displayDate.format(BASE_DATE)}`;
  save();
}

function rebalanceAllocations(changedIndex, newValue) {
  if (state.allocations.length === 1) {
    state.allocations = [100];
    return;
  }
  const bounded = Math.max(0, Math.min(100, newValue));
  const otherIndices = state.allocations.map((_, i) => i).filter(i => i !== changedIndex);
  const oldOtherTotal = otherIndices.reduce((sum, i) => sum + state.allocations[i], 0);
  const remainder = 100 - bounded;
  state.allocations[changedIndex] = bounded;
  otherIndices.forEach(i => {
    state.allocations[i] = oldOtherTotal > 0 ? remainder * state.allocations[i] / oldOtherTotal : remainder / otherIndices.length;
  });
}

function allocateByNeed() {
  const projections = state.kids.map(projectKid);
  const needs = projections.map((p, i) => Math.max(0, p.lumpNeededAfterAnnual - (Number(state.kids[i].existing) || 0)));
  const totalNeed = needs.reduce((a, b) => a + b, 0);
  if (totalNeed === 0) state.allocations = equalAllocations(state.kids.length);
  else state.allocations = needs.map(need => need / totalNeed * 100);
}

function bindDynamicEvents() {
  document.querySelectorAll("[data-allocation]").forEach(input => {
    input.addEventListener("input", event => {
      rebalanceAllocations(Number(event.target.dataset.allocation), Number(event.target.value));
      renderChart();
    });
    input.addEventListener("change", render);
  });
  document.querySelectorAll("[data-annual]").forEach(input => {
    input.addEventListener("input", event => {
      const index = Number(event.target.dataset.annual);
      state.kids[index].annualContribution = clampAnnualContribution(event.target.value);
      const output = document.querySelector(`[data-annual-output="${index}"]`);
      output.innerHTML = `${money.format(state.kids[index].annualContribution)}<small>/ year</small>`;
      renderChart();
    });
    input.addEventListener("change", render);
  });
  document.querySelectorAll("[data-kid][data-field]").forEach(input => input.addEventListener("change", event => {
    const index = Number(event.target.dataset.kid);
    const field = event.target.dataset.field;
    const numeric = ["existing", "enrollmentYear", "fundStart"].includes(field);
    state.kids[index][field] = numeric ? Number(event.target.value) : event.target.value;
    if (field === "birthday") {
      const inferred = inferredEnrollmentYear(event.target.value);
      if (inferred !== null) state.kids[index].enrollmentYear = inferred;
    }
    render();
  }));
  document.querySelectorAll("[data-remove-child]").forEach(button => button.addEventListener("click", event => {
    const index = Number(event.currentTarget.dataset.removeChild);
    if (confirm(`Remove ${state.kids[index].name} and its account inputs from this model?`)) {
      removeChild(index);
      render();
    }
  }));
}

document.getElementById("lumpSum").addEventListener("input", event => { state.lumpSum = Number(event.target.value); render(); });
document.getElementById("lumpSumNumber").addEventListener("input", event => { state.lumpSum = parseLumpSumInput(event.target.value); render(); });
document.getElementById("lumpSumNumber").addEventListener("change", event => { state.lumpSum = parseLumpSumInput(event.target.value); render(); });
document.querySelectorAll("[data-cost-type]").forEach(button => button.addEventListener("click", () => { state.costType = button.dataset.costType; render(); }));
document.getElementById("collegeCost").addEventListener("input", event => { state.costs[state.costType] = Number(event.target.value); render(); });
document.getElementById("inflation").addEventListener("input", event => { state.inflation = Number(event.target.value); render(); });
document.querySelectorAll("[data-scenario]").forEach(button => button.addEventListener("click", () => { state.scenario = button.dataset.scenario; render(); }));
document.getElementById("equalButton").addEventListener("click", () => { state.allocations = equalAllocations(state.kids.length); render(); });
document.getElementById("needButton").addEventListener("click", () => { allocateByNeed(); render(); });
document.getElementById("addChildButton").addEventListener("click", () => {
  if (addChild()) render();
});
document.getElementById("resetButton").addEventListener("click", () => {
  if (confirm("Reset every input to the original model defaults?")) { state = deepClone(defaultState); render(); }
});
document.getElementById("assumptionsButton").addEventListener("click", event => {
  const panel = document.getElementById("returnAssumptions");
  panel.hidden = !panel.hidden;
  event.target.setAttribute("aria-expanded", String(!panel.hidden));
});

[["stockReturn", "stock"], ["bondReturn", "bond"], ["cashReturn", "cash"]].forEach(([id, key]) => {
  document.getElementById(id).addEventListener("change", event => {
    state.returns[state.scenario][key] = Number(event.target.value);
    render();
  });
});
document.getElementById("expenseRatio").addEventListener("change", event => { state.expenseRatio = Number(event.target.value); render(); });
document.getElementById("chartLabelsToggle").addEventListener("click", () => {
  state.showChartLabels = !state.showChartLabels;
  renderChart();
  save();
});

const shareDialog = document.getElementById("shareDialog");
const exportCode = document.getElementById("exportCode");
const importCode = document.getElementById("importCode");
const shareMessage = document.getElementById("shareMessage");

function setShareMessage(message, isError = false) {
  shareMessage.textContent = message;
  shareMessage.classList.toggle("error", isError);
}

document.getElementById("shareButton").addEventListener("click", () => {
  exportCode.value = encodeSnapshot();
  importCode.value = "";
  setShareMessage("");
  shareDialog.showModal();
});

document.getElementById("shareClose").addEventListener("click", () => shareDialog.close());

document.getElementById("copyExport").addEventListener("click", async () => {
  exportCode.value = encodeSnapshot();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(exportCode.value);
    } else {
      exportCode.focus();
      exportCode.select();
      if (!document.execCommand("copy")) throw new Error("Copy command was not available.");
    }
    setShareMessage("Export code copied. Anyone you send it to can import this exact model.");
  } catch {
    exportCode.focus();
    exportCode.select();
    setShareMessage("Automatic copy was blocked. The export code is selected; copy it manually.", true);
  }
});

document.getElementById("importButton").addEventListener("click", () => {
  try {
    const importedState = decodeSnapshot(importCode.value);
    state = importedState;
    render();
    exportCode.value = encodeSnapshot();
    importCode.value = "";
    setShareMessage("Snapshot imported and saved in this browser.");
  } catch (error) {
    setShareMessage(error instanceof Error ? error.message : "The snapshot could not be imported.", true);
  }
});

render();
