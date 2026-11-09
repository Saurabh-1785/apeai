/**
 * ApeAI — Jira Payload Mapper
 *
 * Translates the universal task format into a Jira REST API v3 issue (ADF body).
 *
 * The universal description is a small markdown subset, converted to real
 * Jira formatting so nothing shows up as literal "###" or "- [ ]":
 *   ### Heading            → heading (level 3)
 *   - item / - [ ] item    → bullet list (consecutive lines grouped)
 *   **Label:** text        → paragraph with a bold label
 *   anything else          → paragraph
 */

type Task = Record<string, unknown>;
type AdfNode = Record<string, unknown>;

export interface JiraPayload {
  fields: {
    project: { key: string };
    summary: string;
    description: { type: 'doc'; version: 1; content: AdfNode[] };
    issuetype: { name: string };
    priority?: { name: string };
    labels: string[];
  };
}

function inline(text: string): AdfNode[] {
  // "**Label:** rest" → bold label + plain rest. Other text stays plain.
  const nodes: AdfNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
    nodes.push({ type: 'text', text: m[1], marks: [{ type: 'strong' }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes.filter((n) => (n['text'] as string).length > 0);
}

export function toAdf(markdown: string): AdfNode[] {
  const out: AdfNode[] = [];
  let list: AdfNode[] | null = null;

  const flush = () => {
    if (list?.length) out.push({ type: 'bulletList', content: list });
    list = null;
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (bullet) {
      list ??= [];
      list.push({ type: 'listItem', content: [{ type: 'paragraph', content: inline(bullet[1]) }] });
      continue;
    }
    flush();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push({ type: 'heading', attrs: { level: 3 }, content: inline(heading[1]) });
    } else {
      out.push({ type: 'paragraph', content: inline(line) });
    }
  }
  flush();

  return out.length ? out : [{ type: 'paragraph', content: [] }];
}

export function mapToJira(task: Task, projectKey: string, issueType = 'Task'): JiraPayload {
  const priorityRaw = ((task['priority'] as string) ?? 'Medium').toLowerCase();
  let priorityName = 'Medium';
  if (priorityRaw.includes('high') || priorityRaw.includes('must')) priorityName = 'High';
  else if (priorityRaw.includes('low') || priorityRaw.includes('could')) priorityName = 'Low';

  // Jira labels can't contain spaces.
  const labels = ((task['labels'] as string[]) ?? []).map((l) => l.replace(/\s+/g, '-'));

  // Jira caps summaries at 255 characters.
  const summary = String(task['title'] ?? 'ApeAI task').replace(/\s+/g, ' ').trim().slice(0, 255);

  return {
    fields: {
      project: { key: projectKey },
      summary,
      description: { type: 'doc', version: 1, content: toAdf((task['description'] as string) ?? '') },
      issuetype: { name: issueType },
      priority: { name: priorityName },
      labels,
    },
  };
}
