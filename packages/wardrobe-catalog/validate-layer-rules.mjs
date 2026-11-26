import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("./layer-rules.json", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("./layer-rules.schema.json", import.meta.url), "utf8"));
const regionNames = new Set(schema.$defs.region.enum);
const idPattern = /^[a-z][a-z0-9-]*$/;
const outcomes = new Set(["blocked", "needs-fitting"]);
const record = x => x !== null && typeof x === "object" && !Array.isArray(x);

function compatible(a = {}, b = {}) {
  return Object.entries(a).every(([type, modes]) =>
    Object.entries(modes).every(([key, value]) => b[type]?.[key] === undefined || b[type][key] === value));
}
function merge(a, b = {}) {
  if (!compatible(a, b) || !compatible(b, a)) return null;
  const both = Object.fromEntries(Object.entries(a).map(([type, modes]) => [type, { ...modes }]));
  for (const [type, modes] of Object.entries(b)) both[type] = { ...(both[type] ?? {}), ...modes };
  return both;
}

/** Pure structural + semantic validation; does not change a saved look or GLB. */
export function validateLayerRules(data) {
  const errors = [];
  const fail = (code, path, message) => errors.push({ code, path, message });
  const obj = (v, path) => { if (record(v)) return true; fail("TYPE", path, "Expected object"); return false; };
  const keys = (v, path, required, allowed) => {
    if (!obj(v, path)) return false;
    for (const k of required) if (!(k in v)) fail("REQUIRED", path + "." + k, "Missing required property");
    for (const k of Object.keys(v)) if (!allowed.includes(k)) fail("UNKNOWN_FIELD", path + "." + k, "Unexpected property");
    return true;
  };
  const string = (v, path, { id = false, min = 1 } = {}) => {
    if (typeof v === "string" && v.trim().length >= min && (!id || idPattern.test(v))) return true;
    fail("TEXT", path, "Invalid string/identifier"); return false;
  };
  const arr = (v, path, min = 0, distinct = false) => {
    if (!Array.isArray(v) || v.length < min) { fail("ARRAY", path, "Expected array"); return false; }
    if (distinct && new Set(v).size !== v.length) fail("DUPLICATE", path, "Repeated entries");
    return true;
  };
  const regions = (v, path) => {
    if (arr(v, path, 1, true)) v.forEach((r, i) => {
      if (!regionNames.has(r)) fail("UNKNOWN_REGION", path + "[" + i + "]", "Unknown region: " + String(r));
    });
  };
  const features = (v, path) => {
    if (arr(v, path, 0, true)) v.forEach((f, i) => string(f, path + "[" + i + "]", { id: true }));
  };
  if (!keys(data, "$", ["schemaVersion", "classes", "relationships", "itemOverrides"],
    ["schemaVersion", "classes", "relationships", "itemOverrides"])) return { valid: false, errors };
  if (data.schemaVersion !== 1) fail("SCHEMA_VERSION", "$.schemaVersion", "Unsupported version");
  const classes = obj(data.classes, "$.classes") ? data.classes : {};
  if (!Object.keys(classes).length) fail("REQUIRED", "$.classes", "No garment classes");

  for (const [name, cls] of Object.entries(classes)) {
    const at = "$.classes." + name;
    string(name, at, { id: true });
    if (!keys(cls, at, ["regions", "protectedFeatures", "modes"], ["regions", "protectedFeatures", "modes"])) continue;
    regions(cls.regions, at + ".regions");
    features(cls.protectedFeatures, at + ".protectedFeatures");
    if (obj(cls.modes, at + ".modes")) for (const [group, values] of Object.entries(cls.modes)) {
      const m = at + ".modes." + group;
      string(group, m, { id: true });
      if (!keys(values, m, ["choices", "default"], ["choices", "default"])) continue;
      if (arr(values.choices, m + ".choices", 2, true)) {
        values.choices.forEach((v, i) => string(v, m + ".choices[" + i + "]", { id: true }));
        if (!values.choices.includes(values.default)) fail("MODE_DEFAULT", m + ".default", "Default must be a declared choice");
      }
    }
  }
  const checkModes = (condition, at, participants) => {
    if (!obj(condition, at)) return;
    if (!Object.keys(condition).length) fail("EMPTY_CONDITION", at, "Empty conditional mode");
    for (const [cls, groups] of Object.entries(condition)) {
      if (!participants.includes(cls)) fail("MODE_SCOPE", at + "." + cls, "Mode class must be a relation participant");
      if (!classes[cls]) { fail("UNKNOWN_CLASS", at + "." + cls, "Unknown mode class"); continue; }
      if (!obj(groups, at + "." + cls)) continue;
      if (!Object.keys(groups).length) fail("EMPTY_CONDITION", at + "." + cls, "No mode selected");
      for (const [mode, value] of Object.entries(groups)) {
        const choices = classes[cls]?.modes?.[mode]?.choices;
        if (!choices) fail("UNKNOWN_MODE", at + "." + cls + "." + mode, "Unknown mode group");
        else if (!choices.includes(value)) fail("MODE_CHOICE", at + "." + cls + "." + mode, "Unknown mode value");
      }
    }
  };

  const relations = arr(data.relationships, "$.relationships") ? data.relationships : [];
  const ids = new Set();
  for (const [i, r] of relations.entries()) {
    const at = "$.relationships[" + i + "]";
    if (!keys(r, at, ["id", "inner", "outer", "regions", "outcome", "reason"],
      ["id", "inner", "outer", "regions", "outcome", "reason", "when"])) continue;
    if (string(r.id, at + ".id", { id: true })) {
      if (ids.has(r.id)) fail("DUPLICATE_ID", at + ".id", "Repeated relationship ID");
      ids.add(r.id);
    }
    for (const p of ["inner", "outer"]) {
      if (string(r[p], at + "." + p) && !classes[r[p]]) fail("UNKNOWN_CLASS", at + "." + p, "Unknown garment class");
    }
    if (r.inner === r.outer) fail("SELF_RELATION", at, "Cannot relate a class to itself");
    regions(r.regions, at + ".regions");
    if (!outcomes.has(r.outcome)) fail("OUTCOME", at + ".outcome", "Only blocked or needs-fitting are allowed before review");
    string(r.reason, at + ".reason", { min: 15 });
    if (r.when !== undefined) checkModes(r.when, at + ".when", [r.inner, r.outer]);
    if (Array.isArray(r.regions)) for (const region of r.regions) for (const p of ["inner", "outer"]) {
      if (classes[r[p]] && !classes[r[p]].regions?.includes(region))
        fail("REGION_NOT_COVERED", at + ".regions", r[p] + " does not cover " + region);
    }
  }

  const overrides = arr(data.itemOverrides, "$.itemOverrides") ? data.itemOverrides : [];
  const seenItems = new Set();
  for (const [i, item] of overrides.entries()) {
    const at = "$.itemOverrides[" + i + "]";
    if (!keys(item, at, ["garmentId", "classId", "reason"],
      ["garmentId", "classId", "reason", "regions", "modeDefaults", "protectedFeatures", "pairPolicies"])) continue;
    if (string(item.garmentId, at + ".garmentId")) {
      if (seenItems.has(item.garmentId)) fail("DUPLICATE_ID", at + ".garmentId", "Repeated garment override");
      seenItems.add(item.garmentId);
    }
    if (!classes[item.classId]) fail("UNKNOWN_CLASS", at + ".classId", "Unknown override class");
    string(item.reason, at + ".reason", { min: 15 });
    if (item.regions !== undefined) {
      regions(item.regions, at + ".regions");
      if (Array.isArray(item.regions)) for (const region of item.regions) {
        if (classes[item.classId] && !classes[item.classId].regions?.includes(region))
          fail("REGION_NOT_COVERED", at + ".regions", "Region not part of class");
      }
    }
    if (item.protectedFeatures !== undefined) features(item.protectedFeatures, at + ".protectedFeatures");
    if (item.modeDefaults !== undefined && obj(item.modeDefaults, at + ".modeDefaults")) {
      for (const [group, value] of Object.entries(item.modeDefaults)) {
        const choices = classes[item.classId]?.modes?.[group]?.choices;
        if (!choices) fail("UNKNOWN_MODE", at + ".modeDefaults." + group, "Invalid override mode");
        else if (!choices.includes(value)) fail("MODE_CHOICE", at + ".modeDefaults." + group, "Invalid override choice");
      }
    }
    if (item.pairPolicies !== undefined && arr(item.pairPolicies, at + ".pairPolicies")) {
      for (const [j, p] of item.pairPolicies.entries()) {
        const pp = at + ".pairPolicies[" + j + "]";
        if (!keys(p, pp, ["otherGarmentId", "regions", "position", "outcome", "reason"],
          ["otherGarmentId", "regions", "position", "outcome", "reason", "when"])) continue;
        string(p.otherGarmentId, pp + ".otherGarmentId");
        if (p.otherGarmentId === item.garmentId) fail("SELF_RELATION", pp, "Cannot match self");
        regions(p.regions, pp + ".regions");
        if (!outcomes.has(p.outcome)) fail("OUTCOME", pp + ".outcome", "Item pairing needs review");
        if (!["inside", "outside", "none"].includes(p.position) ||
          (p.outcome === "blocked") !== (p.position === "none"))
          fail("POSITION", pp + ".position", "Blocked uses none; fit candidate uses inside/outside");
        string(p.reason, pp + ".reason", { min: 15 });
        if (p.when !== undefined && keys(p.when, pp + ".when", [], ["self", "other"])) {
          if (p.when.self !== undefined) checkModes({ [item.classId]: p.when.self }, pp + ".when.self", [item.classId]);
          if (p.when.other !== undefined && obj(p.when.other, pp + ".when.other")) {
            for (const [group, value] of Object.entries(p.when.other)) {
              if (!idPattern.test(group) || typeof value !== "string" || !idPattern.test(value))
                fail("MODE_CHOICE", pp + ".when.other." + group, "Invalid other-item mode");
            }
          }
        }
      }
    }
  }

  // A relation-level "needs-fitting" edge is provisional, never proof of a passed GLB.
  if (!errors.length) {
    for (let i = 0; i < relations.length; i++) for (let j = i + 1; j < relations.length; j++) {
      const a = relations[i], b = relations[j];
      const pair = a.inner === b.inner && a.outer === b.outer ||
                   a.inner === b.outer && a.outer === b.inner;
      if (!pair || !a.regions.some(region => b.regions.includes(region))) continue;
      if (!compatible(a.when, b.when) || !compatible(b.when, a.when)) continue;
      if (a.outcome !== b.outcome || a.inner !== b.inner || a.outer !== b.outer)
        fail("AMBIGUOUS_PAIR", "$.relationships[" + j + "]", a.id + " and " + b.id + " conflict in an attainable mode");
      else if (JSON.stringify(a.when ?? {}) === JSON.stringify(b.when ?? {}))
        fail("DUPLICATE_PAIR", "$.relationships[" + j + "]", a.id + " duplicates " + b.id);
    }
    const reported = new Set();
    for (const region of regionNames) {
      const adj = new Map();
      for (const r of relations) if (r.outcome === "needs-fitting" && r.regions.includes(region)) {
        if (!adj.has(r.inner)) adj.set(r.inner, []);
        adj.get(r.inner).push(r);
      }
      for (const list of adj.values()) list.sort((a, b) => a.id.localeCompare(b.id));
      function traverse(start, node, path, selectors, edges) {
        for (const r of adj.get(node) ?? []) {
          const merged = merge(selectors, r.when);
          if (!merged) continue;
          if (r.outer === start) {
            const signature = region + ":" + [...edges, r.id].sort().join(",");
            if (!reported.has(signature)) {
              reported.add(signature);
              fail("ORDER_CYCLE", "$.relationships", "Layer cycle in " + region + " via " + [...edges, r.id].join(" -> "));
            }
          } else if (!path.includes(r.outer)) traverse(start, r.outer, [...path, r.outer], merged, [...edges, r.id]);
        }
      }
      for (const start of [...adj.keys()].sort()) traverse(start, start, [start], {}, []);
    }
  }
  return { valid: !errors.length, errors };
}

export function assertLayerRules(data) {
  const result = validateLayerRules(data);
  assert.deepEqual(result.errors, [], "Invalid wardrobe layer rules");
  return data;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const data = JSON.parse(readFileSync(manifestUrl, "utf8"));
    const result = validateLayerRules(data);
    if (!result.valid) {
      for (const issue of result.errors) console.error(issue.code + " " + issue.path + ": " + issue.message);
      process.exitCode = 1;
    } else {
      console.log("Wardrobe manifest v1: " + Object.keys(data.classes).length +
        " classes; " + data.relationships.length + " relationships; " + data.itemOverrides.length + " overrides (unapproved).");
    }
  } catch (error) { console.error(error); process.exitCode = 1; }
}
