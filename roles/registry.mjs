const definitions = [
  {
    id: 'product-owner', label: 'Product Owner',
    priorities: ['customer value', 'business impact', 'prioritization', 'delivery risk', 'learning'],
    questions: ['What problem are we solving?', 'Who benefits?', 'What evidence supports the decision?', 'What trade-off are we making?'],
    decisionCriteria: ['value', 'evidence', 'risk', 'reversibility']
  },
  {
    id: 'cto', label: 'CTO',
    priorities: ['architecture fitness', 'reliability', 'scalability', 'security', 'operational complexity', 'technical sustainability'],
    questions: ['Where is the architecture or reliability risk?', 'What is the migration cost?', 'Which trade-off affects operational sustainability?', 'What is reversible?'],
    decisionCriteria: ['reliability', 'security', 'scalability', 'migration risk', 'sustainability']
  }
];

export function createRoleRegistry(initial = definitions) {
  const roles = new Map();
  for (const role of initial) {
    if (!role?.id || !Array.isArray(role.priorities) || !Array.isArray(role.questions)) throw new Error('Role requires id, priorities and questions');
    if (roles.has(role.id)) throw new Error(`Role already registered: ${role.id}`);
    roles.set(role.id, Object.freeze({ ...role, priorities:[...role.priorities], questions:[...role.questions], decisionCriteria:[...(role.decisionCriteria || [])] }));
  }
  return { get: id => roles.get(id) || null, list: () => [...roles.values()] };
}

export const roleRegistry = createRoleRegistry();
