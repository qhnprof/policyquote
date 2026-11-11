import type { KnowledgeBase } from '../kb/kb.schema';
import type { ImpactReport } from './impact';

// Renders an ImpactReport as plain text (terminal) or Markdown (CI summaries, proposal notes).

const gbp = (amount: number): string =>
  `${amount < 0 ? '-' : amount > 0 ? '+' : ''}£${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

function kbChangeLines(report: ImpactReport): string[] {
  const d = report.factorDiff;
  return [
    ...d.added.map((id) => `added factor ${id}`),
    ...d.removed.map((id) => `removed factor ${id}`),
    ...d.pointsChanged.map((c) => `${c.id}: points ${c.from} → ${c.to}`),
    ...d.conditionChanged.map((id) => `${id}: condition changed`),
    ...d.otherChanged.map((id) => `${id}: description/flags changed`),
    ...report.settingsChanged.map((key) => `${key} changed`),
  ];
}

export function renderImpactReport(report: ImpactReport, base: KnowledgeBase, candidate: KnowledgeBase, seed: number, markdown: boolean): string {
  const header = `KB impact: v${base.version} → v${candidate.version} on ${report.customers.toLocaleString('en-GB')} synthetic customers (seed ${seed})`;
  const kbChanges = kbChangeLines(report);
  if (base.version === candidate.version && report.factorDiff.added.length + report.factorDiff.removed.length + report.factorDiff.pointsChanged.length + report.factorDiff.conditionChanged.length + report.factorDiff.otherChanged.length > 0) {
    kbChanges.push(`note: rules changed but "version" is still ${candidate.version}; bump it before release`);
  }
  const bands = report.bandTransitions.filter((t) => t.from !== t.to);
  const p = report.premium;
  const summary = [
    `Moved up a band: ${report.movedUp.count} (${report.movedUp.percent}%)`,
    `Moved down a band: ${report.movedDown.count} (${report.movedDown.percent}%)`,
    `Unchanged band: ${report.unchanged.count} (${report.unchanged.percent}%)`,
    `Annual premium: average ${gbp(p.averageChange)} per customer, total ${gbp(p.totalChange)} (${pct(p.totalChangePercent)})`,
  ];
  const moverLines = report.biggestMovers.map((m) => {
    const c = m.customer;
    const claims = `${c.previousClaims} ${c.previousClaims === 1 ? 'claim' : 'claims'}`;
    return `${c.customerName} (${c.age}, ${c.propertyType}, £${c.propertyValue.toLocaleString('en-GB')}, ${c.postcode}, ${claims}): ${m.oldBand} £${m.oldAnnualPremium.toFixed(2)} → ${m.newBand} £${m.newAnnualPremium.toFixed(2)} (${gbp(m.change)})`;
  });

  if (!markdown) {
    return [
      header,
      '',
      'KB changes:',
      ...kbChanges.map((l) => `  - ${l}`),
      '',
      ...summary,
      '',
      'Band moves:',
      ...(bands.length ? bands.map((t) => `  ${t.from} → ${t.to}: ${t.customers}`) : ['  none']),
      '',
      'Biggest movers:',
      ...(moverLines.length ? moverLines.map((l) => `  ${l}`) : ['  none']),
    ].join('\n');
  }
  return [
    `### ${header}`,
    '',
    '**KB changes**',
    '',
    ...kbChanges.map((l) => `- ${l}`),
    '',
    ...summary.map((l) => `- ${l}`),
    '',
    '| From | To | Customers |',
    '| --- | --- | ---: |',
    ...report.bandTransitions.map((t) => `| ${t.from} | ${t.to} | ${t.customers} |`),
    '',
    '**Biggest movers**',
    '',
    ...(moverLines.length ? moverLines.map((l) => `- ${l}`) : ['- none']),
  ].join('\n');
}

