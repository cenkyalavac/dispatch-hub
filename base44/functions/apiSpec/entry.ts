// Minimal API spec endpoint — describes the BMS Integration API in JSON form.
// Public (no auth) so integrators can discover endpoints.
Deno.serve(async () => {
  const spec = {
    name: 'Dispatch Hub — BMS Integration API',
    version: '1.0.0-faz1',
    auth: {
      scheme: 'Apikey',
      header: 'Authorization: Apikey <token>',
      bearer_accepted: true,
    },
    states: ['accepted', 'synchronized', 'delivered', 'failed_to_sync'],
    endpoints: [
      {
        name: 'List projects',
        function: 'apiProjectsList',
        scope: 'read:projects',
        body: { state: 'accepted | synchronized | delivered | failed_to_sync', limit: 'number (<=500)' },
        returns: '{ count, projects: [] }',
      },
      {
        name: 'Get project',
        function: 'apiProjectsGet',
        scope: 'read:projects',
        body: { id: 'string' },
        returns: '{ project: { origin, destination, ... } }',
      },
      {
        name: 'Acknowledge project',
        function: 'apiProjectsAcknowledge',
        scope: 'write:projects',
        body: { id: 'string' },
        effect: 'state: accepted -> synchronized; emits project.synchronized webhook',
      },
      {
        name: 'Deliver project',
        function: 'apiProjectsDeliver',
        scope: 'write:projects',
        body: { id: 'string' },
        effect: 'state: synchronized -> delivered; emits project.delivered webhook',
      },
    ],
    webhooks: {
      events: ['project.accepted', 'project.synchronized', 'project.delivered', 'project.failed_to_sync'],
      signing: 'X-Dispatch-Signature: sha256=<HMAC of raw body using subscription.secret>',
      delivery_log: 'WebhookDelivery entity',
    },
    notes: [
      'Faz 1 returns origin == destination (identity mapping). Mapping layer arrives in Faz 2.',
      'Multi-tenant ready: every record is scoped by tenant_id. Default tenant is "default".',
    ],
  };
  return Response.json(spec);
});