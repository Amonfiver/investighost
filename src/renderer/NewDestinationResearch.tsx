import { useState } from 'react'
import type { DestinationBatchImportResult } from '@shared/factory-batch-contracts'
import { validateBatchFile } from './factory-presentation'

/** The single-destination entry point intentionally creates a batch of one. */
export function NewDestinationResearch({ onCreated }: { onCreated: (batchId: string) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('España')
  const [region, setRegion] = useState('')
  const [perDestination, setPerDestination] = useState('')
  const [perBatch, setPerBatch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'single' | 'json'>('single')
  const [imported, setImported] = useState<DestinationBatchImportResult | null>(null)
  const create = async () => {
    setBusy(true); setError(null)
    try {
      const batch: Record<string, unknown> = { name: `Investigación · ${name.trim()}` }
      if (perDestination.trim()) batch.maxCostPerDestination = Number(perDestination)
      if (perBatch.trim()) batch.maxCostPerBatch = Number(perBatch)
      const result: DestinationBatchImportResult = await window.electronAPI.importDestinationBatchJson(JSON.stringify({ batch, destinations: [{ name, country, ...(region.trim() ? { region } : {}) }] }))
      await window.electronAPI.startDestinationBatch(result.batch.id)
      onCreated(result.batch.id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
  }
  const importJson = async (file: File | undefined) => { if (!file) return; const invalid = validateBatchFile(file); if (invalid) { setError(invalid); return }; setBusy(true); setError(null); try { setImported(await window.electronAPI.importDestinationBatchJson(await file.text())) } catch { setError('Este archivo no contiene un lote compatible.') } finally { setBusy(false) } }
  const startImported = async () => { if (!imported) return; setBusy(true); try { await window.electronAPI.startDestinationBatch(imported.batch.id); onCreated(imported.batch.id) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) } }
  return <section className="new-layout" aria-label="Nueva investigación de destino">
    <div className="section-heading"><div><span className="card-kicker">INVESTIGHOST</span><h2>¿Qué quieres investigar?</h2></div></div>
    {error && <div className="alert error"><strong>No se pudo iniciar.</strong><span>{error}</span></div>}
    <div className="review-tabs"><button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>Destino individual</button><button className={mode === 'json' ? 'active' : ''} onClick={() => setMode('json')}>Lote</button></div>
    {mode === 'single' ? <section className="form-card"><label className="field"><span>Destino</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Granada" /></label><div className="form-grid"><label className="field"><span>País</span><input value={country} onChange={event => setCountry(event.target.value)} /></label><label className="field"><span>Región</span><input value={region} onChange={event => setRegion(event.target.value)} placeholder="Andalucía" /></label></div><details><summary>Opciones avanzadas</summary><div className="form-grid"><label className="field"><span>Presupuesto por destino (EUR)</span><input type="number" min="0" value={perDestination} onChange={event => setPerDestination(event.target.value)} /></label><label className="field"><span>Presupuesto lote (EUR)</span><input type="number" min="0" value={perBatch} onChange={event => setPerBatch(event.target.value)} /></label></div></details><button className="button primary" disabled={busy || !name.trim() || !country.trim()} onClick={() => { void create() }}>Iniciar producción</button></section> : <section className="form-card"><h3>Cargar lote</h3><label className="field"><span>Archivo de lote (.json)</span><input type="file" accept=".json,application/json" disabled={busy} onChange={event => { void importJson(event.currentTarget.files?.[0]) }} /></label>{imported && <><p><strong>{imported.batch.name}</strong> · {imported.batch.totalItems} destinos · {imported.batch.newItems} nuevos · {imported.batch.existingItems + imported.batch.reusableItems} reutilizables · {imported.batch.ambiguousItems + imported.batch.invalidItems} incidencias</p><button className="button primary" disabled={busy} onClick={() => { void startImported() }}>Iniciar producción</button></>}</section>}
  </section>
}
