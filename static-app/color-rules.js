// Project rules are data, never executable expressions. First matching rule wins.
const keyPattern = /^[a-z][a-z0-9_-]{0,29}$/;
const normalized = value => String(value ?? '').trim().toLowerCase();
export function readColorRules(rules = [], schemes = []) {
  if (!Array.isArray(rules) || rules.length > 100) throw Error('Use up to 100 project color rules.');
  return rules.map(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || typeof rule.field !== 'string' || !/^[a-z][a-z0-9_]{0,49}$/.test(rule.field) || typeof rule.equals !== 'string' || !rule.equals.trim() || rule.equals.length > 200) throw Error('Color rules need a field and a nonempty equals value.');
    const hasTheme = rule.theme !== undefined, hasColors = rule.colors !== undefined;
    if (hasTheme === hasColors) throw Error('Each color rule needs either a theme or colors.');
    if (hasTheme && (typeof rule.theme !== 'string' || !schemes.some(s => s.name === rule.theme))) throw Error('Unknown color-rule theme: ' + rule.theme);
    if (hasColors && (!rule.colors || typeof rule.colors !== 'object' || Array.isArray(rule.colors) || !Object.keys(rule.colors).length || Object.entries(rule.colors).some(([k,v]) => !keyPattern.test(k) || typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)))) throw Error('Color rules need valid color roles and six-digit hex colors.');
    return {...rule, ...(hasColors ? {colors:{...rule.colors}} : {})};
  });
}
export function validateRuleTemplates(rules, templates) {
  for (const rule of rules || []) {
    if (!templates.some(t => t.fields.some(f => f.key === rule.field))) throw Error('Unknown color-rule field: ' + rule.field);
    for (const role of Object.keys(rule.colors || {})) if (!templates.some(t => Object.hasOwn(t.colors, role))) throw Error('Unknown color-rule color role: ' + role);
  }
}
export function matchingColorRule(rules, values) {
  return (rules || []).find(rule => normalized(values?.[rule.field]) === normalized(rule.equals));
}
export function resolveCardColors(layout, card, baseColors, rules = [], schemes = []) {
  const base = {...layout.colors, ...baseColors};
  if (card.colors) return {...base, ...card.colors};
  const rule = matchingColorRule(rules, card.values);
  if (!rule || !layout.fields.some(f => f.key === rule.field)) return base;
  const colors = rule.colors || schemes.find(s => s.name === rule.theme)?.colors || layout.colors;
  return {...base, ...Object.fromEntries(Object.entries(colors).filter(([key]) => Object.hasOwn(layout.colors, key)))};
}
