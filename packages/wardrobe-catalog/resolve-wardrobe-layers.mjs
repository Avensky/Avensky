/**
 * W-04: pure layer-relationship planner. This module does not load GLBs, alter saves,
 * create collision meshes, or imply that a needs-fitting relationship is approved.
 * Input "equipped" is already normalized; legacy save migration is W-05.
 */
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const asObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sorted = values => [...values].sort(compare);
const stable = value => JSON.stringify(value, (_key, v) =>
  asObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => compare(a, b))) : v);
const intersect = (a, b) => a.filter(x => b.includes(x)).sort(compare);
const rank = { allowed: 0, "needs-fitting": 1, blocked: 2 };
const worsen = (a, b) => rank[a] >= rank[b] ? a : b;
const knownReasons = {
  UNKNOWN_CLASS: "The garment has no known layer class.",
  INVALID_ENTRY: "Garment selection requires a unique non-empty ID.",
  DUPLICATE_GARMENT: "A saved garment ID occurs more than once.",
  INVALID_MODE: "The selected garment mode is not declared by its class.",
  MISSING_ASSET: "The garment mesh is unavailable.",
  RIG_MISMATCH: "The garment is not compatible with this character rig.",
  UNSUPPORTED_STACK: "Multiple garments in the same class require a specific stack profile.",
  UNKNOWN_RELATION: "No validated region relationship has been defined.",
  MODE_CONFLICT: "More than one mutually incompatible layer rule applies.",
  INCOMPATIBLE_CLASS: "The selected classes or fit modes cannot coexist.",
  PAIR_FIT_UNVERIFIED: "An appropriate pairwise fit report has not been approved.",
  ORDER_CYCLE: "Layer ordering produces a cycle in this region.",
  DEPENDENCY_INACTIVE: "The underlayer has no eligible parent and remains saved.",
};

/** Only unambiguous catalog metadata is mapped. A 'top' slot containing armor remains armor. */
export function classifyWardrobeCatalogItem(item) {
  if (!asObject(item)) return null;
  const pieceToClass = {
    shirt: "top", corset: "corset", skirt: "skirt", underskirt: "petticoat",
    dress: "dress", coat: "coat", pants: "pants", socks: "socks", shoes: "shoe",
    belt: "belt", armor: "armor", harness: "harness", gloves: "gloves",
  };
  if (item.piece === "hat" && typeof item.id === "string" && item.id.startsWith("hood-")) return "hood";
  return pieceToClass[item.piece] ?? null;
}

function applies(rule, byClass) {
  return Object.entries(rule.when ?? {}).every(([classId, settings]) =>
    Object.entries(settings).every(([key, choice]) => byClass[classId]?.modes[key] === choice));
}

function matchingPolicies(entry, other, region, overrides) {
  const override = overrides.get(entry.id);
  if (!override) return [];
  return (override.pairPolicies ?? []).filter(policy =>
    policy.otherGarmentId === other.id && policy.regions.includes(region) &&
    Object.entries(policy.when?.self ?? {}).every(([k, v]) => entry.modes[k] === v) &&
    Object.entries(policy.when?.other ?? {}).every(([k, v]) => other.modes[k] === v)
  ).map(policy => ({
    inner: policy.position === "inside" ? entry.id : policy.position === "outside" ? other.id : null,
    outer: policy.position === "outside" ? entry.id : policy.position === "inside" ? other.id : null,
    outcome: policy.outcome,
    ruleId: "item:" + entry.id + ":" + other.id,
    message: policy.reason,
  }));
}
function evidenceMatches(report, a, b, region, input) {
  if (typeof input.bodyProfileId !== "string" || !input.bodyProfileId ||
      typeof input.tier !== "string" || !input.tier ||
      !asObject(report) || report.status !== "passed" || report.reviewed !== true ||
      typeof report.reportId !== "string" || !report.reportId ||
      report.bodyProfileId !== input.bodyProfileId || report.tier !== input.tier ||
      !Array.isArray(report.garmentIds) || report.garmentIds.length !== 2 ||
      stable(sorted(report.garmentIds)) !== stable(sorted([a.id, b.id])) ||
      !Array.isArray(report.regions) || !report.regions.includes(region) ||
      !a.sourceRevision || !b.sourceRevision ||
      report.sourceRevisions?.[a.id] !== a.sourceRevision ||
      report.sourceRevisions?.[b.id] !== b.sourceRevision) return false;
  return stable(report.modes?.[a.id]) === stable(a.modes) &&
         stable(report.modes?.[b.id]) === stable(b.modes);
}
/** Complete outfit state, including every layer's mode/revision, to prevent stale coverage reuse. */
export function outfitSignature(equipped) {
  return stable(equipped.map(x => ({
    id: x.id, classId: x.classId, sourceRevision: x.sourceRevision ?? null, modes: x.modes ?? {},
  })).sort((a, b) => compare(a.id, b.id))) ?? "";
}
function regionVisibilityEvidenceMatches(record, entry, region, input) {
  return asObject(record) && record.garmentId === entry.id && record.region === region &&
    typeof record.visible === "boolean" && record.reviewed === true &&
    typeof record.reportId === "string" && record.reportId.length > 0 &&
    record.sourceRevision === entry.sourceRevision && entry.sourceRevision &&
    record.bodyProfileId === input.bodyProfileId && record.tier === input.tier &&
    record.outfitSignature === outfitSignature(input.equipped) &&
    record.poseId === input.poseId && typeof input.poseId === "string" && input.poseId &&
    stable(record.modes) === stable(entry.modes);
}

