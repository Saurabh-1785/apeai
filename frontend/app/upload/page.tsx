'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/ui/ToastProvider';
import { PageHeader } from '@/components/app/primitives';
import { ArrowRight, Loader2, Code, List, FileSpreadsheet, Check } from 'lucide-react';

export default function SignalUploadPage() {
  const { toast } = useToast();

  // Ingestion States
  const [manualText, setManualText] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [ingestingManual, setIngestingManual] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [ingestingCsv, setIngestingCsv] = useState(false);

  // Results State
  const [lastIngestedResult, setLastIngestedResult] = useState<any | null>(null);
  const [batchResults, setBatchResults] = useState<any[]>([]);
  const [activeViewMode, setActiveViewMode] = useState<'pretty' | 'json'>('pretty');

  // Submit Manual Ingestion
  const handleManualIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;

    setIngestingManual(true);
    setLastIngestedResult(null);
    setBatchResults([]);

    try {
      const res = await api.ingestManualFeedback(manualText, manualAuthor || 'anonymous');
      toast('Feedback saved to your inbox', 'success');

      const normalizedRecord = {
        id: res.id,
        source: res.source,
        author: res.author,
        content: res.content,
        timestamp: res.timestamp,
        metadata: {
          submission_type: 'text_paste'
        }
      };

      setLastIngestedResult(normalizedRecord);
      setManualText('');
    } catch (err: any) {
      toast(err.message || 'Failed to ingest manual signal', 'error');
    } finally {
      setIngestingManual(false);
    }
  };

  // Submit CSV Ingestion
  const handleCsvIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;

    setIngestingCsv(true);
    setLastIngestedResult(null);
    setBatchResults([]);

    try {
      const res = await api.ingestCSVFeedback(csvFile);
      toast(res.message || `CSV imported: ${res.saved || 0} rows saved`, 'success');

      // Show the real rows that were just stored (most recent first).
      let stored: any[] = [];
      if ((res.saved || 0) > 0) {
        try {
          const recent = await api.getRecentFeedbacks(Math.min(res.saved, 5));
          stored = (recent.feedbacks || []).filter((f: any) => f.source === 'csv');
        } catch {
          stored = [];
        }
      }
      if (res.errors && res.errors.length > 0) {
        const first = res.errors[0];
        toast(`${res.errors.length} row(s) skipped. Row ${first.row}: ${first.error}`, 'error');
      }
      setBatchResults(stored);
      setLastIngestedResult(null);
      setCsvFile(null);
    } catch (err: any) {
      toast(err.message || 'Failed to parse and upload CSV', 'error');
    } finally {
      setIngestingCsv(false);
    }
  };

  const hasResults = !!lastIngestedResult || batchResults.length > 0;

  return (
    <ProtectedRoute>
      <div className="space-y-12 pb-8">
        <PageHeader
          eyebrow="workspace · add feedback"
          title="Add feedback"
          description="Paste a single comment or import a spreadsheet. Everything is saved in the same shape: source, author, content and time."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Paste */}
          <section aria-labelledby="paste-title" className="card flex flex-col p-6 md:p-8">
            <h2 id="paste-title" className="section-title">
              Paste feedback
            </h2>
            <p className="mt-1.5 text-[14px] text-ink-2">One comment, quote or message at a time.</p>

            <form onSubmit={handleManualIngest} className="mt-7 flex flex-1 flex-col gap-5">
              <div>
                <label htmlFor="author" className="field-label">
                  Author
                </label>
                <input
                  id="author"
                  type="text"
                  placeholder="anonymous"
                  value={manualAuthor}
                  onChange={(e) => setManualAuthor(e.target.value)}
                  aria-describedby="author-hint"
                  className="field"
                />
                <p id="author-hint" className="field-hint">
                  Optional. A name, email or handle.
                </p>
              </div>

              <div className="flex flex-1 flex-col">
                <label htmlFor="content" className="field-label">
                  Feedback
                </label>
                <textarea
                  id="content"
                  placeholder="“We export the dashboard to Excel every Monday. A CSV button would save us an hour.”"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  rows={6}
                  required
                  className="field min-h-[160px] flex-1"
                />
              </div>

              <button type="submit" disabled={ingestingManual} className="btn btn-primary btn-lg w-full">
                {ingestingManual && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {ingestingManual ? 'Saving…' : 'Add to inbox'}
              </button>
            </form>
          </section>

          {/* CSV */}
          <section aria-labelledby="csv-title" className="card flex flex-col p-6 md:p-8">
            <h2 id="csv-title" className="section-title">
              Import a CSV
            </h2>
            <p className="mt-1.5 text-[14px] text-ink-2">Bring in a whole batch of rows at once.</p>

            <form onSubmit={handleCsvIngest} className="mt-7 flex flex-1 flex-col gap-5">
              <div className="flex flex-1 flex-col">
                <span className="field-label" id="csv-label">
                  Spreadsheet
                </span>
                <div className="group relative flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-paper/60 px-6 py-10 text-center transition-colors duration-200 focus-within:border-ink hover:border-ink/50 hover:bg-stone/40">
                  <input
                    type="file"
                    accept=".csv"
                    aria-labelledby="csv-label"
                    aria-describedby="csv-hint"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink-2">
                    {csvFile ? <Check className="h-5 w-5 text-success" aria-hidden /> : <FileSpreadsheet className="h-5 w-5" aria-hidden />}
                  </span>
                  {csvFile ? (
                    <div>
                      <p className="max-w-[260px] truncate text-[14.5px] font-semibold">{csvFile.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">{(csvFile.size / 1024).toFixed(1)} KB · click to choose another</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[14.5px] font-semibold">Choose a CSV file</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">or drop it here</p>
                    </div>
                  )}
                </div>
                <p id="csv-hint" className="field-hint">
                  Needs a <code className="font-mono text-[12px] text-ink-2">content</code> column. Optional: author, source, date.
                  Up to 5 MB.
                </p>
              </div>

              <button type="submit" disabled={ingestingCsv || !csvFile} className="btn btn-primary btn-lg w-full">
                {ingestingCsv && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {ingestingCsv ? 'Importing…' : 'Import CSV'}
              </button>
            </form>
          </section>
        </div>

        {hasResults && (
          <section aria-labelledby="saved-title" className="card app-enter overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-line p-6 sm:flex-row sm:items-center sm:justify-between md:px-8">
              <div>
                <h2 id="saved-title" className="section-title">
                  Saved
                </h2>
                <p className="mt-1 text-[14px] text-ink-2">Exactly what was stored, row by row.</p>
              </div>
              <div className="seg self-start sm:self-auto" role="group" aria-label="View as">
                <button type="button" aria-pressed={activeViewMode === 'pretty'} onClick={() => setActiveViewMode('pretty')} className="seg-btn">
                  <List className="h-3.5 w-3.5" aria-hidden /> Readable
                </button>
                <button type="button" aria-pressed={activeViewMode === 'json'} onClick={() => setActiveViewMode('json')} className="seg-btn">
                  <Code className="h-3.5 w-3.5" aria-hidden /> JSON
                </button>
              </div>
            </div>

            <div className="p-6 md:px-8">
              {lastIngestedResult &&
                (activeViewMode === 'pretty' ? (
                  <div className="space-y-5">
                    <blockquote className="font-display text-[26px] leading-snug">“{lastIngestedResult.content}”</blockquote>
                    <dl className="grid gap-x-8 gap-y-3 border-t border-line pt-5 text-[14px] sm:grid-cols-2">
                      {[
                        ['Source', lastIngestedResult.source],
                        ['Author', lastIngestedResult.author],
                        ['Saved', new Date(lastIngestedResult.timestamp).toLocaleString()],
                        ['Submitted as', lastIngestedResult.metadata?.submission_type],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-3">
                          <dt className="w-28 shrink-0 text-ink-3">{k}</dt>
                          <dd className="min-w-0 break-words">{v}</dd>
                        </div>
                      ))}
                      <div className="flex gap-3 sm:col-span-2">
                        <dt className="w-28 shrink-0 text-ink-3">ID</dt>
                        <dd className="min-w-0 break-all font-mono text-[12.5px] text-ink-2">{lastIngestedResult.id}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <pre className="code-block max-h-[360px]">{JSON.stringify(lastIngestedResult, null, 2)}</pre>
                ))}

              {batchResults.length > 0 &&
                (activeViewMode === 'pretty' ? (
                  <div>
                    <p className="mb-3 text-[13px] text-ink-3">Showing the first {batchResults.length} imported rows.</p>
                    <ul className="divide-y divide-line border-y border-line">
                      {batchResults.map((record) => (
                        <li key={record.id} className="grid gap-1.5 py-4 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:gap-5">
                          <span className="font-mono text-[12px] leading-6 text-ink-3">row {record.metadata?.row_number ?? '—'}</span>
                          <p className="text-[14.5px] leading-relaxed">{record.content}</p>
                          <p className="text-[12.5px] leading-6 text-ink-3 sm:text-right">
                            {record.metadata?.file_name}
                            <span className="mx-1.5" aria-hidden>
                              ·
                            </span>
                            {new Date(record.timestamp).toLocaleTimeString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <pre className="code-block max-h-[480px]">{JSON.stringify(batchResults, null, 2)}</pre>
                ))}
            </div>

            <div className="flex flex-col gap-4 border-t border-line bg-paper/60 p-6 sm:flex-row sm:items-center sm:justify-between md:px-8">
              <p className="text-[14px] text-ink-2">Next, run clustering from your inbox to group this with everything else.</p>
              <Link href="/dashboard" className="btn btn-primary shrink-0">
                Go to inbox <ArrowRight className="arrow h-4 w-4" aria-hidden />
              </Link>
            </div>
          </section>
        )}
      </div>
    </ProtectedRoute>
  );
}
