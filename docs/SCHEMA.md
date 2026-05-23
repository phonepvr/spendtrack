# Spendtrack export format

Your data is yours. This document describes the JSON you get when you tap **Export JSON backup** in Settings, so that if Spendtrack itself ever disappears you can still recover your records with nothing but a text editor and basic scripting.

## Top-level structure

```json
{
  "format": "spendtrack/v1",
  "exportedAt": 1747958400000,
  "expenses": [ /* Expense objects */ ],
  "settlements": [ /* Settlement objects */ ],
  "yjsUpdate": "<base64-encoded CRDT state>"
}
```

| Field | Type | Meaning |
|---|---|---|
| `format` | string | Always `"spendtrack/v1"` for files produced by this app version. Future versions will bump this. |
| `exportedAt` | number | Unix epoch in milliseconds when the export was created. |
| `expenses` | array | Plain-record copy of every expense in the document. See below. |
| `settlements` | array | Plain-record copy of every settlement. See below. |
| `yjsUpdate` | string | Base64-encoded Yjs CRDT state. Allows lossless re-import including merge history. Safe to ignore if you only want the human-readable data. |

The plain-record arrays are redundant with `yjsUpdate` — they exist so you can read the data without a Yjs library. On re-import, the **Merge (Yjs CRDT)** mode uses `yjsUpdate` for a conflict-free merge; the other modes use the plain records.

## Expense object

```json
{
  "id": "f3c91b...",
  "amount": 1250.5,
  "currency": "INR",
  "description": "Groceries at Foodhall",
  "payer": "A",
  "date": "2026-05-12",
  "category": "groceries",
  "splitMode": "equal",
  "shares": { "A": 0.5, "B": 0.5 },
  "createdAt": 1747000000000,
  "updatedAt": 1747000123000
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable unique identifier (UUID v4 in current builds). |
| `amount` | number | Positive amount in the currency's standard unit (rupees, not paise). |
| `currency` | `"INR" \| "USD" \| "EUR"` | Currency code. |
| `description` | string | User-entered free text. |
| `payer` | `"A" \| "B"` | Who paid the bill. |
| `date` | string | `YYYY-MM-DD`. |
| `category` | string | One of `food`, `rent`, `travel`, `utilities`, `groceries`, `other`. |
| `splitMode` | `"equal" \| "custom"` | How `shares` was determined. |
| `shares` | `{ A: number, B: number }` | Fractions summing to 1.0 indicating each side's share of the cost. |
| `createdAt` | number | Unix epoch ms. |
| `updatedAt` | number | Unix epoch ms. |

## Settlement object

```json
{
  "id": "9a4e2c...",
  "amount": 500,
  "currency": "INR",
  "from": "B",
  "to": "A",
  "date": "2026-05-20",
  "note": "Venmo'd",
  "createdAt": 1747500000000,
  "updatedAt": 1747500000000
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable unique identifier. |
| `amount` | number | Positive amount transferred. |
| `currency` | `"INR" \| "USD" \| "EUR"` | Currency code. |
| `from` | `"A" \| "B"` | Side that paid out. |
| `to` | `"A" \| "B"` | Side that received. |
| `date` | string | `YYYY-MM-DD`. |
| `note` | string | Free-text memo. |
| `createdAt` | number | Unix epoch ms. |
| `updatedAt` | number | Unix epoch ms. |

## Computing the balance manually

If you want to reconstruct who-owes-whom from a single export without running the app:

1. For each expense, compute `share_owed_by_partner = amount * shares[partner]`. The payer is owed that amount by the partner.
2. Sum across expenses to get a running net (positive = partner owes you, negative = you owe partner).
3. Subtract settlements where `from == you, to == partner`, and add settlements where `from == partner, to == you`.

The remaining number, in `primaryCurrency`, is the net balance. Spendtrack does this in `src/lib/balance.ts` if you want a reference implementation.

## Migrating to another tool

The plain-record arrays are stable enough to feed into a spreadsheet:

- Pipe `.expenses` through `jq -r` to produce a CSV row per expense.
- The CRDT state in `yjsUpdate` is only meaningful if you intend to merge two exports with overlapping edits. For a one-time migration, the plain records are sufficient.

## Version stability

The `"spendtrack/v1"` format is a stable contract for the lifetime of major version 1 of the app. Any breaking change to the field set will ship under a new `format` string and the app will continue to read old exports.