function regionOrder(nodes, edges) {
  const inDegree = new Map(nodes.map(id => [id, 0]));
  const outgoing = new Map(nodes.map(id => [id, new Set()]));
  for (const edge of edges) {
    if (!outgoing.get(edge.inner)?.has(edge.outer)) {
      outgoing.get(edge.inner)?.add(edge.outer);
      inDegree.set(edge.outer, (inDegree.get(edge.outer) ?? 0) + 1);
    }
  }
  const available = sorted(nodes.filter(id => inDegree.get(id) === 0));
  const order = [];
  while (available.length) {
    const current = available.shift();
    order.push(current);
    for (const next of sorted(outgoing.get(current) ?? [])) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) {
        available.push(next);
        available.sort(compare);
      }
    }
  }
  return { order, hasCycle: order.length !== nodes.length };
}

/**
 * @param {object} input
 * @param {Array<{id:string,classId:string,origin?:'explicit'|'derived',sourceRevision?:string,
 *   modes?:Record<string,string>,available?:boolean,rigCompatible?:boolean}>} input.equipped
 * @param {object} rules Validated layer-rules.json object, supplied by the caller.
 * @returns {object} Immutable-input, deterministic region and fit readiness report.
 *
 * An approval is accepted only when full pair, region, source revision, effective modes,
 * profile and tier match. The caller must independently authenticate the review evidence;
 * no boolean supplied here certifies actual physical fitting or redistribution rights.
 */
