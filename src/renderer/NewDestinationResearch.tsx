import { useState } from 'react'
import type { DestinationBatchImportResult } from '@shared/factory-batch-contracts'

/** The single-destination entry point intentionally creates a batch of one. */
export function NewDestinationResearch({ onCreated }: { onCreated: (batchId: string) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('España')
  const [region, setRegion] = useState('')
  const [perDestination, setPerDestination] = useState('')
  const [perBatch, setPerBatch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  return <section className="new-layout" aria-label="Nueva investigación de destino">
    <div className="section-heading"><div><span className="card-kicker">CONTENT FACTORY</span><h2>Nueva investigación</h2><p>Un destino individual usa el mismo batch/job durable que un lote JSON.</p></div></div>
    {error && <div className="alert error"><strong>No se pudo iniciar.</strong><span>{error}</span></div>}
    <section className="form-card"><h3>Destino individual</h3><label className="field"><span>Destino</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Granada" /></label><div className="form-grid"><label className="field"><span>País</span><input value={country} onChange={event => setCountry(event.target.value)} /></label><label className="field"><span>Región</span><input value={region} onChange={event => setRegion(event.target.value)} placeholder="Andalucía" /></label></div><div className="form-grid"><label className="field"><span>Presupuesto por destino (EUR)</span><input type="number" min="0" value={perDestination} onChange={event => setPerDestination(event.target.value)} /></label><label className="field"><span>Presupuesto lote (EUR)</span><input type="number" min="0" value={perBatch} onChange={event => setPerBatch(event.target.value)} /></label></div><button className="button primary" disabled={busy || !name.trim() || !country.trim()} onClick={() => { void create() }}>Iniciar producción</button></section>
    <section className="panel-card"><span className="card-kicker">O BIEN</span><h3>Lote JSON</h3><p>Importa un archivo con hasta 50 destinos desde Lotes de destinos; allí se muestra el resumen y se inicia el lote.</p><button className="button secondary" onClick={() => onCreated('')}>Ir a lotes de destinos</button></section>
  </section>
}
