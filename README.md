# DS Diag

A lightweight browser-based diagnostic to assess design system maturity against operational pressure.

## What It Does

- Runs a 3-step guided questionnaire:
  - Operational context
  - Structural maturity
  - Results and recommendations
- Calculates:
  - `OPI` (Operational Pressure Index)
  - `SSI` (Structural Strength Index)
  - `Adequacy Gap` (`SSI - OPI`)
- Flags risk patterns (for example, governance lag under higher AI velocity)
- Generates practical guidance based on weak dimensions
- Supports report actions:
  - Download JSON report
  - Copy summary to clipboard
- Persists form state in `localStorage`

## Tech Stack

- Plain HTML/CSS/JavaScript modules
- [Chart.js](https://www.chartjs.org/) via CDN for result visualization

## Project Structure

```text
.
├── index.html          # App shell
├── styles.css          # UI styling
├── app.js              # Wizard flow, state, rendering, report actions
├── questionnaire.js    # Question definitions and scoring labels
├── scoring.js          # Scoring engine and risk classification
└── report.js           # Summary/insight/guidance generators
```

## Run Locally

Because this project uses ES modules, run it from a local HTTP server (not `file://`).

### Option 1: Python

```bash
cd /ProjectFolder
python3 -m http.server 8000
```

Open: `http://localhost:8000`

### Option 2: Node

```bash
npx serve /ProjectFolder
```

## Scoring Notes

- Structural maturity answers are normalized from `0-3` to `0-100`.
- Context pressure answers are normalized from `1-4` to `0-100`.
- `SSI` is the average of dimension maturity scores.
- `OPI` is a weighted combination of context factors.
- `Adequacy Gap` is `SSI - OPI`.

## GitHub Repo Setup

This project is connected to:

- Remote: `origin`
- URL: `https://github.com/m5rc238/ds-diag.git`
- Default branch: `main`