export function resolveWardrobeLayers(input, rules) {
  if (!asObject(input) || !Array.isArray(input.equipped)) throw new TypeError("Expected an equipped garment array");
  if (!asObject(rules) || rules.schemaVersion !== 1 ||
      !asObject(rules.classes) || !Array.isArray(rules.relationships) ||
      !Array.isArray(rules.itemOverrides) || !Array.isArray(rules.dependencies))
    throw new TypeError("Supply validated wardrobe layer rules v1");

  const overrides = new Map(rules.itemOverrides.map(x => [x.garmentId, x]));
  if (input.fitEvidence !== undefined && !Array.isArray(input.fitEvidence))
    throw new TypeError("fitEvidence must be an array");
  if (input.visibilityEvidence !== undefined && !Array.isArray(input.visibilityEvidence))
    throw new TypeError("visibilityEvidence must be an array");
  const members = input.equipped.map(raw => {
    const id = typeof raw?.id === "string" ? raw.id : "";
    const classId = typeof raw?.classId === "string" ? raw.classId : "";
    const cls = rules.classes[classId], override = overrides.get(id);
    const defaultModes = Object.fromEntries(Object.entries(cls?.modes ?? {})
      .map(([key, config]) => [key, config.default]));
    return {
      id, classId, slot: raw?.slot ?? null, origin: raw?.origin ?? "explicit",
      sourceRevision: raw?.sourceRevision ?? null,
      available: raw?.available, rigCompatible: raw?.rigCompatible,
      modes: { ...defaultModes, ...(override?.classId === classId ? override.modeDefaults : {}), ...(raw?.modes ?? {}) },
      regions: override?.classId === classId && override.regions ? [...override.regions] : [...(cls?.regions ?? [])],
    };
  }).sort((a, b) => compare(a.id, b.id) || compare(a.classId, b.classId) || compare(stable(a.modes), stable(b.modes)));
  const issues = [];
  const issue = (code, garmentIds, region = null, ruleIds = [], message = knownReasons[code]) => {
    issues.push({ code, garmentIds: sorted(garmentIds), region, ruleIds: sorted(ruleIds), message });
  };
  const invalid = new Set();
  const seen = new Set();
  for (const member of members) {
    if (!member.id) { issue("INVALID_ENTRY", [member.id]); invalid.add(member.id); }
    if (seen.has(member.id)) { issue("DUPLICATE_GARMENT", [member.id]); invalid.add(member.id); }
    seen.add(member.id);
    const cls = rules.classes[member.classId];
    if (!cls || (overrides.has(member.id) && overrides.get(member.id).classId !== member.classId)) {
      issue("UNKNOWN_CLASS", [member.id]); invalid.add(member.id); continue;
    }
    if (!["explicit", "derived"].includes(member.origin)) {
      issue("INVALID_ENTRY", [member.id], null, [], "Unknown garment origin"); invalid.add(member.id);
    }
    if (member.available === false) { issue("MISSING_ASSET", [member.id]); invalid.add(member.id); }
    if (member.rigCompatible === false) { issue("RIG_MISMATCH", [member.id]); invalid.add(member.id); }
    for (const [group, value] of Object.entries(member.modes)) {
      if (!cls.modes[group]?.choices.includes(value)) {
        issue("INVALID_MODE", [member.id], null, [], "Invalid " + group + "=" + String(value));
        invalid.add(member.id);
      }
    }
  }

  const related = [];
  const regions = [];
  const regionNames = sorted(new Set(members.flatMap(m => m.regions)));
  for (const region of regionNames) {
    const present = members.filter(m => m.regions.includes(region));
    const edges = [];
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
      const a = present[i], b = present[j], ids = sorted([a.id, b.id]);
      if (invalid.has(a.id) || invalid.has(b.id)) continue;
      if (a.classId === b.classId) {
        related.push({ garmentIds: ids, region, inner: null, outer: null, status: "blocked",
          code: "UNSUPPORTED_STACK", ruleIds: [] });
        issue("UNSUPPORTED_STACK", ids, region); continue;
      }
      const policies = [
        ...matchingPolicies(a, b, region, overrides),
        ...matchingPolicies(b, a, region, overrides),
      ];
      const byClass = { [a.classId]: a, [b.classId]: b };
      const choices = policies.length ? policies : rules.relationships.filter(rule =>
        (rule.inner === a.classId && rule.outer === b.classId ||
         rule.inner === b.classId && rule.outer === a.classId) &&
        rule.regions.includes(region) && applies(rule, byClass)
      ).map(rule => ({
        inner: a.classId === rule.inner ? a.id : b.id,
        outer: a.classId === rule.outer ? a.id : b.id,
        outcome: rule.outcome, ruleId: rule.id, message: rule.reason,
      }));
      if (!choices.length) {
        related.push({ garmentIds: ids, region, inner: null, outer: null, status: "needs-fitting",
          code: "UNKNOWN_RELATION", ruleIds: [] });
        issue("UNKNOWN_RELATION", ids, region); continue;
      }
      const first = choices[0], ruleIds = sorted(choices.map(x => x.ruleId));
      if (choices.some(x => x.inner !== first.inner || x.outer !== first.outer || x.outcome !== first.outcome)) {
        related.push({ garmentIds: ids, region, inner: null, outer: null, status: "blocked",
          code: "MODE_CONFLICT", ruleIds });
        issue("MODE_CONFLICT", ids, region, ruleIds); continue;
      }
      const approved = first.outcome !== "blocked" && (input.fitEvidence ?? []).some(report =>
        evidenceMatches(report, a, b, region, input));
      const status = first.outcome === "blocked" ? "blocked" : approved ? "allowed" : "needs-fitting";
      const code = status === "blocked" ? "INCOMPATIBLE_CLASS" :
        status === "needs-fitting" ? "PAIR_FIT_UNVERIFIED" : null;
      related.push({ garmentIds: ids, region, inner: first.inner, outer: first.outer, status, code, ruleIds });
      if (code) issue(code, ids, region, ruleIds, first.message);
      if (first.inner !== null && first.outer !== null && status !== "blocked")
        edges.push({ inner: first.inner, outer: first.outer, status, ruleIds });
    }
    const { order, hasCycle } = regionOrder(present.map(m => m.id), edges);
    if (hasCycle) issue("ORDER_CYCLE", present.map(m => m.id), region,
      edges.flatMap(e => e.ruleIds), "The selected layer modes form a cycle in " + region);
    regions.push({
      region, order: hasCycle ? [] : order, provisional: edges.some(x => x.status !== "allowed"),
      hasCycle, edges: edges.sort((a, b) => compare(a.inner, b.inner) || compare(a.outer, b.outer)),
    });
  }

  // Explicit and derived dependent items are never mutated; only a suggested
  // removal is issued for an orphaned derived selection. All eligible parents count.
  const dependencies = [];
  for (const member of members) {
    const applicable = rules.dependencies.filter(x => x.child === member.classId && x.activation === member.origin);
    if (!applicable.length) continue;
    const parents = members.filter(x => x.id !== member.id && !invalid.has(x.id) &&
      applicable.some(dep => dep.parent === x.classId)).map(x => x.id).sort(compare);
    if (!parents.length) {
      dependencies.push({ garmentId: member.id, active: false, parents: [],
        action: member.origin === "derived" ? "remove-derived-only" : "deactivate-preserve-selection" });
      issue("DEPENDENCY_INACTIVE", [member.id]);
    } else dependencies.push({ garmentId: member.id, active: true, parents, action: "none" });
  }

  const cyclicIds = new Set(regions.filter(r => r.hasCycle).flatMap(r =>
    members.filter(m => m.regions.includes(r.region)).map(m => m.id)));
  const membership = members.map(member => {
    const memberPairs = related.filter(p => p.garmentIds.includes(member.id));
    const dep = dependencies.find(x => x.garmentId === member.id);
    let status = invalid.has(member.id) || cyclicIds.has(member.id) ? "blocked" : "allowed";
    for (const pair of memberPairs) status = worsen(status, pair.status);
    if (dep?.active === false && status !== "blocked") status = "needs-fitting";
    return {
      id: member.id, classId: member.classId, slot: member.slot, origin: member.origin,
      sourceRevision: member.sourceRevision, modes: { ...member.modes },
      regions: [...member.regions], status, active: status === "allowed",
      visible: "unverified",
    };
  });

  const visibility = [];
  const normalizedSignature = outfitSignature(members.map(m => ({
    id: m.id, classId: m.classId, sourceRevision: m.sourceRevision, modes: m.modes,
  })));
  const visibilityInput = { ...input, equipped: members.map(m => ({
    id: m.id, classId: m.classId, sourceRevision: m.sourceRevision, modes: m.modes,
  })) };
  for (const member of members) for (const region of member.regions) {
    const matches = (input.visibilityEvidence ?? []).filter(item =>
      regionVisibilityEvidenceMatches(item, member, region, visibilityInput));
    const unique = [...new Set(matches.map(x => x.visible))];
    const state = unique.length === 1 ? (unique[0] ? "visible" : "hidden") : "unverified";
    visibility.push({ garmentId: member.id, region, state });
    if (unique.length > 1) issue("MODE_CONFLICT", [member.id], region, [],
      "Conflicting visibility reports for this garment and pose/mode");
  }
  const occlusionIntents = related.filter(rel => rel.outer && rel.status !== "blocked").flatMap(rel => {
    const coat = members.find(m => m.id === rel.outer && m.classId === "coat");
    if (!coat) return [];
    const frontOpening = rel.region === "torsoFront" || rel.region === "waistFront";
    return [{
      garmentId: rel.inner, outerGarmentId: coat.id, region: rel.region,
      intent: coat.modes.closure === "open" && frontOpening ? "expose-opening" : "may-cover",
    }];
  }).sort((a, b) => compare(a.garmentId, b.garmentId) ||
    compare(a.region, b.region) || compare(a.outerGarmentId, b.outerGarmentId));

  issues.sort((a, b) => compare(a.code, b.code) || compare(a.garmentIds.join("|"), b.garmentIds.join("|")) ||
    compare(a.region ?? "", b.region ?? "") || compare(a.ruleIds.join("|"), b.ruleIds.join("|")));
  related.sort((a, b) => compare(a.garmentIds.join("|"), b.garmentIds.join("|")) || compare(a.region, b.region));

  return {
    schemaVersion: 1,
    equipped: members.map(m => ({ id: m.id, classId: m.classId, slot: m.slot, origin: m.origin, modes: { ...m.modes } })),
    membership,
    activeIds: membership.filter(m => m.active).map(m => m.id),
    pairs: related, regions, dependencies, visibility, occlusionIntents,
    status: issues.some(i => ["INCOMPATIBLE_CLASS","MODE_CONFLICT","ORDER_CYCLE","UNKNOWN_CLASS",
      "DUPLICATE_GARMENT","INVALID_ENTRY","INVALID_MODE","MISSING_ASSET","RIG_MISMATCH","UNSUPPORTED_STACK"].includes(i.code))
      ? "blocked" : issues.length ? "needs-fitting" : "allowed",
    issues,
  };
}
