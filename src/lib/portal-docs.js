// Per-portal deep links to the authoritative API documentation. Used by the
// PortalDetail header so admins can jump straight to the section they need
// without hunting through the provider's docs site.
//
// Keep this file flat and dumb on purpose — it's a reference table, not logic.
// Add a new portal by appending a key; add a new section by appending an entry.

export const PORTAL_DOCS = {
  symfonie: {
    home: 'https://projects.moravia.com/api/help',
    sections: [
      { label: 'Authentication',  url: 'https://projects.moravia.com/api/help/authentication' },
      { label: 'Tasks',           url: 'https://projects.moravia.com/api/help/tasks' },
      { label: 'Attachments',     url: 'https://projects.moravia.com/api/help/attachments' },
      { label: 'Webhooks',        url: 'https://projects.moravia.com/api/help/webhooks' },
    ],
  },
  junction: {
    home: 'https://welocalizetalent.zendesk.com/hc/en-us/categories/16317937007511',
    sections: [
      { label: 'Authentication',  url: 'https://welocalizetalent.zendesk.com/hc/en-us/articles/16318011540375' },
      { label: 'Offers',          url: 'https://welocalizetalent.zendesk.com/hc/en-us/articles/16318074466455' },
      { label: 'Tasks & assets',  url: 'https://welocalizetalent.zendesk.com/hc/en-us/articles/16318106210199' },
    ],
  },
  globallink: {
    home: 'https://docs.translations.com/pd/',
    sections: [
      { label: 'Authentication',     url: 'https://docs.translations.com/pd/#authentication' },
      { label: 'Submission lookup',  url: 'https://docs.translations.com/pd/#submission-search' },
      { label: 'Claim chain',        url: 'https://docs.translations.com/pd/#task-claim' },
    ],
  },
};

// Fallback used when a connector has only the generic `docs_url` set on the
// Portal entity and no entry in the table above.
export function getDocsForPortal(portal) {
  if (!portal) return null;
  const fromTable = PORTAL_DOCS[portal.key];
  if (fromTable) return fromTable;
  if (portal.docs_url) {
    return { home: portal.docs_url, sections: [] };
  }
  return null;
}