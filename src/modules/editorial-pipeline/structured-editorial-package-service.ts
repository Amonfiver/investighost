import type { SupabaseGenericDurableExecutionRepository } from '@modules/real-pipeline/generic-durable-execution-repository'
import {
  StructuredEditorialPackageV1Schema,
  type AdventurePackageV1,
  type StudentDocumentV1,
  type StructuredEditorialPackageV1,
  type VisualIntent,
} from '@shared/structured-editorial-package-contracts'

export interface StructuredEditorialCompositionInput {
  package: StructuredEditorialPackageV1
  /** The one durable research artifact consumed by both editorial profiles. */
  masterKnowledgeArtifactId: string
}

export interface StructuredEditorialComposer {
  composeStudent(input: { masterKnowledgeArtifactId: string }): Promise<StudentDocumentV1>
  composeAdventure(input: { masterKnowledgeArtifactId: string }): Promise<AdventurePackageV1>
  composeVisualIntents(input: { masterKnowledgeArtifactId: string }): Promise<VisualIntent[]>
}

/**
 * This boundary deliberately accepts completed editorial composition from a
 * future routed generator. It validates that all products name the same
 * durable corpus, but makes no provider call and contains no destination copy.
 */
export function composeStructuredEditorialPackage(input: StructuredEditorialCompositionInput): StructuredEditorialPackageV1 {
  if (!input.masterKnowledgeArtifactId.trim()) throw new Error('MASTER_KNOWLEDGE_ARTIFACT_REQUIRED')
  return StructuredEditorialPackageV1Schema.parse(input.package)
}

/** Append-only structured snapshots live with the existing execution and
 * point at the Library revisions already responsible for approval/history. */
export class StructuredEditorialPackageArtifactService {
  constructor(private readonly repository: Pick<SupabaseGenericDurableExecutionRepository, 'latestArtifact' | 'appendArtifact'>) {}

  async save(executionId: string, packageInput: StructuredEditorialPackageV1): Promise<{ version: number; package: StructuredEditorialPackageV1 }> {
    const packageValue = StructuredEditorialPackageV1Schema.parse(packageInput)
    const existing = await this.repository.latestArtifact(executionId, 'editorial_package', 'structured/v1')
    const nextVersion = (existing?.version ?? 0) + 1
    await this.repository.appendArtifact(executionId, 'editorial_package', 'structured/v1', nextVersion, packageValue)
    return { version: nextVersion, package: packageValue }
  }

  async loadCurrent(executionId: string): Promise<StructuredEditorialPackageV1 | null> {
    const artifact = await this.repository.latestArtifact(executionId, 'editorial_package', 'structured/v1')
    return artifact ? StructuredEditorialPackageV1Schema.parse(artifact.payload) : null
  }
}
