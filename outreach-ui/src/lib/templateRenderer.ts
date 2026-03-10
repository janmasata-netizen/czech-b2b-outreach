import type { Lead, Jednatel } from '@/types/database';

/**
 * Client-side template renderer for draft wave preview.
 * Replaces {{placeholder}} tokens with lead/jednatel/custom_fields values.
 */
export function renderTemplate(text: string | null, ctx: Record<string, string>): string {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return ctx[key] !== undefined && ctx[key] !== '' ? ctx[key] : `{{${key}}}`;
  });
}

/** Build a template context from lead + jednatel data + custom_fields */
export function buildTemplateContext(lead: Lead | null, jednatel: Jednatel | null): Record<string, string> {
  // Standard fields from lead/jednatel columns
  const standard: Record<string, string> = {};
  if (lead?.company_name) standard.company_name = lead.company_name;
  if (lead?.ico) standard.ico = lead.ico;
  if (lead?.domain) standard.domain = lead.domain;
  if (lead?.website) {
    if (!standard.domain) {
      try {
        standard.domain = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname;
      } catch { /* ignore */ }
    }
  }
  if (jednatel?.first_name) standard.first_name = jednatel.first_name;
  if (jednatel?.last_name) standard.last_name = jednatel.last_name;
  if (jednatel?.salutation) standard.salutation = jednatel.salutation;
  if (jednatel?.full_name) standard.full_name = jednatel.full_name;

  // Custom fields from lead.custom_fields — override standard fields
  const custom: Record<string, string> = lead?.custom_fields ?? {};

  return { ...standard, ...custom };
}

/** Extract all {{varName}} tokens from text */
export function extractVariables(text: string | null): string[] {
  if (!text) return [];
  const vars: string[] = [];
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

/** Find variables that have no value in context */
export function findMissingVariables(variables: string[], context: Record<string, string>): string[] {
  return variables.filter(v => !context[v]);
}
