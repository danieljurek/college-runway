const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const util = require("node:util");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const modelSource = appSource.slice(0, appSource.indexOf("function renderControls()"));

function createModel() {
  const localStorage = { getItem: () => null, setItem: () => {} };
  const context = {
    Date, JSON, Math, Number, String, Array, Object, RegExp, Error, Uint8Array, Intl,
    TextEncoder: util.TextEncoder,
    TextDecoder: util.TextDecoder,
    btoa,
    atob,
    localStorage,
    document: { getElementById: () => ({ lastChild: { textContent: "" } }) },
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(modelSource, context);
  return {
    run(expression) { return vm.runInContext(expression, context); },
    read(expression) {
      return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
    }
  };
}

function urlSafePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

test("snapshot round-trips the complete state as URL-safe Base64", () => {
  const model = createModel();
  model.run('state.kids[0].name = "Test Child 🚀"; state.lumpSum = 99000; state.inflation = -1.25; state.kids[2].annualContribution = 25000');
  const before = model.read("state");
  const code = model.run("encodeSnapshot()");
  const after = model.read(`decodeSnapshot(${JSON.stringify(code)})`);

  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(after, before);
});

test("snapshot decoder rejects malformed, foreign, and unsupported payloads", () => {
  const model = createModel();
  assert.throws(() => model.run('decodeSnapshot("not-valid!")'), /valid College Runway code/);
  assert.throws(
    () => model.run(`decodeSnapshot(${JSON.stringify(urlSafePayload({ app: "another-app", version: 1, state: {} }))})`),
    /not a supported College Runway export/
  );
  assert.throws(
    () => model.run(`decodeSnapshot(${JSON.stringify(urlSafePayload({ app: "college-runway", version: 2, state: {} }))})`),
    /not a supported College Runway export/
  );
});

test("import normalization clamps values and restores a valid allocation", () => {
  const model = createModel();
  const normalized = model.read(`normalizeState(${JSON.stringify({
    lumpSum: -50,
    costs: { in: 1, out: 999999999 },
    inflation: -99,
    allocations: [2, 2, 4, 2],
    kids: [
      { annualContribution: 90000, existing: -10, fundStart: 2037 },
      { enrollmentYear: 2039 },
      { enrollmentYear: 2042 },
      { enrollmentYear: 2044 }
    ]
  })})`);

  assert.equal(normalized.lumpSum, 0);
  assert.deepEqual(normalized.costs, { in: 10000, out: 100000 });
  assert.equal(normalized.inflation, -5);
  assert.deepEqual(normalized.allocations, [20, 20, 40, 20]);
  assert.equal(normalized.kids[0].annualContribution, 25000);
  assert.equal(normalized.kids[0].existing, 0);
  assert.equal(normalized.kids[0].fundStart, 2036);

  const capped = model.read(`normalizeState(${JSON.stringify({ lumpSum: 999999 })})`);
  assert.equal(capped.lumpSum, 100000);
});

test("model defaults to three children with equal allocations", () => {
  const model = createModel();
  assert.equal(model.run("state.kids.length"), 3);
  assert.equal(model.run("state.allocations.length"), 3);
  assert.ok(Math.abs(model.run("state.allocations.reduce((sum, value) => sum + value, 0)") - 100) < 1e-10);
});

test("children can be added and removed while allocations remain normalized", () => {
  const model = createModel();
  assert.equal(model.run("addChild()"), true);
  assert.equal(model.run("state.kids.length"), 4);
  assert.equal(model.run("state.kids[3].birthday"), "");
  assert.ok(Math.abs(model.run("state.allocations.reduce((sum, value) => sum + value, 0)") - 100) < 1e-10);

  assert.equal(model.run("removeChild(1)"), true);
  assert.equal(model.run("state.kids.length"), 3);
  assert.deepEqual(model.read("state.kids.map(kid => kid.name)"), ["Child 1", "Child 2", "Child 3"]);
  assert.ok(Math.abs(model.run("state.allocations.reduce((sum, value) => sum + value, 0)") - 100) < 1e-10);
});

test("annual contributions start one year from the model date and stop before enrollment", () => {
  const model = createModel();
  const dates = model.read("annualContributionDates(state.kids[0])");
  const baseYear = model.run("BASE_YEAR");
  assert.ok(Math.abs(dates[0] - (baseYear + 1)) < 1e-10);
  assert.ok(dates.at(-1) < model.run("state.kids[0].enrollmentYear + 0.67"));
  assert.equal(model.run("clampAnnualContribution(50000)"), 25000);
});

test("September 1 kindergarten cutoff maps enrollment years and target bands", () => {
  const model = createModel();
  assert.equal(model.run('inferredEnrollmentYear("")'), null);
  assert.equal(model.run('inferredEnrollmentYear("2000-09-01")'), 2018);
  assert.equal(model.run('inferredEnrollmentYear("2000-09-02")'), 2019);
  assert.equal(model.run("recommendedFund(2042)"), 2042);
  assert.equal(model.run("recommendedFund(2039)"), 2038);
});

test("negative college inflation reduces successive projected annual costs", () => {
  const model = createModel();
  model.run("state.inflation = -2");
  const first = model.run('collegeCostAt(2036, "in")');
  const second = model.run('collegeCostAt(2037, "in")');
  assert.ok(second < first);
  assert.ok(Math.abs(second / first - 0.98) < 1e-10);
});

test("required-today amount funds all four school-year bills", () => {
  const model = createModel();
  model.run("state.lumpSum = 0; state.kids[0].existing = 0; state.kids[0].annualContribution = 0");
  const requiredToday = model.run("projectKid(state.kids[0], 0).requiredToday");
  model.run(`state.kids[0].existing = ${requiredToday}`);
  const projection = model.read("projectKid(state.kids[0], 0)");
  assert.ok(Math.abs(projection.coverage - 1) < 1e-10);
  assert.ok(Math.abs(projection.covered - projection.totalCost) < 0.01);
});

test("family pool reports a shortfall only when bills outrun pooled resources", () => {
  const model = createModel();
  model.run("state.lumpSum = 0; state.kids.forEach(kid => { kid.existing = 0; kid.annualContribution = 0; })");
  assert.equal(model.read("simulateFamilyPool().firstShortfall").date, 2036.67);

  model.run("state.lumpSum = 10000000; state.costs = { in: 10000, out: 10000 }; state.inflation = 0");
  assert.equal(model.run("simulateFamilyPool().firstShortfall"), null);
});
