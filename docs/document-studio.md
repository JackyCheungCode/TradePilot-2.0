# TradePilot Document Studio

## Scope

The first release supports quotation, pro forma invoice, sales contract, commercial invoice, packing list, and shipping instructions.

## Data sources

- Quotation: sales order and its enterprise/customer/product data.
- Pro forma invoice: sales order or an existing quotation document linked to that same order.
- Sales contract: sales order or an existing quotation document linked to that same order.
- Commercial invoice, packing list, shipping instructions: a sales order plus a specific shipment batch.

Shipment documents use the selected shipment's actual shipped quantities and shipment measurements. They must not substitute the original ordered quantity for the shipment quantity.

## Template model

Templates are stored in the existing `trade_document_templates.template_config` JSONB field. The free-canvas layout uses:

- `layoutEngine: free-canvas-v1`
- `pageSize`, `orientation`, and millimetre coordinate units
- An `elements` array with stable element IDs, element types, position, dimensions, typography, colors, and optional field bindings

Supported element types in this first implementation are text, field, table, image, and shape. Field bindings resolve against the document content, totals, and document metadata snapshots.

## Versioning and PDF

The existing trade-document creation API creates the document and initial version snapshot. When a user saves a canvas layout against a draft, the existing draft PATCH path creates a new document version and stores the submitted template configuration in that version's template snapshot. The PDF endpoint renders that immutable snapshot using the existing Cloudflare Browser PDF binding and archives the generated file in the existing private document bucket.

## Security and data integrity

- Browser reads use the authenticated Supabase client and owner-scoped RLS.
- Writes use the existing authenticated TradePilot trade-document API.
- No new database tables or destructive schema migrations are introduced.
- The Worker continues to enforce owner scope, document type/source policies, shipment ownership, and existing issue/review validation.
- PDF image rendering only permits approved same-project CRM asset URLs.
