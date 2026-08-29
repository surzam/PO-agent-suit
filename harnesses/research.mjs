import fs from 'node:fs/promises';

// Adapter only: source collection, validation, model calls and legacy
// generation behavior remain inside research/service.mjs.
export function createResearchHarness({ researchService, artifactStore }) {
  if (!researchService?.briefTurn || !researchService?.start || !researchService?.wait) throw new Error('Legacy Research service does not implement the required public contract');
  if (!artifactStore?.artifact) throw new Error('Legacy Research artifact store is required');

  return {
    id: 'research',
    version: 1,
    consumes: ['ResearchRequested'],
    produces: ['EvidenceCollected', 'ResearchCompleted'],
    inputs: ['Brief'],
    outputs: ['EvidenceSet'],
    async execute({ run, artifacts, config = {}, observe = async () => {} }) {
      const brief = artifacts.find(item => item.type === 'Brief');
      const intent = artifacts.find(item => item.type === 'Intent');
      if (!brief) throw new Error('Research Harness requires a Brief artifact');
      const sessionId = `runtime-${run.id}`;
      const started = researchService.start({ sessionId, origin:'user', mode:'deep', brief:brief.data, temperature:config.temperature, style:config.style, observe, researchOnly:true });
      const finished = await researchService.wait(started.generationId);
      if (finished.state === 'needs-context') {
        const cause=finished.failureCause || 'insufficient-context';
        return { events:[{type:'ResearchContextRequired',payload:{cause,requiredContext:finished.requiredContext || [],canAddSource:['insufficient-context','no-supporting-evidence'].includes(cause),message:finished.error}}], halt:{status:'needs-context',cause} };
      }
      if (finished.state !== 'complete') throw Object.assign(new Error(finished.error || `Legacy Research завершился в состоянии ${finished.state}`),{code:finished.failureCause || 'RESEARCH_FAILED'});
      const item = artifactStore.artifact(started.generationId, 'research');
      const research = finished.research || (item ? JSON.parse(await fs.readFile(item.file,'utf8')) : null);
      if (!research) throw new Error('Legacy Research завершился без research result');
      const evidence = Array.isArray(research.evidence) ? research.evidence : [];
      return {
        artifacts: [{ type: 'EvidenceSet', data: {
          runId: run.id,
          briefArtifactId: brief.id,
          intentArtifactId: intent?.id || brief.data.intentArtifactId || null,
          items: evidence,
          summary: `Legacy Research собрал ${evidence.length} Evidence из ${new Set(evidence.map(item => item.sourceUri)).size} источников.`,
          metadata: { legacyGenerationId: started.generationId, conflicts: research.conflicts || [], unknowns: research.unknowns || [], needs: research.needs || [], sourceStats: research.sourceStats || {}, sourceCalls: research.sourceCalls || [] }
        } }],
        events: [
          { type: 'EvidenceCollected', payload: { count: evidence.length, evidenceIds:evidence.map(item=>item.id), sourceCount:new Set(evidence.map(item=>item.sourceUri)).size, sources:[...new Map(evidence.map(item=>[item.sourceId || item.sourceUri,{ sourceId:item.sourceId || item.sourceUri, sourceKind:item.sourceKind, safeDisplayName:item.sourceTitle, evidenceIds:[item.id] }])).values()] } },
          { type: 'ResearchCompleted', payload: { legacyGenerationId: started.generationId } }
        ]
      };
    }
  };
}
